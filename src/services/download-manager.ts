import { LOG } from "../core/logger";
import { Utils } from "../utils";

type GmRequest = Tampermonkey.Request<any>;
type GmAbortHandle = Tampermonkey.AbortHandle<void>;

interface GmProgressEvent {
  loaded?: number;
  total?: number;
}

interface GmDownloadProgressEvent {
  loaded: number;
  total: number;
  lengthComputable: boolean;
}

interface GmDownloadError {
  error?: string;
  [key: string]: unknown;
}

interface GmDownloadOptions {
  url: string;
  name: string;
  saveAs?: boolean | string;
  onprogress?: (event: GmDownloadProgressEvent) => void;
  onload?: () => void;
  onerror?: (error: GmDownloadError) => void;
}

declare const NProgress: {
  configure?: (options: Record<string, unknown>) => void;
  start?: () => void;
  set?: (value: number) => void;
  inc?: (value?: number) => void;
  done?: () => void;
};

declare function GM_download(options: GmDownloadOptions): GmAbortHandle | undefined;

type DownloadProgressHandler = (loaded: number, total: number) => void;

interface FetchBinaryOptions {
  timeoutMs?: number;
  onProgress?: DownloadProgressHandler;
  retries?: number;
  retryDelay?: number;
  method?: string;
  headers?: HeadersInit;
  body?: BodyInit | null;
  credentials?: RequestCredentials;
  mode?: RequestMode;
}

interface ResetTransferOptions {
  keepDownloading?: boolean;
  skipFinishProgress?: boolean;
}

type ProgressController = {
  configure?: (options: Record<string, unknown>) => void;
  start?: () => void;
  set?: (value: number) => void;
  inc?: (value?: number) => void;
  done?: () => void;
};

type Abortable = { abort?: () => void };

export class DownloadManager {
  public downloading = false;
  private sumBytes = 0;
  private loadedBytes = 0;
  private controller: AbortController | null = null;
  private gmHandles: Set<Abortable> = new Set();
  private progress: ProgressController =
    typeof NProgress !== "undefined"
      ? NProgress
      : {
          configure: () => {},
          start: () => {},
          set: () => {},
          inc: () => {},
          done: () => {},
        };
  private taskQueue: Array<{
    run: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }> = [];
  private activeCount = 0;
  private concurrency = 1;

  ensureProgress(): ProgressController {
    if (typeof window !== "undefined") {
      const win = window as typeof window & { NProgress?: ProgressController };
      if (typeof win.NProgress === "object" && win.NProgress) {
        this.progress = win.NProgress;
      }
    }
    return this.progress;
  }

  setConcurrency(limit: number): void {
    if (!Number.isFinite(limit) || limit <= 0) {
      this.concurrency = 1;
    } else {
      this.concurrency = Math.floor(limit);
    }
    this.processQueue();
  }

  private enqueueTask<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.taskQueue.push({ run: task, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.activeCount >= this.concurrency) return;
    const next = this.taskQueue.shift();
    if (!next) return;

    this.activeCount += 1;
    next
      .run()
      .then((value) => next.resolve(value))
      .catch((error) => next.reject(error))
      .finally(() => {
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.processQueue();
      });
  }

  beginProgress(): void {
    const progress = this.ensureProgress();
    progress.configure?.({ trickle: false, speed: 0, showSpinner: false });
    progress.start?.();
    progress.set?.(0.08);
  }

  finishProgress(): void {
    this.ensureProgress().done?.();
  }

  resetTransferState(options: ResetTransferOptions = {}): void {
    const { keepDownloading = false, skipFinishProgress = false } = options;
    if (!keepDownloading) {
      this.downloading = false;
    }
    this.controller = null;
    this.sumBytes = 0;
    this.loadedBytes = 0;
    if (!skipFinishProgress) {
      this.finishProgress();
    }
  }

