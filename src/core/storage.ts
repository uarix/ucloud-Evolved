import { CONSTANTS } from "../constants";

export interface DeletedHomeworkRecord {
  id: string;
  data: unknown;
  deletedAt: string;
}

export interface StoredCourseInfo {
  siteId?: string | null;
  name?: string | null;
  teachers?: string | null;
  __ts?: number;
  [key: string]: unknown;
}

export class Storage {
  private static gmKey(key: string): string {
    return `zzxw:${key}`;
  }

  static get<T = unknown>(key: string, defaultValue?: T): T | undefined {
    return GM_getValue<T | undefined>(this.gmKey(key), defaultValue as T | undefined);
  }

  static set<T = unknown>(key: string, value: T): void {
    GM_setValue(this.gmKey(key), value as unknown as never);
  }

  static getDeletedHomeworks(): DeletedHomeworkRecord[] {
    return this.get<DeletedHomeworkRecord[]>("deletedHomeworks", []) ?? [];
  }

  static addDeletedHomework(assignmentId: string, assignmentData: unknown): void {
    const deleted = this.getDeletedHomeworks();
    const existingIndex = deleted.findIndex((item) => item.id === assignmentId);

    if (existingIndex === -1) {
      deleted.push({
        id: assignmentId,
        data: assignmentData,
        deletedAt: new Date().toISOString(),
      });
      this.set("deletedHomeworks", deleted);
    }
  }

  static removeDeletedHomework(assignmentId: string): void {
    const deleted = this.getDeletedHomeworks();
    const filtered = deleted.filter((item) => item.id !== assignmentId);
    this.set("deletedHomeworks", filtered);
  }

  static isHomeworkDeleted(assignmentId: string): boolean {
    const deleted = this.getDeletedHomeworks();
    return deleted.some((item) => item.id === assignmentId);
  }

  static clearDeletedHomeworks(): void {
    this.set("deletedHomeworks", []);
  }

  static getCourseInfo(taskId: string): StoredCourseInfo | null {
    const key = `course_task:${taskId}`;
    const value = this.get<StoredCourseInfo | null>(key);
    if (!value || typeof value !== "object") return value ?? null;
    const ts = value.__ts ?? 0;
    if (ts && Date.now() - ts > CONSTANTS.CACHE.COURSE_INFO_TTL_MS) {
      this.set(key, null);
      return null;
    }
    return value;
  }

  static setCourseInfo(taskId: string, value: StoredCourseInfo | null): void {
    const payload =
      value && typeof value === "object"
        ? { ...value, __ts: value.__ts ?? Date.now() }
        : value;
    this.set(`course_task:${taskId}`, payload);
  }
}
