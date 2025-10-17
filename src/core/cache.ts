export interface CacheOptions {
  ttl?: number;
  maxSize?: number;
}

interface CacheEntry<T> {
  value: T;
  __ts: number;
}

export class Cache<T = unknown> {
  private readonly ttl: number;
  private readonly maxSize: number;
  private readonly store: Map<string, CacheEntry<T>>;

  constructor(options: CacheOptions = {}) {
    this.ttl = options.ttl ?? 30 * 60 * 1000;
    this.maxSize = options.maxSize ?? 300;
    this.store = new Map();
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    const isExpired = Date.now() - entry.__ts > this.ttl;
    if (isExpired) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      this.pruneLRU();
    }
    this.store.set(key, { value, __ts: Date.now() });
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  private pruneLRU(): void {
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    for (const [key, entry] of this.store.entries()) {
      if (entry.__ts < oldestTs) {
        oldestTs = entry.__ts;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.store.delete(oldestKey);
    }
  }
}
