let DEBUG = Boolean(GM_getValue("DEBUG", false));

const LOG_HISTORY = new Map<string, number>();
const LOG_DEFAULT_COOLDOWN = 4000;

function shouldLogMessage(key?: string, cooldown = LOG_DEFAULT_COOLDOWN) {
  if (!key) return true;
  const now = Date.now();
  const last = LOG_HISTORY.get(key) || 0;
  if (now - last >= cooldown) {
    LOG_HISTORY.set(key, now);
    if (LOG_HISTORY.size > 200) {
      const iterator = LOG_HISTORY.keys();
      const oldestKey = iterator.next().value;
      if (oldestKey) LOG_HISTORY.delete(oldestKey);
    }
    return true;
  }
  return false;
}

export const LOG = {
  debug: (...args: unknown[]) => {
    if (DEBUG) console.debug("[UEP]", ...args);
  },
  info: (...args: unknown[]) => console.info("[UEP]", ...args),
  warn: (...args: unknown[]) => console.warn("[UEP]", ...args),
  error: (...args: unknown[]) => console.error("[UEP]", ...args),
  warnThrottled: (key: string, ...args: unknown[]) => {
    if (shouldLogMessage(`warn:${key}`)) {
      console.warn("[UEP]", ...args);
    }
  },
  errorThrottled: (key: string, ...args: unknown[]) => {
    if (shouldLogMessage(`error:${key}`)) {
      console.error("[UEP]", ...args);
    }
  },
};

export const UEP_LOG = (...args: unknown[]) => {
  LOG.debug(...args);
};

export function setDebugFlag(enabled: boolean) {
  DEBUG = enabled;
}
