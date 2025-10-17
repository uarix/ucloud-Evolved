let showMoreNotifications = Boolean(
  GM_getValue("notification_showMoreNotification", true)
);

GM_addValueChangeListener(
  "notification_showMoreNotification",
  (_key, _oldValue, newValue) => {
    showMoreNotifications = Boolean(newValue);
  }
);

function bumpSizeParam(url: string, size: number): string {
  try {
    const urlObj = new URL(url, location.href);
    urlObj.searchParams.set("size", String(size));
    return urlObj.toString();
  } catch (_error) {
    if (/([?&])size=\d+/.test(url)) {
      return url.replace(/([?&])size=\d+/, `$1size=${size}`);
    }
    return url + (url.includes("?") ? `&size=${size}` : `?size=${size}`);
  }
}

function adjustNotificationUrl(rawUrl: string, method: string = "GET"): string {
  if (!showMoreNotifications) return rawUrl;
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod !== "GET") return rawUrl;

  if (rawUrl.includes("/ykt-basics/api/inform/news/list")) {
    return bumpSizeParam(rawUrl, 1000);
  }
  if (rawUrl.includes("/ykt-site/site/list/student/history")) {
    return bumpSizeParam(rawUrl, 15);
  }
  return rawUrl;
}

function interceptXHR(): void {
  const prototype = XMLHttpRequest.prototype as XMLHttpRequest & {
    __UEP_openPatched?: boolean;
  };
  if (prototype.__UEP_openPatched) return;

  const originalOpen = prototype.open;

  prototype.open = function newOpen(
    method: string,
    url: string,
    async?: boolean,
    user?: string | null,
    password?: string | null
  ) {
    const adjustedUrl = adjustNotificationUrl(url, method);
    return originalOpen.call(this, method, adjustedUrl, async, user, password);
  };
  Object.defineProperty(prototype, "__UEP_openPatched", {
    value: true,
    configurable: false,
  });
}

type FetchWithFlag = typeof window.fetch & { __UEP_patched?: boolean };

const isRequestLike = (value: unknown): value is { url: string; method?: string } =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { url?: unknown }).url === "string";

function interceptFetch(): void {
  if (typeof window.fetch !== "function") return;
  const fetchFn = window.fetch as FetchWithFlag;
  if (fetchFn.__UEP_patched) return;

  const originalFetch = window.fetch.bind(window);
  const patchedFetch: typeof window.fetch = (input, init) => {
    try {
      let urlStr: string | null = null;
      let method = "GET";

      if (typeof input === "string" || input instanceof URL) {
        urlStr = String(input);
        if (init?.method) method = init.method.toUpperCase();
      } else if (input instanceof Request) {
        urlStr = input.url;
        method = (input.method || "GET").toUpperCase();
      } else if (isRequestLike(input)) {
        const requestLike = input as { url: string; method?: string };
        urlStr = requestLike.url;
        method = (requestLike.method || init?.method || "GET").toUpperCase();
      } else {
        return originalFetch(input as RequestInfo, init);
      }

      if (method !== "GET" || !urlStr) {
        return originalFetch(input as RequestInfo, init);
      }

      const adjustedUrl = adjustNotificationUrl(urlStr, method);
      if (adjustedUrl === urlStr) {
        return originalFetch(input as RequestInfo, init);
      }

      if (input instanceof Request) {
        const baseHeaders = new Headers(input.headers);
        if (init?.headers) {
          new Headers(init.headers).forEach((value, key) => {
            baseHeaders.set(key, value);
          });
        }

        const requestInit: RequestInit = {
          method: input.method,
          headers: baseHeaders,
          credentials: input.credentials,
          cache: input.cache,
          redirect: input.redirect,
          referrer: input.referrer,
          referrerPolicy: input.referrerPolicy,
          integrity: input.integrity,
          keepalive: input.keepalive,
          mode: input.mode,
          signal: input.signal,
        };

        if (init && typeof init === "object") {
          Object.entries(init).forEach(([key, value]) => {
            if (key === "headers") return;
            (requestInit as Record<string, unknown>)[key] = value as unknown;
          });
        }

        return originalFetch(adjustedUrl, requestInit);
      }

      return originalFetch(adjustedUrl, init);
    } catch (_error) {
      return originalFetch(input as RequestInfo, init);
    }
  };

  (patchedFetch as FetchWithFlag).__UEP_patched = true;
  window.fetch = patchedFetch;
}

export function registerNotificationInterceptors(): void {
  interceptXHR();
  interceptFetch();
}
