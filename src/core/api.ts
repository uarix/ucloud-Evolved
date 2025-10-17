import { CONSTANTS } from "../constants";
import { LOG } from "./logger";
import { Cache } from "./cache";
import { Storage, StoredCourseInfo } from "./storage";
import { Utils } from "../utils";

type TokenPair = [string | null, string | null];
type ApiRequestOptions = RequestInit & { timeoutMs?: number };

interface CourseTeacher {
  name?: string | null;
}

export interface RawCourse {
  id?: string | number;
  siteName?: string;
  teachers?: CourseTeacher[];
  [key: string]: unknown;
}

export interface CourseInfo {
  siteId?: string | null;
  name?: string;
  teachers?: string;
}

interface CourseHint {
  siteId?: string | number | null;
  courseId?: string | number | null;
  courseSiteId?: string | number | null;
  siteName?: string;
  courseName?: string;
  teachers?: string;
}

interface SearchCourseOptions {
  hints?: Record<string, CourseHint>;
}

export interface AssignmentSummary {
  activityId?: string | number;
  type?: number;
  title?: string;
  activityName?: string;
  siteId?: string | number;
  siteName?: string;
  courseInfo?: { siteId?: string | number | null; name?: string; teachers?: string };
  courseName?: string;
  teachers?: string;
  teacherName?: string;
  endTime?: string | number | Date;
  [key: string]: unknown;
}

