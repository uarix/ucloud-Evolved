import { CONSTANTS, SVG_ICONS } from "../constants";
import { LOG } from "../core/logger";
import { API, RawCourse } from "../core/api";
import { Utils } from "../utils";
import { NotificationManager } from "./notification-manager";

type CourseCardElement = HTMLDivElement;

interface ExtractCoursesOptions {
  force?: boolean;
}

type CourseSearchHandler = (this: HTMLInputElement, ev: Event) => void;

type CourseWithExtras = RawCourse & {
  primaryTeachers?: string;
  courseType?: string;
  studentNo?: number;
};

interface CourseContainerRefs {
  searchInput: HTMLInputElement | null;
  coursesContainer: HTMLDivElement | null;
}

export class CourseExtractor {
  private courseContainer: HTMLDivElement | null = null;
  private originalContainer: HTMLElement | null = null;
  private allCourses: CourseCardElement[] = [];
  private extracting = false;
  private lastExtractedAt = 0;
  private lastSnapshotKey = "";
  private stylesInjected = false;
  private originalContainerDisplay: string | null = null;
  private paginationDisplay: string | null = null;
  private searchInput: HTMLInputElement | null = null;
  private coursesContainer: HTMLDivElement | null = null;
  private courseCountElement: HTMLElement | null = null;
  private courseSearchHandler: CourseSearchHandler | null = null;

  ensureStyles(): void {
    if (this.stylesInjected) return;
    GM_addStyle(`
      .all-courses-container {
        margin: 24px auto;
        padding: 24px;
        background-color: #fff;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.08);
        max-width: 1200px;
        transition: all 0.3s ease;
      }

      .all-courses-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
        border-bottom: 1px solid #ebeef5;
        padding-bottom: 15px;
      }

      .all-courses-title-section {
        display: flex;
        align-items: center;
      }

      .all-courses-title {
        font-size: 18px;
        font-weight: 600;
        color: #303133;
        margin-left: 10px;
      }

      .all-courses-count {
        font-size: 14px;
        color: #909399;
        background-color: #f5f7fa;
        padding: 4px 10px;
        border-radius: 4px;
      }

      .all-courses-search {
        margin-bottom: 20px;
      }

      .all-courses-search-input {
        width: 100%;
        padding: 10px 15px;
        border: 1px solid #dcdfe6;
        border-radius: 4px;
        font-size: 14px;
        color: #606266;
        box-sizing: border-box;
        transition: all 0.3s;
        outline: none;
      }

      .all-courses-search-input:focus {
        border-color: #409EFF;
        box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
      }

      .all-courses-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 20px;
        justify-content: center;
      }
    `);
    this.stylesInjected = true;
  }

  createContainerUI(): CourseContainerRefs {
    this.ensureStyles();

    if (!this.courseContainer) {
      this.courseContainer = document.createElement("div");
      this.courseContainer.id = "enhanced-courses-container";
      this.courseContainer.className = "all-courses-container";

      const header = document.createElement("div");
      header.className = "all-courses-header";

      const titleSection = document.createElement("div");
      titleSection.className = "all-courses-title-section";

      const icon = document.createElement("div");
      icon.innerHTML = SVG_ICONS.courseListHeader;
      titleSection.appendChild(icon);

      const title = document.createElement("div");
      title.className = "all-courses-title";
      title.textContent = "本学期全部课程";
      titleSection.appendChild(title);

      const courseCount = document.createElement("div");
      courseCount.id = "course-count";
      courseCount.className = "all-courses-count";
      this.courseCountElement = courseCount;

      header.appendChild(titleSection);
      header.appendChild(courseCount);
      this.courseContainer.appendChild(header);

      const searchContainer = document.createElement("div");
      searchContainer.className = "all-courses-search";

      const searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.placeholder = "搜索课程名称或教师...";
      searchInput.className = "all-courses-search-input";
      this.searchInput = searchInput;

      if (!this.courseSearchHandler) {
        const handler = Utils.debounce(() => this.applyCourseSearch(), 150);
        this.courseSearchHandler = handler as CourseSearchHandler;
      }
      searchInput.addEventListener("input", this.courseSearchHandler, { passive: true });

      searchContainer.appendChild(searchInput);
      this.courseContainer.appendChild(searchContainer);

      const coursesContainer = document.createElement("div");
      coursesContainer.className = "all-courses-grid";
      this.coursesContainer = coursesContainer;
      this.courseContainer.appendChild(coursesContainer);
    }

    return { searchInput: this.searchInput, coursesContainer: this.coursesContainer };
  }

  applyCourseSearch(): void {
    const input = this.searchInput;
    const searchTerm = Utils.normalizeText(input?.value ?? "");
    if (!Array.isArray(this.allCourses) || this.allCourses.length === 0) {
      this.updateCourseCount(0);
      return;
    }

    let visibleCount = 0;
    this.allCourses.forEach((item) => {
      if (!searchTerm) {
        item.hidden = false;
        visibleCount += 1;
        return;
      }

      const courseName =
        item.dataset.courseName ??
        Utils.normalizeText(item.querySelector(".my-lesson-name")?.textContent ?? "");
      const teacherNames =
        item.dataset.teacherNames ??
        Utils.normalizeText(item.querySelector(".my-lesson-teachers")?.textContent ?? "");
      const match = courseName.includes(searchTerm) || teacherNames.includes(searchTerm);
      item.hidden = !match;
      if (match) visibleCount += 1;
    });

    this.updateCourseCount(visibleCount);
  }