  async fetchBinary(url: string, options: FetchBinaryOptions = {}): Promise<ArrayBuffer> {
    const {
      timeoutMs,
      onProgress,
      retries = 3,
      retryDelay = 400,
      method,
      headers,
      body,
      credentials,
      mode,
    } = options;

    const normalizedMethod = (method ?? "GET").toUpperCase();
    const normalizedCredentials: RequestCredentials = credentials ?? "include";
    const normalizedMode: RequestMode = mode ?? "cors";
    const normalizedRetries = Math.max(1, retries);
    const normalizedRetryDelay = Math.max(0, retryDelay);

    const shouldSendCredentials = (): boolean => {
      if (normalizedCredentials === "include") return true;
      if (normalizedCredentials === "omit") return false;
      try {
        const target = new URL(url, location.href);
        return typeof location === "object" && target.origin === location.origin;
      } catch {
        return false;
      }
    };

    const toPlainHeaders = (input?: HeadersInit): Record<string, string> | undefined => {
      if (!input) return undefined;
      if (input instanceof Headers) {
        const result: Record<string, string> = {};
        input.forEach((value, key) => {
          result[key] = value;
        });
        return result;
      }
      if (Array.isArray(input)) {
        const result: Record<string, string> = {};
        input.forEach(([key, value]) => {
          result[key] = value;
        });
        return result;
      }
      return { ...(input as Record<string, string>) };
    };

    const plainHeaders = toPlainHeaders(headers);

    const reportProgress: DownloadProgressHandler = (loaded, total) => {
      if (typeof onProgress === "function") {
        onProgress(loaded, total);
      }
    };

    const attemptFetch = async (): Promise<ArrayBuffer> => {
      if (!this.downloading) throw new Error("下载已取消");

      if (typeof GM_xmlhttpRequest === "function") {
        let gmHandle: GmAbortHandle | undefined;
        try {
          return await new Promise<ArrayBuffer>((resolve, reject) => {
            try {
              const details: GmRequest = {
                url,
                method: normalizedMethod,
                responseType: "arraybuffer",
                withCredentials: shouldSendCredentials(),
                onprogress: (event: GmProgressEvent) => {
                  const loaded = event.loaded ?? 0;
                  const total = event.total ?? 0;
                  reportProgress(loaded, total);
                },
                onload: (response: Tampermonkey.Response<any>) => {
                  try {
                    if (response.status >= 200 && response.status < 300) {
                      let payload = response.response as ArrayBuffer | null | undefined;
                      if (payload == null) {
                        const text = response.responseText;
                        payload = text ? (JSON.parse(text) as ArrayBuffer) : null;
                      }
                      if (payload) {
                        resolve(payload as ArrayBuffer);
                        return;
                      }
                      reject(new Error("空响应"));
                      return;
                    }
                    reject(this.buildHttpError(response.status, response.statusText));
                  } catch (innerError) {
                    reject(innerError as Error);
                  }
                },
                onerror: (err) => reject(new Error(err?.error ?? "GM 请求失败")),
                ontimeout: () => reject(new Error("请求超时")),
                onabort: () => reject(new Error("下载已取消")),
              } as GmRequest;

              if (typeof timeoutMs === "number" && timeoutMs > 0) {
                (details as { timeout?: number }).timeout = timeoutMs;
              }
              if (plainHeaders) {
                details.headers = plainHeaders;
              }
              if (normalizedMethod !== "GET" && body != null) {
                (details as { data?: BodyInit }).data = body;
              }

              gmHandle = GM_xmlhttpRequest(details);
              if (gmHandle && typeof gmHandle.abort === "function") {
                this.gmHandles.add(gmHandle);
              }
            } catch (error) {
              reject(error as Error);
            }
          });
        } finally {
          if (gmHandle) {
            this.gmHandles.delete(gmHandle);
          }
        }
      }

      if (typeof fetch === "function") {
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        this.controller = controller;
        let timeoutHandle: number | undefined;

        try {
          if (controller && typeof timeoutMs === "number" && timeoutMs > 0) {
            timeoutHandle = window.setTimeout(() => controller.abort(), timeoutMs);
          }

          const fetchInit: RequestInit = {
            method: normalizedMethod,
            credentials: normalizedCredentials,
            mode: normalizedMode,
            signal: controller?.signal,
          };
          if (plainHeaders) {
            fetchInit.headers = new Headers(plainHeaders);
          }
          if (body != null && normalizedMethod !== "GET") {
            fetchInit.body = body;
          }

          const response = await fetch(url, fetchInit);
          if (!response.ok) {
            throw this.buildHttpError(response.status, response.statusText);
          }

          const contentLengthHeader = response.headers.get("content-length");
          const total = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
          if (Number.isFinite(total) && total > 0) {
            this.sumBytes = total;
          }

          if (!response.body || typeof response.body.getReader !== "function") {
            const blob = await response.blob();
            reportProgress(blob.size, blob.size);
            return await blob.arrayBuffer();
          }

          const reader = response.body.getReader();
          const chunks: Uint8Array[] = [];
          let loaded = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            if (!this.downloading) {
              if (typeof reader.cancel === "function") {
                try {
                  await reader.cancel();
                } catch {
                  // ignore cancellation errors
                }
              }
              throw new Error("下载已取消");
            }

            if (value) {
              chunks.push(value);
              loaded += value.length;
              reportProgress(loaded, total);
            }
          }

          const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
          const merged = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
          }
          return merged.buffer;
        } catch (error) {
          if (error instanceof Error && /取消/.test(error.message)) {
            throw error;
          }
          if (error instanceof DOMException && error.name === "AbortError") {
            throw new Error("下载已取消");
          }
          throw error;
        } finally {
          if (typeof timeoutHandle === "number") {
            window.clearTimeout(timeoutHandle);
          }
          if (controller && this.controller === controller) {
            this.controller = null;
          }
        }
      }