export interface UndoneListResponse {
  data?: {
    undoneList?: AssignmentSummary[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface PreviewInfo {
  previewUrl: string;
  onlinePreview?: string;
}

interface ResourceItem {
  id: string;
  name: string;
  path: string;
}

type CourseTask = Record<string, unknown>;

type GmJsonRequest = Tampermonkey.Request<unknown>;
type GmJsonResponse = Tampermonkey.Response<unknown>;

export class API {
  private static _tokenCache: TokenPair | null = null;
  private static _tokenCacheAt = 0;
  private static _courseListCache: RawCourse[] | null = null;
  private static _courseListCacheAt = 0;
  private static _authWarned = false;

  private static _courseInfoCache = new Cache<CourseInfo>({
    ttl: CONSTANTS.CACHE.COURSE_INFO_TTL_MS,
    maxSize: CONSTANTS.CACHE.COURSE_INFO_CACHE_MAX,
  });
  private static _previewCache = new Cache<PreviewInfo>({
    ttl: CONSTANTS.CACHE.PREVIEW_URL_TTL_MS,
    maxSize: CONSTANTS.CACHE.PREVIEW_URL_CACHE_MAX,
  });
  private static _siteTaskCache = new Cache<unknown[]>({
    ttl: CONSTANTS.CACHE.COURSE_INFO_TTL_MS,
    maxSize: CONSTANTS.CACHE.COURSE_INFO_CACHE_MAX,
  });
  private static _undoneListCache = new Cache<UndoneListResponse>({
    ttl: 60 * 1000,
    maxSize: 2,
  });

  static getToken(): TokenPair {
    const now = Date.now();
    if (this._tokenCache && now - this._tokenCacheAt < 60_000) {
      return this._tokenCache;
    }

    const cookieMap = new Map<string, string>();
    try {
      const parts = (document.cookie || "").split(/;\s*/);
      parts.forEach((cookie) => {
        const idx = cookie.indexOf("=");
        if (idx > -1) {
          const key = cookie.slice(0, idx);
          let value = cookie.slice(idx + 1);
          try {
            value = decodeURIComponent(value);
          } catch {
            // keep raw value
          }
          if (key && value) cookieMap.set(key, value);
        }
      });
    } catch {
      // ignore cookie parsing errors
    }

    const uuid =
      cookieMap.get("iClass-uuid") ??
      localStorage.getItem("iClass-uuid") ??
      sessionStorage.getItem("iClass-uuid") ??
      cookieMap.get("userId") ??
      localStorage.getItem("userId") ??
      sessionStorage.getItem("userId") ??
      null;

    const token =
      cookieMap.get("blade-auth") ??
      cookieMap.get("Blade-Auth") ??
      cookieMap.get("iClass-token") ??
      localStorage.getItem("iClass-token") ??
      localStorage.getItem("token") ??
      localStorage.getItem("blade-auth") ??
      localStorage.getItem("Blade-Auth") ??
      sessionStorage.getItem("iClass-token") ??
      sessionStorage.getItem("token") ??
      sessionStorage.getItem("blade-auth") ??
      sessionStorage.getItem("Blade-Auth") ??
      null;

    if (!token) {
      LOG.warn("Missing auth token for API calls");
    }

    this._tokenCache = [uuid, token];
    this._tokenCacheAt = Date.now();
    return this._tokenCache;
  }

  private static _normalizeBladeToken(token: string | null | undefined): string | null {
    try {
      const value = String(token ?? "").trim();
      if (!value) return value || null;
      if (/^bearer\s+/i.test(value)) return value;
      if ((value.match(/\./g) || []).length >= 2) return `bearer ${value}`;
      return value;
    } catch {
      return token ?? null;
    }
  }

  static async request(url: string, options: ApiRequestOptions = {}): Promise<unknown> {
    const [, token] = this.getToken();
    const method = (options.method ?? "GET").toUpperCase();

    const defaultHeaders = new Headers({
      authorization: "Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=",
      "blade-auth": this._normalizeBladeToken(token) ?? "",
    });

    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      defaultHeaders.set("content-type", "application/json;charset=UTF-8");
    }

    const { timeoutMs, headers: userHeaders, mode, credentials, ...rest } = options;

    const mergedHeaders = new Headers(defaultHeaders);
    if (userHeaders) {
      const additional = new Headers(userHeaders);
      additional.forEach((value, key) => mergedHeaders.set(key, value));
    }

    const requestOptions: ApiRequestOptions = {
      ...rest,
      method,
      mode: mode ?? "cors",
      credentials: credentials ?? "include",
      headers: mergedHeaders,
    };

    try {
      if (typeof GM_xmlhttpRequest === "function") {
        return await this._requestViaGM(url, requestOptions, timeoutMs);
      }
      return await this._requestViaFetch(url, requestOptions, timeoutMs);
    } catch (error) {
      LOG.error("API request failed:", error);
      throw error;
    }
  }

  private static _toPlainHeaders(headers?: HeadersInit): Record<string, string> | undefined {
    if (!headers) return undefined;
    if (headers instanceof Headers) {
      const obj: Record<string, string> = {};
      headers.forEach((value, key) => {
        obj[key] = value;
      });
      return obj;
    }
    if (Array.isArray(headers)) {
      return headers.reduce<Record<string, string>>((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});
    }
    return { ...(headers as Record<string, string>) };
  }

  private static _shouldSendCredentials(
    url: string,
    credentialsMode: RequestCredentials = "include"
  ): boolean {
    if (credentialsMode === "include") return true;
    if (credentialsMode === "omit") return false;
    try {
      const target = new URL(url, location.href);
      return typeof location === "object" && target.origin === location.origin;
    } catch {
      return false;
    }
  }

  private static _handleHttpError(status: number, statusText?: string): never {
    if (status === 401) {
      this._tokenCache = null;
      this._tokenCacheAt = 0;
      if (!this._authWarned) {
        this._authWarned = true;
        LOG.warn("Auth 401 from API. Token missing/expired. Please refresh or re-login.");
      }
    }
    throw new Error(`HTTP ${status}: ${statusText || ""}`);
  }

  private static _requestViaGM(
    url: string,
    fetchOptions: ApiRequestOptions,
    timeoutMs?: number
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== "function") {
        reject(new Error("GM_xmlhttpRequest unavailable"));
        return;
      }

      try {
        const method = (fetchOptions.method ?? "GET").toUpperCase();
        const headers = this._toPlainHeaders(fetchOptions.headers) ?? {};

        const details: GmJsonRequest = {
          url,
          method,
          headers,
          responseType: "json",
          withCredentials: this._shouldSendCredentials(url, fetchOptions.credentials ?? "include"),
          onload: (response: GmJsonResponse) => {
            try {
              if (response.status >= 200 && response.status < 300) {
                let payload = response.response;
                if (payload == null) {
                  const text = (response as { responseText?: string }).responseText;
                  payload = text ? JSON.parse(text) : null;
                }
                resolve(payload);
                return;
              }
              this._handleHttpError(response.status, response.statusText);
            } catch (err) {
              reject(err as Error);
            }
          },
          onerror: (err) => {
            reject(new Error(err && "error" in err && typeof err.error === "string" ? err.error : "GM request failed"));
          },
          ontimeout: () => reject(new Error("GM request timeout")),
          onabort: () => reject(new Error("GM request aborted")),
        } as GmJsonRequest;

        if (typeof timeoutMs === "number" && timeoutMs > 0) {
          (details as { timeout?: number }).timeout = timeoutMs;
        }
        if (method !== "GET" && fetchOptions.body != null) {
          (details as { data?: BodyInit }).data = fetchOptions.body;
        }

        GM_xmlhttpRequest(details);
      } catch (error) {
        reject(error as Error);
      }
    });
  }

  private static async _requestViaFetch(
    url: string,
    fetchOptions: ApiRequestOptions,
    timeoutMs?: number
  ): Promise<unknown> {
    const { timeoutMs: _ignored, ...rest } = fetchOptions;
    const init: RequestInit = { ...rest };

    let controller: AbortController | null = null;
    let timer: number | undefined;

    try {
      if (typeof AbortController !== "undefined" && typeof timeoutMs === "number" && timeoutMs > 0) {
        controller = new AbortController();
        init.signal = controller.signal;
        timer = window.setTimeout(() => controller?.abort(), timeoutMs);
      }

      const response = await fetch(url, init);
      if (!response.ok) {
        this._handleHttpError(response.status, response.statusText);
      }
      return await response.json();
    } finally {
      if (typeof timer === "number") {
        window.clearTimeout(timer);
      }
    }
  }

  static async searchCourses(
    taskIds: Array<string | number>,
    options: SearchCourseOptions = {}
  ): Promise<Record<string, CourseInfo>> {
    const cached: Record<string, CourseInfo> = {};
    const uncachedIds: string[] = [];

    taskIds.forEach((id) => {
      const key = String(id);
      const cachedValue = this._courseInfoCache.get(key);
      if (cachedValue) {
        cached[key] = cachedValue;
        return;
      }

      const stored = Storage.getCourseInfo(key);
      if (stored) {
        const info: CourseInfo = {
          siteId: stored.siteId ?? null,
          name: stored.name ?? undefined,
          teachers: stored.teachers ?? undefined,
        };
        this._courseInfoCache.set(key, info);
        cached[key] = info;
      } else {
        uncachedIds.push(key);
      }
    });

    if (uncachedIds.length === 0) {
      return cached;
    }

    const result: Record<string, CourseInfo> = { ...cached };
    const remainingIds = new Set<string>(uncachedIds);
    let courseList: RawCourse[] | null = null;

    const hints = options.hints ?? {};
    if (Object.keys(hints).length > 0 && remainingIds.size > 0) {
      const siteToTaskIds = new Map<string, string[]>();
      remainingIds.forEach((taskId) => {
        const hint = hints[taskId];
        if (!hint) return;

        const rawSiteId = hint.siteId ?? hint.courseId ?? hint.courseSiteId;
        const siteId = rawSiteId != null && rawSiteId !== "" ? String(rawSiteId) : null;
        const siteName = hint.siteName ?? hint.courseName ?? "";
        const hintTeachers = hint.teachers ?? "";

        if (siteName && (!siteId || siteId === "-1")) {
          const info: CourseInfo = {
            siteId: siteId && siteId !== "-1" ? siteId : null,
            name: siteName,
            teachers: hintTeachers,
          };
          this.cacheCourseInfo(taskId, info);
          result[taskId] = info;
          remainingIds.delete(taskId);
          return;
        }

        if (siteId && siteId !== "-1") {
          if (!siteToTaskIds.has(siteId)) {
            siteToTaskIds.set(siteId, []);
          }
          siteToTaskIds.get(siteId)!.push(taskId);
        }
      });

      if (siteToTaskIds.size > 0 && remainingIds.size > 0) {
        try {
          courseList = await this._getCourseList();
          const courseMap = new Map<string, RawCourse>();
          courseList.forEach((course) => {
            if (course.id != null) {
              courseMap.set(String(course.id), course);
            }
          });

          siteToTaskIds.forEach((taskIdList, siteId) => {
            const course = courseMap.get(siteId);
            if (!course) return;
            const teachers = this.extractTeacherNames(course.teachers);
            taskIdList.forEach((taskId) => {
              if (!remainingIds.has(taskId)) return;
              const info: CourseInfo = {
                siteId: course.id != null ? String(course.id) : null,
                name: course.siteName ?? "",
                teachers,
              };
              this.cacheCourseInfo(taskId, info);
              result[taskId] = info;
              remainingIds.delete(taskId);
            });
          });
        } catch (error) {
          LOG.warn("Course list lookup via hints failed:", error);
        }
      }
    }

    if (remainingIds.size === 0) {
      return result;
    }

    try {
      const courses = courseList ?? (await this._getCourseList());
      const courseMeta = courses.map((course) => ({
        id: course.id,
        name: course.siteName ?? "",
        teachers: this.extractTeacherNames(course.teachers),
      }));

      const limit = Math.max(1, Math.min(CONSTANTS.BATCH_SIZE_LIMIT, 3));

      for (let i = 0; i < courseMeta.length && remainingIds.size > 0; i += limit) {
        const slice = courseMeta.slice(i, i + limit);
        await Promise.all(
          slice.map(async (course) => {
            if (remainingIds.size === 0) return;
            try {
              if (course.id == null) return;
              const tasks = await this.getCourseTasks(course.id);
              if (!Array.isArray(tasks) || tasks.length === 0) return;
          tasks.forEach((task) => {
            const taskRecord = task as CourseTask;
            const rawTaskId =
              (taskRecord.id as string | number | undefined) ??
              (taskRecord.activityId as string | number | undefined);
            if (!rawTaskId) return;
            const key = String(rawTaskId);
            if (!remainingIds.has(key)) return;
            const info: CourseInfo = {
              siteId: course.id != null ? String(course.id) : null,
              name: course.name,
              teachers: course.teachers,
                };
                this.cacheCourseInfo(key, info);
                result[key] = info;
                remainingIds.delete(key);
              });
            } catch (error) {
              LOG.warnThrottled("course-tasks", "Fetch course tasks failed:", error);
            }
          })
        );
      }

      return result;
    } catch (error) {
      LOG.error("Search courses failed:", error);
      return result;
    }
  }

  private static async _getCourseList(forceRefresh = false): Promise<RawCourse[]> {
    const now = Date.now();
    if (
      !forceRefresh &&
      this._courseListCache &&
      now - this._courseListCacheAt < CONSTANTS.CACHE.COURSE_INFO_TTL_MS
    ) {
      return this._courseListCache;
    }

    const [userId] = this.getToken();
    const response = (await this.request(
      `${CONSTANTS.API_BASE}/ykt-site/site/list/student/current?size=999999&current=1&userId=${userId}&siteRoleCode=2`
    )) as { data?: { records?: RawCourse[] } };
    const records = Array.isArray(response?.data?.records) ? response.data.records : [];
    this._courseListCache = records;
    this._courseListCacheAt = now;
    return records;
  }

  static async getCourseTasks(siteId: string | number): Promise<unknown[]> {
    const cacheKey = String(siteId);
    const cached = this._siteTaskCache.get(cacheKey);
    if (cached) return cached;

    const response = (await this.request(`${CONSTANTS.API_BASE}/ykt-site/work/student/list`, {
      method: "POST",
      body: JSON.stringify({
        siteId,
        current: 1,
        size: 9999,
      }),
    })) as { data?: { records?: unknown[] } };

    const tasks = Array.isArray(response?.data?.records) ? response.data.records : [];
    this._siteTaskCache.set(cacheKey, tasks);
    return tasks;
  }

  static async getCurrentCourses(forceRefresh = false): Promise<RawCourse[]> {
    try {
      const list = await this._getCourseList(forceRefresh);
      return Array.isArray(list) ? [...list] : [];
    } catch (error) {
      LOG.error("Fetch current courses failed:", error);
      return [];
    }
  }

  static async getUndoneList(forceRefresh = false): Promise<UndoneListResponse> {
    const cacheKey = "default";
    if (!forceRefresh) {
      const cached = this._undoneListCache.get(cacheKey);
      if (cached) return cached;
    }
    const [userId] = this.getToken();
    const response = (await this.request(
      `${CONSTANTS.API_BASE}/ykt-site/site/student/undone?userId=${userId}`
    )) as UndoneListResponse;
    this._undoneListCache.set(cacheKey, response);
    return response;
  }

  static async getAssignmentDetail(id: string | number): Promise<unknown> {
    return this.request(`${CONSTANTS.API_BASE}/ykt-site/work/detail?assignmentId=${id}`);
  }

  static async getSiteResources(siteId: string | number): Promise<ResourceItem[]> {
    const [userId] = this.getToken();
    const response = (await this.request(
      `${CONSTANTS.API_BASE}/ykt-site/site-resource/tree/student?siteId=${siteId}&userId=${userId}`,
      { method: "POST" }
    )) as { data?: unknown };

    const resources: ResourceItem[] = [];

    const resolveFolderName = (item: Record<string, unknown>): string => {
      const candidates = [
        item.resCatalogName,
        item.catalogName,
        item.sectionName,
        item.resourceName,
        item.name,
        item.title,
        item.chapterName,
        item.chapterTitle,
      ];
      for (const value of candidates) {
        if (typeof value === "string" && value.trim()) {
          return value.trim();
        }
      }
      return "";
    };

    const extractResources = (data: unknown, parents: string[] = []): void => {
      if (!Array.isArray(data)) return;
      data.forEach((item) => {
        if (typeof item !== "object" || item === null) return;
        const record = item as Record<string, unknown>;
        const folderName = resolveFolderName(record);
        const nextParents = folderName ? [...parents, folderName] : [...parents];

        const attachments = record.attachmentVOs as unknown;
        if (Array.isArray(attachments)) {
          attachments.forEach((attachment) => {
            if (
              attachment &&
              typeof attachment === "object" &&
              (attachment as Record<string, unknown>).type !== 2 &&
              (attachment as Record<string, unknown>).resource
            ) {
              const resource = (attachment as Record<string, unknown>).resource as Record<string, unknown>;
              const id =
                (resource.id as string | number | undefined) ??
                (resource.resourceId as string | number | undefined) ??
                (resource.storageId as string | number | undefined);
              const name =
                (resource.name as string | undefined) ??
                (resource.resourceName as string | undefined) ??
                (resource.fileName as string | undefined);
              if (id && name) {
                resources.push({
                  id: String(id),
                  name,
                  path: Utils.joinPath(...nextParents),
                });
              }
            }
          });
        }

        if (Array.isArray(record.children)) {
          extractResources(record.children, nextParents);
        }
      });
    };

    extractResources(response?.data);
    return resources;
  }

  static async getPreviewURL(storageId: string | number, timeoutMs = 15000): Promise<PreviewInfo> {
    const cacheKey = String(storageId);
    const cached = this._previewCache.get(cacheKey);
    if (cached) return cached;

    const json = (await this.request(
      `${CONSTANTS.API_BASE}/blade-source/resource/preview-url?resourceId=${storageId}`,
      { timeoutMs }
    )) as { data?: { previewUrl?: string; onlinePreview?: string } };

    if (!json?.data?.previewUrl) {
      throw new Error("获取预览地址失败");
    }

    const preview: PreviewInfo = {
      previewUrl: json.data.previewUrl,
      onlinePreview: json.data.onlinePreview,
    };
    this._previewCache.set(cacheKey, preview);
    return preview;
  }

  static getCourseInfo(taskId: string): StoredCourseInfo | null {
    return Storage.getCourseInfo(taskId);
  }

  static setCourseInfo(taskId: string, value: StoredCourseInfo | null): void {
    Storage.setCourseInfo(taskId, value);
  }

  private static extractTeacherNames(teachers?: CourseTeacher[]): string {
    if (!Array.isArray(teachers)) return "";
    return teachers
      .map((teacher) => teacher?.name?.trim())
      .filter((name): name is string => Boolean(name))
      .join(", ");
  }

  private static cacheCourseInfo(taskId: string, info: CourseInfo): void {
    this._courseInfoCache.set(taskId, info);
    const stored: StoredCourseInfo = {
      siteId: info.siteId ?? null,
      name: info.name ?? "",
      teachers: info.teachers,
      __ts: Date.now(),
    };
    Storage.setCourseInfo(taskId, stored);
  }
}