  hasRendered(): boolean {
    return Boolean(this.courseContainer && this.courseContainer.isConnected);
  }

  hasFreshRender(ttl = 30_000): boolean {
    if (!this.hasRendered() || this.allCourses.length === 0) return false;
    return Date.now() - this.lastExtractedAt < ttl;
  }

  async extractCourses(options: ExtractCoursesOptions = {}): Promise<boolean> {
    const { force = false } = options;
    if (this.extracting) {
      return this.allCourses.length > 0;
    }
    if (!force && this.hasFreshRender()) {
      return this.allCourses.length > 0;
    }

    this.extracting = true;
    try {
      const courseRecords = (await API.getCurrentCourses(force)) as CourseWithExtras[];
      if (!Array.isArray(courseRecords) || courseRecords.length === 0) {
        if (Array.isArray(courseRecords) && courseRecords.length === 0) {
          const { coursesContainer } = this.createContainerUI();
          if (coursesContainer) {
            if (typeof coursesContainer.replaceChildren === "function") {
              coursesContainer.replaceChildren();
            } else {
              coursesContainer.innerHTML = "";
            }
          }
          this.allCourses = [];
          this.lastSnapshotKey = "";
          this.updateCourseCount(0);
        } else {
          LOG.warnThrottled("course-list-empty", "Course API returned empty list");
        }
        return true;
      }

      const snapshotKey = courseRecords
        .map((course) =>
          course ? String(course.id ?? (course as { siteId?: unknown }).siteId ?? course.siteName ?? "") : ""
        )
        .join("|");

      if (!force && this.hasRendered() && snapshotKey && snapshotKey === this.lastSnapshotKey) {
        this.lastExtractedAt = Date.now();
        if (this.searchInput && this.searchInput.value) {
          this.applyCourseSearch();
        } else {
          this.updateCourseCount(this.allCourses.length);
        }
        return true;
      }

      const { coursesContainer } = this.createContainerUI();
      const cards: CourseCardElement[] = [];

      courseRecords.forEach((course) => {
        const card = this.createCourseCard(course);
        if (card) {
          cards.push(card);
        }
      });

      if (coursesContainer) {
        if (typeof coursesContainer.replaceChildren === "function") {
          coursesContainer.replaceChildren(...cards);
        } else {
          coursesContainer.innerHTML = "";
          cards.forEach((card) => coursesContainer.appendChild(card));
        }
      }

      this.allCourses = cards;
      this.lastSnapshotKey = snapshotKey;
      this.lastExtractedAt = Date.now();

      if (this.searchInput && this.searchInput.value) {
        this.applyCourseSearch();
      } else {
        this.updateCourseCount(cards.length);
      }

      return true;
    } catch (error) {
      LOG.error("Course API unavailable:", error);
      return false;
    } finally {
      this.extracting = false;
    }
  }

  createCourseCard(course: CourseWithExtras | null): CourseCardElement | null {
    if (!course) return null;

    const card = document.createElement("div");
    card.className = "enhanced-course-item";
    card.dataset.courseId = course.id != null ? String(course.id) : "";

    const courseName = (course.siteName ?? "未命名课程").trim();
    const teacherNames = Array.isArray(course.teachers)
      ? course.teachers
          .map((teacher) => teacher?.name)
          .filter((name): name is string => Boolean(name))
          .join(", ")
      : course.primaryTeachers ?? "";
    card.dataset.courseName = Utils.normalizeText(courseName);
    card.dataset.teacherNames = Utils.normalizeText(teacherNames);

    const hue = Utils.hashHue(courseName);
    const pastelColor = `hsl(${hue}, 70%, 95%)`;
    const darkerColor = `hsl(${hue}, 70%, 90%)`;

    const colorStrip = document.createElement("div");
    colorStrip.className = "enhanced-course-item__color-strip";
    colorStrip.style.backgroundColor = darkerColor;

    const courseIcon = document.createElement("div");
    courseIcon.className = "enhanced-course-item__icon";
    courseIcon.style.backgroundColor = pastelColor;
    courseIcon.style.color = `hsl(${hue}, 70%, 40%)`;
    courseIcon.textContent = courseName.charAt(0) || "?";

    const contentWrapper = document.createElement("div");

    const nameElem = document.createElement("div");
    nameElem.className = "my-lesson-name";
    nameElem.textContent = courseName;
    nameElem.title = courseName;

    const teacherElem = document.createElement("div");
    teacherElem.className = "my-lesson-teachers";
    const teacherIcon = document.createElement("span");
    teacherIcon.innerHTML = SVG_ICONS.teacherSmall;
    teacherElem.appendChild(teacherIcon);
    teacherElem.appendChild(document.createTextNode(teacherNames || "教师待公布"));

    const courseMeta = document.createElement("div");
    courseMeta.className = "my-lesson-area";
    const metaIcon = document.createElement("span");
    metaIcon.className = "my-lesson-area__icon";
    metaIcon.innerHTML = SVG_ICONS.locationSmall;
    const metaText = document.createElement("span");
    metaText.className = "my-lesson-area__text";
    const metaItems: string[] = [];
    if (course.courseType) metaItems.push(String(course.courseType));
    if (typeof course.studentNo === "number" && course.studentNo > 0) {
      metaItems.push(`人数 ${course.studentNo}`);
    }
    courseMeta.appendChild(metaIcon);
    metaText.textContent = metaItems.length ? metaItems.join(" · ") : "暂无额外信息";
    courseMeta.appendChild(metaText);

    contentWrapper.appendChild(nameElem);
    contentWrapper.appendChild(teacherElem);
    contentWrapper.appendChild(courseMeta);

    card.appendChild(courseIcon);
    card.appendChild(contentWrapper);
    card.appendChild(colorStrip);

    card.addEventListener("click", () => this.navigateToCourse(course));

    return card;
  }

