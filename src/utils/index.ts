import { LOG } from "../core/logger";
import { RESOURCE_HASHES } from "../constants";

type ImmediateWindow = typeof window & {
  JSZip?: any;
  setImmediate?: any;
  clearImmediate?: any;
};

type ImmediateGlobal = typeof globalThis & {
  JSZip?: any;
  setImmediate?: any;
  clearImmediate?: any;
};

interface WaitOptions {
  timeout?: number;
  target?: Node;
  observerOptions?: MutationObserverInit;
  label?: string;
  onTimeout?: (error: Error) => void;
  logTimeout?: boolean;
}

class Utils {

  private static _jszipPromise: Promise<any> | null = null;
  private static _imageLightboxCleanup: (() => void) | null = null;

  static sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  static async wait<T>(
    predicate: () => T | Promise<T>,
    timeoutOrOptions?: number | WaitOptions
  ): Promise<T> {
    const options: WaitOptions =
      typeof timeoutOrOptions === "object" && timeoutOrOptions !== null
        ? timeoutOrOptions
        : {};

    const timeout =
      typeof timeoutOrOptions === "number"
        ? timeoutOrOptions
        : typeof options.timeout === "number"
        ? options.timeout
        : 10000;

    const defaultTarget = document.body || document.documentElement || document;
    const target = options.target instanceof Node ? options.target : defaultTarget;

    const defaultObserverOptions: MutationObserverInit = {
      childList: true,
      subtree: true,
    };
    const observerOptions =
      options.observerOptions && typeof options.observerOptions === "object"
        ? { ...defaultObserverOptions, ...options.observerOptions }
        : defaultObserverOptions;

    const label = options.label ?? "";
    const logTimeout = options.logTimeout ?? true;

    const evaluate = async () => {
      try {
        const value = predicate();
        return value instanceof Promise ? await value : value;
      } catch (_error) {
        return null;
      }
    };

    const immediate = await evaluate();
    if (immediate) return immediate;

    return new Promise<T>((resolve, reject) => {
      let settled = false;
      let timeoutTimer: number | null = null;
      let observer: MutationObserver | null = null;

      const cleanup = () => {
        if (timeoutTimer) window.clearTimeout(timeoutTimer);
        if (observer) observer.disconnect();
      };

      const finish = (result: T, isError = false) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (isError) reject(result);
        else resolve(result);
      };

      const check = () => {
        evaluate()
          .then((result) => {
            if (result) finish(result);
          })
          .catch(() => {
            // 忽略单次错误，等待后续 DOM 变更
          });
      };

      const observeTarget = target || defaultTarget;
      if (!(observeTarget instanceof Node)) {
        const error = new Error("Invalid observer target provided");
        finish(error as unknown as T, true);
        return;
      }

      observer = new MutationObserver(() => check());
      observer.observe(observeTarget, observerOptions);

      if (timeout > 0) {
        timeoutTimer = window.setTimeout(() => {
          const message = label ? `Wait timeout (${label})` : "Wait timeout";
          const error = new Error(message);
          if (logTimeout) {
            LOG.warn(message);
          }
          try {
            options.onTimeout?.(error);
          } catch (callbackError) {
            LOG.warn("wait() onTimeout callback failed:", callbackError);
          }
          finish(error as unknown as T, true);
        }, timeout);
      }

      // 初始检查，避免错过已经到位的元素
      check();
    });
  }


  static $x(xpath: string, context: Document | Element | DocumentFragment = document) {
    const iterator = document.evaluate(xpath, context, null, XPathResult.ANY_TYPE, null);
    const results: Node[] = [];
    let item: Node | null;
    while ((item = iterator.iterateNext())) {
      results.push(item);
    }
    return results;
  }

  static qs<T extends Element = Element>(
    selector: string,
    root: Document | Element | DocumentFragment = document
  ): T | null {
    try {
      return (root || document).querySelector<T>(selector);
    } catch (_error) {
      return null;
    }
  }

  static qsa<T extends Element = Element>(
    selector: string,
    root: Document | Element | DocumentFragment = document
  ): T[] {
    try {
      return Array.from((root || document).querySelectorAll<T>(selector));
    } catch (_error) {
      return [];
    }
  }

  static isVisible(node: Element | null) {
    if (!node || !(node instanceof Element)) return false;
    if (!node.isConnected) return false;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      const style = window.getComputedStyle(node);
      if (!style) return false;
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        parseFloat(style.opacity || "1") === 0
      ) {
        return false;
      }
    }
    return true;
  }

  static debounce<T extends (...args: any[]) => void>(func: T, wait: number) {
    let timeout: number | undefined;
    return function executedFunction(this: unknown, ...args: Parameters<T>) {
      const later = () => {
        if (timeout) clearTimeout(timeout);
        func.apply(this, args);
      };
      if (timeout) clearTimeout(timeout);
      timeout = window.setTimeout(later, wait);
    };
  }

  static async withRetry<T>(
    task: () => Promise<T>,
    attempts = 3,
    baseDelay = 200
  ) {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await task();
      } catch (error) {
        lastErr = error;
        if (i < attempts - 1) {
          await this.sleep(baseDelay * (i + 1));
        }
      }
    }
    throw lastErr;
  }

  static hashHue(input: unknown, min = 0, max = 360) {
    try {
      const str = String(input || "");
      let h = 0;
      for (let i = 0; i < str.length; i += 1) {
        h = (h << 5) - h + str.charCodeAt(i);
        h |= 0; // 32-bit int
      }
      h = Math.abs(h);
      const span = Math.max(1, max - min);
      return min + (h % span);
    } catch (_error) {
      return Math.floor(Math.random() * (max - min)) + min;
    }
  }

  static openTab(url: string, options: Tampermonkey.OpenTabOptions = {}) {
    const defaultOptions: Tampermonkey.OpenTabOptions = {
      active: true,
      insert: true,
      setParent: true,
    };
    const finalOptions = { ...defaultOptions, ...options };
    return GM_openInTab(url, finalOptions);
  }

  static hideImageLightbox() {
    if (typeof this._imageLightboxCleanup === "function") {
      const cleanup = this._imageLightboxCleanup;
      this._imageLightboxCleanup = null;
      try {
        cleanup();
      } catch (error) {
        LOG.debug("Image lightbox cleanup failed:", error);
      }
    }
  }

  static showImageLightbox(
    imageUrl: string,
    options: { onClose?: () => void } = {}
  ) {
    this.hideImageLightbox();
    if (!imageUrl) return null;

    const overlay = document.createElement("div");
    overlay.className = "uep-image-lightbox";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = "";
    img.draggable = false;
    overlay.appendChild(img);
    document.body.appendChild(overlay);

    const onClose = typeof options?.onClose === "function" ? options.onClose : null;

    const cleanup = () => {
      overlay.removeEventListener("click", cleanup);
      document.removeEventListener("keydown", onKeydown, true);
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      if (onClose) {
        try {
          onClose();
        } catch (error) {
          LOG.debug("Image lightbox onClose failed:", error);
        }
      }
      if (this._imageLightboxCleanup === cleanup) {
        this._imageLightboxCleanup = null;
      }
    };

    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cleanup();
      }
    };

    overlay.addEventListener("click", cleanup);
    document.addEventListener("keydown", onKeydown, true);

    requestAnimationFrame(() => overlay.classList.add("is-visible"));

    this._imageLightboxCleanup = cleanup;
    return cleanup;
  }

  static hasFileExtension(filename: string, extensions: readonly string[]) {
    const lower = filename.toLowerCase();
    return extensions.some((ext) => lower.endsWith(ext));
  }

  static sanitizeFilename(name: string) {
    if (!name) return "file";
    let result = String(name)
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim();

    result = result.replace(/_{2,}/g, "_");
    result = result.replace(/[. ]+$/g, "");

    const RESERVED = [
      "CON",
      "PRN",
      "AUX",
      "NUL",
      "COM1",
      "COM2",
      "COM3",
      "COM4",
      "COM5",
      "COM6",
      "COM7",
      "COM8",
      "COM9",
      "LPT1",
      "LPT2",
      "LPT3",
      "LPT4",
      "LPT5",
      "LPT6",
      "LPT7",
      "LPT8",
      "LPT9",
    ];
    const base = result.split(".")[0].toUpperCase();
    if (RESERVED.includes(base)) {
      result = `_${result}`;
    }

    if (result.length > 180) {
      const match = result.match(/(\.[^./]{1,10})$/);
      const ext = match ? match[1] : "";
      const prefix = result.slice(0, 180 - ext.length);
      result = prefix + ext;
    }

    return result || "file";
  }

  static sanitizePathSegment(seg: string) {
    return this.sanitizeFilename(seg).replace(/[\u0000-\u001f]/g, "").trim();
  }

  static joinPath(...parts: string[]) {
    return parts
      .filter(Boolean)
      .map((p) => this.sanitizePathSegment(p))
      .join("/");
  }

  static escapeHtml(input: unknown) {
    if (input == null) return "";
    return String(input)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  static normalizeText(input: unknown) {
    if (input == null) return "";
    return String(input).replace(/\s+/g, " ").trim().toLowerCase();
  }

  static parseDateFlexible(input: unknown) {
    try {
      if (input == null) return null;
      if (typeof input === "number") {
        const d = new Date(input);
        return Number.isNaN(d.getTime()) ? null : d;
      }
      if (typeof input === "string") {
        const t = input.trim();
        const normalized = t.includes("T") ? t : t.replace(/-/g, "/");
        const d = new Date(normalized);
        if (!Number.isNaN(d.getTime())) return d;
      }
      const d2 = new Date(input as any);
      return Number.isNaN(d2.getTime()) ? null : d2;
    } catch (_error) {
      return null;
    }
  }

  static toPathSegments(path: string) {
    if (!path) return [];
    return String(path)
      .split("/")
      .map((seg) => seg.trim())
      .filter(Boolean)
      .map((seg) => this.sanitizePathSegment(seg));
  }

  static encodePathSegments(segments: string[]) {
    return (segments || []).map((part) => encodeURIComponent(part)).join("/");
  }

  static formatBytes(bytes: number) {
    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const exponent = Math.min(
      Math.floor(Math.log(value) / Math.log(1024)),
      units.length - 1
    );
    const num = value / Math.pow(1024, exponent);
    return `${num.toFixed(num >= 100 ? 0 : num >= 10 ? 1 : 2)} ${units[exponent]}`;
  }

  static formatDateForFilename(date: Date | number | string = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return "unknown";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
      d.getHours()
    )}${pad(d.getMinutes())}`;
  }

  static async computeSHA256(text: string) {
    try {
      if (!window.crypto?.subtle || typeof TextEncoder !== "function") return null;
      const data = new TextEncoder().encode(text);
      const hash = await window.crypto.subtle.digest("SHA-256", data);
      const bytes = Array.from(new Uint8Array(hash));
      return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch (_error) {
      return null;
    }
  }

  static async verifyTextIntegrity(
    text: string,
    expectedHash: string | undefined,
    resourceName = ""
  ) {
    if (!expectedHash) return true;
    const actual = await this.computeSHA256(text);
    if (!actual) return true;
    if (actual !== expectedHash) {
      throw new Error(`${resourceName || "资源"}完整性校验失败`);
    }
    return true;
  }

  static async loadTextResource(name: string, expectedHash?: string) {
    if (typeof GM_getResourceText !== "function") {
      throw new Error("GM_getResourceText 不可用");
    }
    const content = GM_getResourceText(name);
    if (typeof content !== "string" || !content.length) {
      throw new Error(`未找到资源：${name}`);
    }
    await this.verifyTextIntegrity(content, expectedHash, name);
    return content;
  }

  static async ensureJSZip() {
    const win = window as ImmediateWindow;
    if (win.JSZip && typeof win.JSZip === "function") return win.JSZip;
    if (this._jszipPromise) return this._jszipPromise;

    const loadPromise = (async () => {
      const polyfillImmediate =
        typeof win.setImmediate === "function"
          ? win.setImmediate.bind(win)
          : (callback: (...args: unknown[]) => void, ...args: unknown[]) =>
              win.setTimeout(callback, 0, ...args);
      const polyfillClear =
        typeof win.clearImmediate === "function"
          ? win.clearImmediate.bind(win)
          : (handle: number) => win.clearTimeout(handle);

      const globalTarget =
        typeof globalThis !== "undefined" ? (globalThis as ImmediateGlobal) : win;

      const hasWindowImmediate = Object.prototype.hasOwnProperty.call(
        win,
        "setImmediate"
      );
      const hasWindowClearImmediate = Object.prototype.hasOwnProperty.call(
        win,
        "clearImmediate"
      );
      const hasGlobalImmediate = Object.prototype.hasOwnProperty.call(
        globalTarget,
        "setImmediate"
      );
      const hasGlobalClearImmediate = Object.prototype.hasOwnProperty.call(
        globalTarget,
        "clearImmediate"
      );

      const originalWindowImmediate = win.setImmediate;
      const originalWindowClear = win.clearImmediate;
      const originalGlobalImmediate = globalTarget.setImmediate;
      const originalGlobalClear = globalTarget.clearImmediate;

      if (typeof win.setImmediate !== "function") {
        win.setImmediate = polyfillImmediate;
      }
      if (typeof win.clearImmediate !== "function") {
        win.clearImmediate = polyfillClear;
      }
      if (globalTarget !== win) {
        if (typeof globalTarget.setImmediate !== "function") {
          globalTarget.setImmediate = polyfillImmediate;
        }
        if (typeof globalTarget.clearImmediate !== "function") {
          globalTarget.clearImmediate = polyfillClear;
        }
      }

      try {
        const source = await this.loadTextResource("JSZIP", RESOURCE_HASHES.JSZIP);
        const factory = new Function(
          "window",
          "global",
          "self",
          "setImmediate",
          "clearImmediate",
          `${source}; return window.JSZip || self.JSZip || global.JSZip;`
        );
        const jszip = factory(
          win,
          globalTarget,
          win,
          polyfillImmediate,
          polyfillClear
        );
        if (!jszip) {
          throw new Error("JSZip 加载失败");
        }
        return jszip;
      } finally {
        if (hasWindowImmediate) {
          win.setImmediate = originalWindowImmediate;
        } else {
          delete (win as ImmediateWindow).setImmediate;
        }
        if (hasWindowClearImmediate) {
          win.clearImmediate = originalWindowClear;
        } else {
          delete (win as ImmediateWindow).clearImmediate;
        }
        if (globalTarget !== win) {
          if (hasGlobalImmediate) {
            globalTarget.setImmediate = originalGlobalImmediate;
          } else {
            delete (globalTarget as ImmediateGlobal).setImmediate;
          }
          if (hasGlobalClearImmediate) {
            globalTarget.clearImmediate = originalGlobalClear;
          } else {
            delete (globalTarget as ImmediateGlobal).clearImmediate;
          }
        }
      }
    })();

    this._jszipPromise = loadPromise
      .then((result) => result)
      .catch((error) => {
        this._jszipPromise = null;
        throw error;
      });
    return this._jszipPromise;
  }
}

export { Utils };