      throw new Error("GM_xmlhttpRequest unavailable");
    };

    let attempt = 0;
    let lastError: unknown = null;
    while (attempt < normalizedRetries) {
      try {
        return await attemptFetch();
      } catch (error) {
        lastError = error;
        const message =
          error instanceof Error ? error.message : error ? String(error) : "";
        if (message.includes("取消")) {
          throw error instanceof Error ? error : new Error(message);
        }
        attempt += 1;
        if (attempt >= normalizedRetries) {
          break;
        }
        await Utils.sleep(normalizedRetryDelay * attempt);
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error(lastError ? String(lastError) : "下载失败");
  }

  saveBlob(blob: Blob, filename: string): void {
    if (!(blob instanceof Blob)) {
      throw new Error("无效的文件数据");
    }

    const safeName = Utils.sanitizeFilename(filename) || "download.zip";
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement("a");
      link.href = url;
      link.download = safeName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async downloadViaGM(url: string, name: string, saveAs = false): Promise<void> {
    return this.enqueueTask(() => this.performDownloadViaGM(url, name, saveAs)) as Promise<void>;
  }

  async downloadFile(url: string, filename: string): Promise<void> {
    return this.enqueueTask(() => this.performDownloadFile(url, filename)) as Promise<void>;
  }

  private async performDownloadViaGM(url: string, name: string, saveAs: boolean): Promise<void> {
    if (typeof GM_download !== "function") {
      throw new Error("GM_download not available");
    }

    this.downloading = true;
    this.sumBytes = 0;
    this.loadedBytes = 0;
    this.beginProgress();

    await new Promise<void>((resolve, reject) => {
      const finalize = () => {
        this.resetTransferState();
      };

      let handle: GmAbortHandle | undefined;
      const options: GmDownloadOptions = {
        url,
        name,
        saveAs,
        onprogress: (event: GmDownloadProgressEvent) => {
          const progress = this.ensureProgress();
          if (event.lengthComputable && event.total > 0) {
            progress.set?.(Math.min(0.99, event.loaded / event.total));
          } else {
            progress.inc?.(0.04);
          }
        },
        onload: () => {
          if (handle && typeof handle.abort === "function") {
            this.gmHandles.delete(handle);
          }
          finalize();
          resolve();
        },
        onerror: async (e) => {
          if (handle && typeof handle.abort === "function") {
            this.gmHandles.delete(handle);
          }
          finalize();
          try {
            await this.performDownloadFile(url, name);
            resolve();
          } catch (err) {
            try {
              Utils.openTab(url, { active: true });
              resolve();
            } catch {
              const errorMessage =
                (e && "error" in e && typeof e.error === "string" && e.error) ||
                (err instanceof Error ? err.message : String(err ?? "下载失败"));
              reject(new Error(errorMessage));
            }
          }
        },
      };

      try {
        handle = GM_download(options);
        if (handle && typeof handle.abort === "function") {
          this.gmHandles.add(handle);
        }
      } catch (error) {
        finalize();
        reject(error as Error);
      }
    });
  }

  private async performDownloadFile(url: string, filename: string): Promise<void> {
    this.downloading = true;
    this.sumBytes = 0;
    this.loadedBytes = 0;
    this.beginProgress();

    try {
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      this.controller = controller;

      const response = await fetch(
        url,
        controller
          ? { signal: controller.signal, credentials: "include", mode: "cors" }
          : { credentials: "include", mode: "cors" }
      );
      if (!response.ok) {
        throw this.buildHttpError(response.status, response.statusText);
      }

      const contentLength = response.headers.get("content-length");
      if (contentLength) {
        const parsed = parseInt(contentLength, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          this.sumBytes = parsed;
        }
      }

      if (!response.body || typeof response.body.getReader !== "function") {
        const blob = await response.blob();
        this.saveBlob(blob, filename);
        return;
      }

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (!this.downloading) {
          if (typeof reader.cancel === "function") {
            try {
              await reader.cancel();
            } catch {
              // ignore cancellation errors
            }
          }
          return;
        }

        if (value) {
          chunks.push(value);
          this.loadedBytes += value.length;

          const progress = this.ensureProgress();
          if (this.sumBytes > 0) {
            progress.set?.(Math.min(0.99, this.loadedBytes / this.sumBytes));
          } else {
            progress.inc?.(0.04);
          }
        }
      }

      const blob = new Blob(chunks as BlobPart[]);
      this.saveBlob(blob, filename);
    } catch (error) {
      LOG.error("Download failed:", error);
      throw error;
    } finally {
      this.resetTransferState();
    }
  }

  cancel(): void {
    if (this.controller) {
      this.controller.abort();
    }
    for (const handle of this.gmHandles) {
      if (handle && typeof handle.abort === "function") {
        handle.abort();
      }
    }
    this.gmHandles.clear();
    const cancelError = new Error("下载已取消");
    this.taskQueue.forEach((task) => task.reject(cancelError));
    this.taskQueue = [];
    this.activeCount = 0;
    this.resetTransferState();
  }

  private buildHttpError(status: number, statusText: string): Error {
    return new Error(`HTTP ${status}: ${statusText || ""}`);
  }
}