  findOriginalCourseElement(course: CourseWithExtras | null): HTMLElement | null {
    if (!course) return null;
    try {
      const targetId = course.id != null ? String(course.id) : "";
      const targetName = (course.siteName ?? "").trim();
      const originalCourses = document.querySelectorAll(".my-lesson-item");
      for (const item of Array.from(originalCourses)) {
        const element = item as HTMLElement;
        const itemId =
          element.getAttribute("data-siteid") ??
          element.getAttribute("data-id") ??
          element.getAttribute("data-courseid") ??
          "";
        if (targetId && itemId && String(itemId) === targetId) {
          return element;
        }
        const nameEl = element.querySelector(".my-lesson-name");
        if (nameEl && nameEl.textContent?.trim() === targetName) {
          return element;
        }
      }
    } catch (error) {
      LOG.warn("Find original course element failed:", error);
    }
    return null;
  }

  navigateToCourse(course: CourseWithExtras | null): void {
    if (!course) return;
    const courseId = course.id != null ? String(course.id) : "";
    if (!courseId) {
      NotificationManager.show("提示", "未找到课程标识，无法跳转该课程", "warn");
      return;
    }
    const original = this.findOriginalCourseElement(course);
    if (original) {
      original.click();
      return;
    }

    const payload: Record<string, unknown> = { ...course };
    try {
      if (!payload.teachers && Array.isArray(course.teachers)) {
        payload.teachers = course.teachers;
      }
      localStorage.setItem("site", JSON.stringify(payload));
    } catch (error) {
      LOG.warn("Persist course info failed:", error);
    }

    try {
      sessionStorage.setItem("site", JSON.stringify(payload));
    } catch {
      // ignore
    }
    try {
      sessionStorage.setItem("siteId", courseId);
    } catch {
      // ignore
    }
    try {
      localStorage.setItem("siteId", courseId);
    } catch {
      // ignore
    }

    const targetUrl = `${CONSTANTS.URLS.courseHome}?siteId=${encodeURIComponent(courseId)}`;
    LOG.debug("Navigating to course via direct link:", targetUrl);
    location.href = targetUrl;
  }

  displayCourses(): boolean {
    this.createContainerUI();
    if (!this.courseContainer) return false;

    if (!this.originalContainer || !this.originalContainer.isConnected) {
      this.originalContainer = document.querySelector(".my-lesson-section");
    }
    if (!this.originalContainer) {
      LOG.error("找不到原始课程容器");
      return false;
    }

    const pagination = document.querySelector(".el-pagination") as HTMLElement | null;
    if (pagination) {
      if (this.paginationDisplay === null) {
        this.paginationDisplay = pagination.style.display || "";
      }
      pagination.style.display = "none";
    }

    if (!this.courseContainer.isConnected && this.originalContainer.parentNode) {
      this.originalContainer.parentNode.insertBefore(
        this.courseContainer,
        this.originalContainer.nextSibling
      );
    }

    if (this.searchInput && this.searchInput.value) {
      this.applyCourseSearch();
    } else {
      this.updateCourseCount(this.allCourses.length);
    }

    return true;
  }

  toggleOriginalContainer(show: boolean): void {
    if (this.originalContainer) {
      if (this.originalContainerDisplay === null) {
        this.originalContainerDisplay = this.originalContainer.style.display || "";
      }
      this.originalContainer.style.display = show ? this.originalContainerDisplay : "none";

      const pagination = document.querySelector(".el-pagination") as HTMLElement | null;
      if (pagination) {
        if (this.paginationDisplay === null) {
          this.paginationDisplay = pagination.style.display || "";
        }
        pagination.style.display = show ? this.paginationDisplay : "none";
      }
    }
  }

  updateCourseCount(count: number): void {
    const target = this.courseCountElement ?? document.getElementById("course-count");
    if (target) {
      target.textContent = `共 ${count} 门课程`;
    }
  }
}
