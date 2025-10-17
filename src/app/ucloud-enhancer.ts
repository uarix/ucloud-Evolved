// @ts-nocheck
import { VERSION, CONSTANTS, SVG_ICONS } from "../constants";
import { LOG, UEP_LOG } from "../core/logger";
import { Utils } from "../utils";
import { Settings, SETTINGS_SECTIONS } from "../settings";
import { DownloadManager } from "../services/download-manager";
import { CourseExtractor } from "../services/course-extractor";
import { NotificationManager } from "../services/notification-manager";
import { API, AssignmentSummary, UndoneListResponse } from "../core/api";
import { Storage, StoredCourseInfo } from "../core/storage";

export class UCloudEnhancer {
  private downloadManager: DownloadManager;
  private courseExtractor: CourseExtractor;
  private currentPage: string;
  private observers: Set<{ disconnect?: () => void }>;
  private isBatchDownloading: boolean;
  private _settingsStylesInjected: boolean;
  private _settingsToggle: HTMLElement | null;
  private _settingsPanel: HTMLElement | null;
  private _settingsInitialized: boolean;
  private _homeworkStylesInjected: boolean;
  private _injectedStyles: Set<string>;
  private _themeActive: boolean;
  private _unlockCopyBound: boolean;
  private _imageViewerCleanup: (() => void) | null;
  private _courseExtractorRetryTimer: number | null;
  private _notificationMarkReadHandler: ((event: Event) => void) | null;
  private _simplifyStylesInjected: boolean;
  private _homeSimplifyCleanup: (() => void) | null;
  private _autoCloseHandle: MutationObserver | null;
  constructor() {
  this.downloadManager = new DownloadManager();
  this.courseExtractor = new CourseExtractor(); // 新增课程提取器
  this.currentPage = location.href;
  this.observers = new Set();
  this.isBatchDownloading = false; // 批量下载状态
  this._settingsStylesInjected = false;
  this._settingsToggle = null;
  this._settingsPanel = null;
  this._settingsInitialized = false;
  this._homeworkStylesInjected = false;
  this._injectedStyles = new Set();
  this._themeActive = false;
  this._unlockCopyBound = false;
  this._imageViewerCleanup = null;
  this._courseExtractorRetryTimer = null;
  this._notificationMarkReadHandler = null;
  this._simplifyStylesInjected = false;
  this._homeSimplifyCleanup = null;
  this._autoCloseHandle = null;
  }

  isCourseRoute(url = location.href) {
    if (typeof url !== 'string') return false;
    return /uclass\/(?:index\.html)?#\//.test(url);
  }

  isNotificationRoute(url = location.href) {
    if (typeof url !== 'string') return false;
    return url.includes('/set/notice') || url.includes('/notice_fullpage');
  }

  init() {
    Settings.init();
    this.loadStyles();
    this.createUI();
    this.registerMenuCommands();

    this.handleCurrentPage();
    this.setupPageChangeListener();
  }

  loadStyles() {
    const injectStyle = (key, css) => {
    if (!css || this._injectedStyles.has(key)) return;
    GM_addStyle(css);
    this._injectedStyles.add(key);
    };

    const nprogressCSS = GM_getResourceText('NPROGRESS_CSS');
    if (typeof nprogressCSS === 'string' && nprogressCSS.length) {
    injectStyle('nprogress', nprogressCSS);
    } else {
    LOG.error('Failed to load NProgress styles; skipping injection.');
    }

    const enableNewView = Settings.get('home', 'enableNewView');
    const showHomeworkSource = Settings.get('homework', 'showHomeworkSource');

    if (showHomeworkSource || enableNewView) {
    injectStyle('homework-badges', `
    .course-info-badge {
    display: inline-block;
    padding: 2px 8px;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.5;
    color: #57606a;
    background-color: #f1f2f4;
    border-radius: 12px;
    margin-bottom: 5px;
    max-width: fit-content;
    }

    .course-info-badge-detail {
    display: inline-block;
    padding: 2px 8px;
    font-size: 13px;
    font-weight: 500;
    color: #444;
    background-color: #f0f2f5;
    border: 1px solid #d9d9d9;
    border-radius: 6px;
    transform: translateY(-5px);
    }

    .teacher-home-page .home-left-container .in-progress-section .in-progress-body .in-progress-item {
    height: auto !important;
    padding-bottom: 12px !important;
    }

    .teacher-home-page .home-left-container .in-progress-section .in-progress-body .in-progress-item .activity-box > div:first-child {
    flex-direction: column !important;
    justify-content: center !important;
    height: 100% !important;
    }

    .teacher-home-page .home-left-container .in-progress-section .in-progress-body .in-progress-item .activity-box .activity-title {
    height: auto !important;
    white-space: normal !important;
    }
    `);
    }

    injectStyle('notification-toast', `
    .uep-notification {
    position: fixed;
    bottom: 80px;
    right: 20px;
    color: #fff;
    padding: 15px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 10000;
    font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
    max-width: 300px;
    opacity: 0;
    transform: translateY(-10px);
    transition: all 0.3s ease;
    pointer-events: none;
    }

    .uep-notification.is-visible {
    opacity: 1;
    transform: translateY(0);
    }

    .uep-notification__title {
    font-weight: 600;
    margin-bottom: 5px;
    }

    .uep-notification__message {
    font-size: 14px;
    }

    .uep-notification--success { background: #4CAF50; }
    .uep-notification--error { background: #f56c6c; }
    .uep-notification--info { background: #409EFF; }
    .uep-notification--warn { background: #E6A23C; }
    `);

    injectStyle('image-lightbox', `
    .uep-image-lightbox {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    opacity: 0;
    transition: opacity .2s ease;
    cursor: zoom-out;
    }

    .uep-image-lightbox.is-visible {
    opacity: 1;
    }

    .uep-image-lightbox img {
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    border-radius: 6px;
    background: #111;
    }
    `);

    if (enableNewView) {
    injectStyle('enhanced-course-cards', `
    .enhanced-course-item {
    height: auto;
    padding: 16px;
    background-color: #ffffff;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    margin: 0;
    transition: all 0.3s;
    display: flex;
    flex-direction: column;
    border: 1px solid #ebeef5;
    position: relative;
    overflow: hidden;
    cursor: pointer;
    }

    .enhanced-course-item:hover {
    background-color: #f9fafc;
    box-shadow: 0 6px 16px rgba(0,0,0,0.1);
    transform: translateY(-2px);
    }

    .enhanced-course-item__icon {
    width: 40px;
    height: 40px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
    font-weight: bold;
    font-size: 18px;
    }

    .enhanced-course-item__color-strip {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 4px;
    width: 100%;
    }

    .enhanced-course-item .my-lesson-name {
    font-size: 15px;
    font-weight: 600;
    color: #303133;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
    width: 100%;
    margin-bottom: 8px;
    line-height: 1.4;
    }

    .enhanced-course-item .my-lesson-teachers {
    font-size: 13px;
    color: #606266;
    margin-top: 5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: flex;
    align-items: center;
    }

    .enhanced-course-item .my-lesson-area {
    font-size: 13px;
    color: #909399;
    margin-top: 8px;
    display: flex;
    align-items: flex-start;
    }

    .enhanced-course-item .my-lesson-area__icon {
    flex: 0 0 auto;
    display: flex;
    }

    .enhanced-course-item .my-lesson-area__text {
    flex: 1 1 auto;
    white-space: normal;
    line-height: 1.5;
    word-break: break-word;
    }
    `);
    }

    if (Settings.get('notification', 'betterNotificationHighlight')) {
    injectStyle('notification-highlight', `
    /* 通知高亮样式 */
    .notification-with-dot {
      background-color: #fff8f8 !important;
      border-left: 5px solid #f56c6c !important;
      box-shadow: 0 2px 6px rgba(245, 108, 108, 0.2) !important;
      padding: 0 22px !important;
      margin-bottom: 8px !important;
      border-radius: 4px !important;
      transition: all 0.3s ease !important;
    }
    .notification-with-dot:hover {
      background-color: #fff0f0 !important;
      box-shadow: 0 4px 12px rgba(245, 108, 108, 0.3) !important;
      transform: translateY(-2px) !important;
    }
    /* 隐藏高亮通知中的小红点 */
    .notification-with-dot .el-badge__content.is-dot {
      display: none !important;
    }
    `);
    }

    if (Settings.get('system', 'unlockCopy')) {
    injectStyle('unlock-copy', `
    .el-checkbox, .el-checkbox-button__inner, .el-empty__image img, .el-radio,
    div, span, p, a, h1, h2, h3, h4, h5, h6, li, td, th {
      -webkit-user-select: auto !important;
      -moz-user-select: auto !important;
      -ms-user-select: auto !important;
      user-select: auto !important;
    }
    `);
    if (!this._unlockCopyBound) {
    document.addEventListener('copy', e => e.stopImmediatePropagation(), true);
    document.addEventListener('selectstart', e => e.stopImmediatePropagation(), true);
    this._unlockCopyBound = true;
    }
    }

    if (enableNewView) {
    injectStyle('modern-theme', `
    body.uep-theme {
    --uep-font-sans: system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', 'Hiragino Sans GB', 'Helvetica Neue', Arial, 'Noto Sans', sans-serif;
    --uep-bg: #f6f8fb;
    --uep-surface: #ffffff;
    --uep-text: #303133;
    --uep-muted: #606266;
    --uep-border: #ebeef5;
    --uep-primary: #409EFF;
    --uep-radius-sm: 6px;
    --uep-radius-md: 8px;
    --uep-radius-lg: 12px;
    --uep-shadow-sm: 0 1px 4px rgba(0,0,0,0.06);
    --uep-shadow-md: 0 6px 16px rgba(0,0,0,0.08);
    --uep-shadow-lg: 0 12px 24px rgba(0,0,0,0.12);
    font-family: var(--uep-font-sans);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    color: var(--uep-text);
    background-color: var(--uep-bg);
    }

    body.uep-theme .el-card,
    body.uep-theme .el-dialog,
    body.uep-theme .el-message-box,
    body.uep-theme .el-popover,
    body.uep-theme .el-dropdown-menu,
    body.uep-theme .el-tooltip__popper,
    body.uep-theme .el-select-dropdown {
    border-radius: var(--uep-radius-lg) !important;
    border-color: var(--uep-border) !important;
    box-shadow: var(--uep-shadow-md) !important;
    background-color: var(--uep-surface) !important;
    color: var(--uep-text) !important;
    }

    body.uep-theme .el-input__inner,
    body.uep-theme .el-textarea__inner,
    body.uep-theme input.el-input__inner,
    body.uep-theme textarea.el-textarea__inner {
    border-radius: var(--uep-radius-md) !important;
    border-color: var(--uep-border) !important;
    background-color: var(--uep-surface) !important;
    color: var(--uep-text) !important;
    transition: box-shadow .2s ease, border-color .2s ease;
    }

    body.uep-theme .el-input.is-active .el-input__inner,
    body.uep-theme .el-input__inner:focus,
    body.uep-theme .el-textarea__inner:focus {
    border-color: var(--uep-primary) !important;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--uep-primary) 20%, transparent) !important;
    outline: none !important;
    }

    body.uep-theme .el-button,
    body.uep-theme .unified-homework-actions .trash-bin-info,
    body.uep-theme #yzHelper-settings button {
    border-radius: var(--uep-radius-md) !important;
    }

    body.uep-theme .el-button--primary,
    body.uep-theme #yzHelper-settings .action-btn.secondary,
    body.uep-theme #yzHelper-settings-toggle {
    background-color: var(--uep-primary) !important;
    border-color: var(--uep-primary) !important;
    color: #fff !important;
    box-shadow: 0 6px 16px color-mix(in srgb, var(--uep-primary) 20%, transparent) !important;
    }

    body.uep-theme .el-button--primary:hover,
    body.uep-theme #yzHelper-settings .action-btn.secondary:hover,
    body.uep-theme #yzHelper-settings-toggle:hover {
    filter: brightness(0.95);
    }

    body.uep-theme .el-tag,
    body.uep-theme .course-info-badge,
    body.uep-theme .course-info-badge-detail,
    body.uep-theme .homework-status-badge,
    body.uep-theme .trash-bin-info,
    body.uep-theme .homework-count {
    border-radius: var(--uep-radius-sm) !important;
    border-color: var(--uep-border) !important;
    }

    body.uep-theme .unified-homework-container {
    border-radius: var(--uep-radius-lg) !important;
    box-shadow: var(--uep-shadow-md) !important;
    }

    body.uep-theme .unified-homework-card {
    border-radius: var(--uep-radius-md) !important;
    box-shadow: var(--uep-shadow-sm) !important;
    }

    body.uep-theme #yzHelper-settings,
    body.uep-theme #yzHelper-settings-content,
    body.uep-theme #yzHelper-header,
    body.uep-theme #yzHelper-settings .setting-description {
    background: var(--uep-surface) !important;
    color: var(--uep-text) !important;
    border-color: var(--uep-border) !important;
    }

    body.uep-theme #yzHelper-settings-sidebar {
    background: color-mix(in srgb, var(--uep-surface) 95%, #0000) !important;
    }

    body.uep-theme #yzHelper-settings-sidebar .menu-item.active {
    background: var(--uep-primary) !important;
    }

    body.uep-theme *::-webkit-scrollbar {
    width: 8px;
    height: 8px;
    }

    body.uep-theme *::-webkit-scrollbar-track {
    background: transparent;
    }

    body.uep-theme *::-webkit-scrollbar-thumb {
    background: color-mix(in srgb, var(--uep-primary) 30%, #0000);
    border-radius: 10px;
    }

    body.uep-theme *::-webkit-scrollbar-thumb:hover {
    background: color-mix(in srgb, var(--uep-primary) 45%, #0000);
    }
    `);
    }
  }

  setThemeActive(active) {
    const body = document.body;
    if (!body) return;
    if (active) {
    if (!this._themeActive) {
    body.classList.add('uep-theme');
    this._themeActive = true;
    }
    return;
    }
    if (this._themeActive) {
    body.classList.remove('uep-theme');
    this._themeActive = false;
    }
  }

  setupPageChangeListener() {
    const historyAny = history as History & { __UEP_locationPatched?: boolean };
    const windowAny = window as Window &
      typeof globalThis & { __UEP_dispatchersPatched?: boolean };
    let currentUrl = location.href;
    const onChange = () => {
    if (location.href !== currentUrl) {
    currentUrl = location.href;
    this.currentPage = location.href;
    this.handleCurrentPage();
    }
    };
    // Prefer event listeners over polling
    // Patch history to emit a custom event on SPA navigations (idempotent)
    try {
    if (!historyAny.__UEP_locationPatched) {
    const pushState = history.pushState;
    history.pushState = function(...args) {
      const ret = pushState.apply(this, args);
      window.dispatchEvent(new Event('locationchange'));
      return ret;
    };
    const replaceState = history.replaceState;
    history.replaceState = function(...args) {
      const ret = replaceState.apply(this, args);
      window.dispatchEvent(new Event('locationchange'));
      return ret;
    };
    Object.defineProperty(historyAny, '__UEP_locationPatched', { value: true, configurable: false });
    }
    } catch (e) { /* ignore */ }

    if (!windowAny.__UEP_dispatchersPatched) {
    window.addEventListener('hashchange', () => window.dispatchEvent(new Event('locationchange')));
    window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
    try { Object.defineProperty(windowAny, '__UEP_dispatchersPatched', { value: true, configurable: false }); } catch (_) {}
    }
    window.addEventListener('locationchange', onChange);
    // 移除频繁的轮询，依赖上面的事件钩子
  }

  async handleCurrentPage() {
    const url = this.currentPage;
    UEP_LOG('处理当前页面:', url);

    try {
    // 清理上一页的观察者、定时器等
    this.destroy();

    // Office预览重定向
    if (url.startsWith(CONSTANTS.URLS.office)) {
    await this.handleOfficeRedirect();
    return;
    }

    // 课件预览页面
    if (url.startsWith(CONSTANTS.URLS.resourceLearn)) {
    this.handleResourcePreview();
    return;
    }

    // 作业详情页面
    if (url.startsWith(CONSTANTS.URLS.assignmentDetails)) {
    await this.handleAssignmentDetails();
    return;
    }

    // 主页面
    if (url.startsWith(CONSTANTS.URLS.home) || url.startsWith(CONSTANTS.URLS.homeFallback)) {
    await this.handleHomePage();
    await this.handleCoursesPage();
    return;
    }

    // 课程主页
    if (url.startsWith(CONSTANTS.URLS.courseHome)) {
    await this.handleCourseHome();
    return;
    }



    // 通知页面
    if (this.isNotificationRoute(url)) {
    this.handleNotificationPage();
    return;
    }

    // 学生课程页面 - 新增处理课程列表页面
    if (this.isCourseRoute(url) && !this.isNotificationRoute(url)) {
    await this.handleCoursesPage();
    return;
    }
    } catch (error) {
    LOG.error('Handle page error:', error);
    }
  }

  async handleOfficeRedirect() {
    const urlParams = new URLSearchParams(location.search);
    const fileUrl = urlParams.get('furl');
    const filename = urlParams.get('fullfilename') || fileUrl;

    if (!fileUrl || !filename) return;

    const viewURL = new URL(fileUrl);
    const oauthKey = urlParams.get('oauthKey');
    if (oauthKey) {
    const viewURLsearch = new URLSearchParams(viewURL.search);
    viewURLsearch.set('oauthKey', oauthKey);
    viewURL.search = viewURLsearch.toString();
    }

    // Office文件重定向
    if (Utils.hasFileExtension(filename, CONSTANTS.FILE_EXTENSIONS.office)) {
    if (!Settings.get('preview', 'autoSwitchOffice')) return;
    if (window.stop) window.stop();
    location.href = CONSTANTS.OFFICE_PREVIEW_BASE + encodeURIComponent(viewURL.toString());
    return;
    }

    // PDF文件重定向
    if (Utils.hasFileExtension(filename, CONSTANTS.FILE_EXTENSIONS.pdf)) {
    if (!Settings.get('preview', 'autoSwitchPdf')) return;
    if (window.stop) window.stop();
    try {
    const response = await fetch(viewURL.toString());
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    location.href = blobUrl;
    } catch (err) {
    LOG.error('PDF加载失败:', err);
    }
    return;
    }

    // 图片文件重定向
    if (Utils.hasFileExtension(filename, CONSTANTS.FILE_EXTENSIONS.image)) {
    if (!Settings.get('preview', 'autoSwitchImg')) return;
    if (window.stop) window.stop();
    this.createImageViewer(viewURL.toString());
    return;
    }
  }

  handleResourcePreview() {
    if (Settings.get('system', 'betterTitle')) {
    const filename = this.extractFilenameFromPreviewUrl(location.href);
    document.title = `[预览] ${filename || '课件'} - 教学云空间`;
    }

    if (Settings.get('preview', 'autoClosePopup')) {
    this.autoClosePreviewPopup();
    }

    if (Settings.get('preview', 'hideTimer')) {
    GM_addStyle('.preview-container .time { display: none !important; }');
    }
  }

  async handleAssignmentDetails() {
    const urlObj = new URL(location.href);
    let assignmentId = urlObj.searchParams.get('assignmentId');
    let title = urlObj.searchParams.get('assignmentTitle');

    // Hash-based SPA routes put params after '#', parse them as fallback
    if (!assignmentId || !title) {
    try {
    const hash = location.hash || '';
    const qIndex = hash.indexOf('?');
    if (qIndex !== -1) {
      const hashQuery = hash.slice(qIndex + 1);
      const hs = new URLSearchParams(hashQuery);
      assignmentId = assignmentId || hs.get('assignmentId');
      title = title || hs.get('assignmentTitle');
    }
    } catch (_) { /* ignore */ }
    }

    if (Settings.get('system', 'betterTitle')) {
    document.title = `[作业] ${title} - 教学云空间`;
    }

    // 自动切换到"作业信息"标签页
    this.autoSwitchToAssignmentInfoTab();

    if (!assignmentId || !Settings.get('homework', 'showHomeworkSource')) return;

    try {
    // 检查缓存
    let courseInfo = Storage.getCourseInfo(assignmentId);
    if (!courseInfo) {
    await API.searchCourses([assignmentId]);
    courseInfo = Storage.getCourseInfo(assignmentId);
    }

    if (courseInfo) {
    this.insertCourseInfo(courseInfo);
    }

    // 处理资源预览和下载
    await this.handleAssignmentResources(assignmentId);
    } catch (error) {
    LOG.error('Handle assignment details error:', error);
    }
  }

  async handleHomePage() {
    const enableNewView = Settings.get('home', 'enableNewView');
    this.setThemeActive(enableNewView);
    if (Settings.get('system', 'betterTitle')) {
    document.title = '个人主页 - 教学云空间';
    }

    // 简化主页功能
    if (Settings.get('home', 'simplifyHomePage')) {
    await this.simplifyHomePage();
    }

    if (!enableNewView) return;

    try {
    const undoneList = await API.getUndoneList() as UndoneListResponse;
    const assignments = undoneList.data?.undoneList;
    if (!assignments?.length) return;

    // 创建统一的作业显示视图
    await this.createUnifiedHomeworkView(assignments);
    } catch (error) {
    LOG.error('Handle home page error:', error);
    }
  }

  // 添加简化主页方法
  async simplifyHomePage() {
    try {
    // 等待关键元素加载完成，确保能够找到它们
    await Utils.wait(() => document.querySelector('.menu-nav.el-row') && document.querySelector('.home-right-container.home-inline-block'), 5000);
    const body = document.body;
    if (!body) return;

    if (typeof this._homeSimplifyCleanup === 'function') {
    try { this._homeSimplifyCleanup(); } catch (_) { /* ignore */ }
    this._homeSimplifyCleanup = null;
    }

    if (!this._simplifyStylesInjected) {
    GM_addStyle(`
      body.uep-home-simplified .menu-nav.el-row {
        display: none !important;
      }
      body.uep-home-simplified .home-right-container.home-inline-block {
        display: none !important;
      }
      body.uep-home-simplified .teacher-home-page {
        display: flex !important;
        justify-content: center !important;
      }
      body.uep-home-simplified .home-left-container.home-inline-block {
        float: none !important;
      }
    `);
    this._simplifyStylesInjected = true;
    }

    body.classList.add('uep-home-simplified');
    this._homeSimplifyCleanup = () => {
    body.classList.remove('uep-home-simplified');
    };
    LOG.debug('已通过样式方式简化主页布局。');
    } catch (error) {
    LOG.error('简化主页失败：无法应用样式。', error);
    }
  }

  async handleCourseHome() {
    const readSite = (storage, label) => {
    if (!storage) return null;
    try {
    const raw = storage.getItem('site');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      LOG.warn(`课程信息缓存解析失败（${label}），已清理损坏的数据。`, error);
      try { storage.removeItem('site'); } catch (_) { /* ignore */ }
      return null;
    }
    } catch (error) {
    LOG.warn(`读取课程缓存失败（${label}）`, error);
    return null;
    }
    };

    let site = readSite(localStorage, 'local');
    if (!site) {
    site = readSite(sessionStorage, 'session') || {};
    }

    if (!site.id) return;

    if (Settings.get('system', 'betterTitle')) {
    document.title = `[课程] ${site.siteName} - 教学云空间`;
    }

    try {
    const resources = await API.getSiteResources(site.id);
    await this.setupCourseResources(resources);
    } catch (error) {
    LOG.error('Handle course home error:', error);
    }
  }



  handleNotificationPage() {
    if (Settings.get('system', 'betterTitle')) {
    document.title = '通知 - 教学云空间';
    }

    const notificationSettings = Settings.current?.notification || Settings.defaults.notification;
    const { sortNotificationsByTime, betterNotificationHighlight } = notificationSettings;

    if (!sortNotificationsByTime && !betterNotificationHighlight) {
    return;
    }

    const listSelector = CONSTANTS.SELECTORS.notificationList;
    const loadingMaskSelector = CONSTANTS.SELECTORS.notificationLoadingMask;
    const timestampSelector = CONSTANTS.SELECTORS.notificationTimestamp;
    const dotSelector = CONSTANTS.SELECTORS.notificationDot;

    let isProcessingNotifications = false;
    let hasInitializedListObserver = false;
    const MANUAL_HIGHLIGHT_SUPPRESS_MS = 2000; // 给后台同步“已读”状态留出缓冲

    let processNotifications = () => {};
    const scheduleNotificationRefresh = Utils.debounce(() => {
    try { processNotifications(); } catch (e) { LOG.warnThrottled('notification-refresh', 'Process notifications failed:', e); }
    }, 250);

    const suppressHighlightTemporarily = (item) => {
    if (!(item instanceof HTMLElement)) return;
    item.dataset.uepManualSuppressUntil = String(Date.now() + MANUAL_HIGHLIGHT_SUPPRESS_MS);
    item.classList.remove('notification-with-dot');
    };

    const handleMarkReadClick = (event) => {
    if (!betterNotificationHighlight) return;
    const target = event.target;
    if (!target) return;
    const actionEl = target.closest('button, a, span, i');
    if (!actionEl) return;
    const text = actionEl.textContent ? actionEl.textContent.replace(/\s+/g, '') : '';
    if (!text || !text.includes('标记已读')) return;

    const container = Utils.qs(listSelector);
    if (!container) return;

    if (text.includes('全部')) {
    Utils.qsa('li', container).forEach(suppressHighlightTemporarily);
    } else {
    const item = actionEl.closest('li');
    if (item) suppressHighlightTemporarily(item);
    }

    scheduleNotificationRefresh();
    setTimeout(() => scheduleNotificationRefresh(), 600);
    };

    const ensureMarkReadHandler = () => {
    if (!betterNotificationHighlight) return;
    if (this._notificationMarkReadHandler) return;
    this._notificationMarkReadHandler = handleMarkReadClick;
    document.addEventListener('click', this._notificationMarkReadHandler, true);
    };

    processNotifications = () => {
    const noticeContainer = Utils.qs(listSelector);
    if (!noticeContainer) {
    LOG.debug('通知容器未找到');
    return;
    }

    ensureMarkReadHandler();

    const noticeItems = Utils.qsa<HTMLElement>('li', noticeContainer);
    if (noticeItems.length === 0) {
    LOG.debug('未找到通知项');
    return;
    }

    if (isProcessingNotifications) return;

    isProcessingNotifications = true;
    try {
    let workingItems: HTMLElement[] = noticeItems;
    let orderChanged = false;
    if (sortNotificationsByTime) {
      const sortedItems = noticeItems.slice().sort((a, b) => {
        const nodeA = Utils.qs(timestampSelector, a);
        const nodeB = Utils.qs(timestampSelector, b);
        if (!nodeA || !nodeB) return 0;
        const dateA = Utils.parseDateFlexible(nodeA.textContent.trim());
        const dateB = Utils.parseDateFlexible(nodeB.textContent.trim());
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        const timeValueA = typeof (dateA as Date).getTime === 'function' ? (dateA as Date).getTime() : Number(dateA);
        const timeValueB = typeof (dateB as Date).getTime === 'function' ? (dateB as Date).getTime() : Number(dateB);
        return timeValueB - timeValueA;
      });
      const currentOrder = Array.from(noticeContainer.children || []);
      orderChanged = currentOrder.length !== sortedItems.length
        || sortedItems.some((item, index) => item !== currentOrder[index]);
      workingItems = sortedItems;
    }

    if (betterNotificationHighlight) {
      // 先移除高亮类，避免我们注入的样式影响下一次可见性判断
      workingItems.forEach((item) => item.classList.remove('notification-with-dot'));
      const now = Date.now();
      workingItems.forEach((item) => {
        const dot = Utils.qs(dotSelector, item);
        const hasRedDot = Utils.isVisible(dot);
        if (!hasRedDot) {
        delete item.dataset.uepManualSuppressUntil;
        return;
        }
        const suppressUntil = Number(item.dataset.uepManualSuppressUntil || 0);
        if (Number.isFinite(suppressUntil) && suppressUntil > now) {
        return;
        }
        delete item.dataset.uepManualSuppressUntil;
        item.classList.add('notification-with-dot');
      });
    } else {
      workingItems.forEach((item) => item.classList.remove('notification-with-dot'));
    }

    if (orderChanged) {
      try {
        const fragment = document.createDocumentFragment();
        workingItems.forEach((node) => fragment.appendChild(node));
        noticeContainer.innerHTML = '';
        noticeContainer.appendChild(fragment);
      } catch (err) {
        LOG.warnThrottled('notification-reorder', '通知列表重排失败，使用追加模式:', err);
        workingItems.forEach((node) => noticeContainer.appendChild(node));
      }
    }
    } finally {
    isProcessingNotifications = false;
    }
    };

    const observeNotificationList = (list) => {
    if (!list) return;
    const liveObserverOpts = { childList: true, subtree: true, attributes: true };
    const liveObserver = new MutationObserver(() => {
    if (isProcessingNotifications) return;
    scheduleNotificationRefresh();
    });
    liveObserver.observe(list, liveObserverOpts);
    this.observers.add(liveObserver);
    };

    const ensureListObserver = () => {
    if (hasInitializedListObserver) return;
    const list = Utils.qs(listSelector);
    if (list) {
    observeNotificationList(list);
    hasInitializedListObserver = true;
    scheduleNotificationRefresh();
    return;
    }
    Utils.wait(() => Utils.qs(listSelector), {
    timeout: 5000,
    observerOptions: { childList: true, subtree: true }
    }).then(node => {
    if (hasInitializedListObserver) return;
    if (node) {
      observeNotificationList(node);
      hasInitializedListObserver = true;
      scheduleNotificationRefresh();
    }
    }).catch(() => {});
    };

    const startProcessing = () => {
    processNotifications();
    ensureListObserver();
    };

    const setupMaskObserver = (mask) => {
    if (!mask) {
    startProcessing();
    return;
    }
    if (mask.style.display === 'none') {
    startProcessing();
    return;
    }
    const maskObserver = new MutationObserver(() => {
    if (mask.style.display === 'none') {
      maskObserver.disconnect();
      startProcessing();
    }
    });
    maskObserver.observe(mask, { attributes: true, attributeFilter: ['style'] });
    this.observers.add(maskObserver);
    setTimeout(() => maskObserver.disconnect(), 10000);
    };

    const loadingMask = Utils.qs(loadingMaskSelector);
    if (loadingMask) {
    setupMaskObserver(loadingMask);
    } else {
    Utils.wait(() => Utils.qs(loadingMaskSelector), {
    timeout: 5000,
    observerOptions: { childList: true, subtree: true }
    }).then(mask => setupMaskObserver(mask)).catch(() => startProcessing());
    }

    // 若不存在加载遮罩或已完成初始化，确保至少运行一次
    startProcessing();
  }

  // ===== 统一作业视图 =====

  buildCourseHints(assignments) {
    const hints = {};
    (assignments || []).forEach(assignment => {
    if (!assignment || !assignment.activityId) return;
    const hint = {};
    const siteId = assignment.siteId ?? assignment.courseId ?? assignment.courseInfo?.siteId;
    if (siteId !== undefined && siteId !== null && siteId !== '') {
    hint.siteId = siteId;
    }
    const siteName = assignment.siteName
    || assignment.courseInfo?.name
    || assignment.courseName;
    if (siteName) hint.siteName = siteName;
    const teachers = assignment.courseInfo?.teachers
    || assignment.teachers
    || assignment.teacherName;
    if (teachers) hint.teachers = teachers;
    if (Object.keys(hint).length) {
    hints[assignment.activityId] = hint;
    }
    });
    return hints;
  }

  async createUnifiedHomeworkView(assignments) {
    // 等待原有作业区域加载
    await Utils.wait(() => document.querySelector('.in-progress-section'), 5000);

    try {
    // 调试：打印完整的assignments数据
    UEP_LOG('Complete assignments data:', assignments);
    UEP_LOG('First assignment structure:', assignments[0]);

    // 过滤掉已删除的作业
    const filteredAssignments = assignments.filter(assignment =>
    !Storage.isHomeworkDeleted(assignment.activityId)
    );

    const initialCourseInfos = {};
    filteredAssignments.forEach(assignment => {
    const key = assignment.activityId;
    if (key === undefined || key === null || key === '') return;
    if (assignment.courseInfo && assignment.courseInfo.name) {
      initialCourseInfos[key] = assignment.courseInfo;
      return;
    }
    if (assignment.siteName) {
      initialCourseInfos[key] = {
        name: assignment.siteName,
        teachers: ''
      };
    }
    });

    const assignmentsNeedingLookup = filteredAssignments.filter(assignment => {
    const key = assignment.activityId;
    if (key === undefined || key === null || key === '') return false;
    return !initialCourseInfos[key];
    });

    let courseInfos = { ...initialCourseInfos };
    if (assignmentsNeedingLookup.length) {
    const taskIds = Array.from(new Set(
      assignmentsNeedingLookup
        .map(item => item.activityId)
        .filter(id => id !== undefined && id !== null && id !== '')
        .map(id => String(id))
    ));
    if (taskIds.length) {
      const hints = this.buildCourseHints(assignmentsNeedingLookup);
      const fetched = await API.searchCourses(taskIds, { hints });
      if (fetched && typeof fetched === 'object') {
        courseInfos = { ...fetched, ...courseInfos };
      }
    }
    }

    // 创建统一作业视图
    this.insertUnifiedHomeworkPanel(filteredAssignments, courseInfos);
    } catch (error) {
    LOG.error('Create unified homework view error:', error);
    }
  }

  insertUnifiedHomeworkPanel(assignments, courseInfos) {
    const existingPanel = document.getElementById('unified-homework-panel');
    if (existingPanel) {
    this.refreshUnifiedHomeworkPanel(existingPanel, assignments, courseInfos);
    return;
    }

    const inProgressSection = document.querySelector('.in-progress-section');
    if (!inProgressSection) return;

    // 不再需要保存原始作业项，直接使用URL跳转

    // 创建新的统一视图容器，完全替换原来的section
    const unifiedPanel = document.createElement('div');
    unifiedPanel.id = 'unified-homework-panel';
    unifiedPanel.className = 'unified-homework-container';
    unifiedPanel.innerHTML = `
    <div class="unified-homework-header">
    <div class="title-section">
      ${SVG_ICONS.homeworkHeading}
      <h3 class="unified-homework-title">全部待办作业</h3>
    </div>
    <div class="unified-homework-actions">
      <div class="homework-count" id="homework-count">共 ${assignments.length} 项作业</div>
      <div class="trash-bin-info" id="trash-bin-btn" title="查看回收站">
        ${SVG_ICONS.trashCan}
        <span id="trash-count">回收站</span>
      </div>
    </div>
    </div>
    <div class="search-container">
    <input type="text" id="homework-search" placeholder="搜索作业标题或课程名称..." />
    </div>
    <div class="unified-homework-list"></div>
    `;

    // 完全替换整个section
    inProgressSection.parentNode.replaceChild(unifiedPanel, inProgressSection);

    // 添加样式
    this.addUnifiedHomeworkStyles();
    this.populateHomeworkList(unifiedPanel.querySelector('.unified-homework-list'), assignments, courseInfos);

    // 等待DOM渲染完成后绑定事件（事件委托减少监听器数量）
    setTimeout(() => {
    const listRoot = unifiedPanel.querySelector('.unified-homework-list') || unifiedPanel;
    listRoot.addEventListener('click', (event) => {
    const delBtn = event.target.closest('.homework-delete-btn');
    if (delBtn) {
      event.preventDefault();
      event.stopPropagation();
      const assignmentId = delBtn.getAttribute('data-assignment-id');
      const card = delBtn.closest('.unified-homework-card');
      if (!card) return;
      const title = card.querySelector('.homework-title')?.textContent || '';
      this.confirmDeleteHomework(title, () => {
        const assignmentData = assignments.find(a => String(a.activityId) === String(assignmentId));
        Storage.addDeletedHomework(assignmentId, assignmentData);
        card.remove();
        const remaining = unifiedPanel.querySelectorAll('.unified-homework-card').length;
        const countElement = unifiedPanel.querySelector('#homework-count');
        if (countElement) countElement.textContent = `共 ${remaining} 项作业`;
        const trashCountSpan = unifiedPanel.querySelector('#trash-count');
        const trashBinBtn = unifiedPanel.querySelector('#trash-bin-btn');
        if (trashCountSpan && trashBinBtn) {
        const dcount = Storage.getDeletedHomeworks().length;
        trashCountSpan.textContent = dcount > 0 ? `回收站 (${dcount})` : '回收站';
        trashBinBtn.classList.toggle('has-items', dcount > 0);
        }
        NotificationManager.show('已移除', `作业"${title}"已移入回收站`);
      });
      return;
    }
    const card = event.target.closest('.unified-homework-card');
    if (card) {
      event.preventDefault();
      event.stopPropagation();
      const assignmentId = card.getAttribute('data-assignment-id');
      const title = card.getAttribute('data-assignment-title');
      const type = card.getAttribute('data-assignment-type') || 'assignment';
      LOG.debug('Card clicked:', { assignmentId, title, type });
      if (assignmentId && title) this.openAssignmentDetails(assignmentId, title, type);
    }
    });

    // 添加搜索功能
    const searchInput = unifiedPanel.querySelector('#homework-search');
    const updateHomeworkCount = (count) => {
    const countElement = unifiedPanel.querySelector('#homework-count');
    if (countElement) {
      countElement.textContent = `共 ${count} 项作业`;
    }
    };

    if (searchInput) {
    const onHomeworkSearch = Utils.debounce(() => {
      const searchTerm = searchInput.value.toLowerCase();
      const homeworkCards = unifiedPanel.querySelectorAll('.unified-homework-card');

      let visibleCount = 0;
      homeworkCards.forEach(card => {
        const title = card.querySelector('.homework-title').textContent.toLowerCase();
        const course = card.querySelector('.homework-course span').textContent.toLowerCase();

        if (title.includes(searchTerm) || course.includes(searchTerm)) {
        card.style.display = 'flex';
        visibleCount++;
        } else {
        card.style.display = 'none';
        }
      });

      updateHomeworkCount(visibleCount);
    }, 150);
    searchInput.addEventListener('input', onHomeworkSearch);
    }

    // 更新回收站计数并绑定事件
    const trashBinBtn = unifiedPanel.querySelector('#trash-bin-btn');
    const trashCountSpan = unifiedPanel.querySelector('#trash-count');
    if (trashBinBtn && trashCountSpan) {
    const deletedCount = Storage.getDeletedHomeworks().length;
    trashCountSpan.textContent = deletedCount > 0 ? `回收站 (${deletedCount})` : '回收站';

    // 根据是否有内容添加样式类
    if (deletedCount > 0) {
      trashBinBtn.classList.add('has-items');
    } else {
      trashBinBtn.classList.remove('has-items');
    }

    trashBinBtn.addEventListener('click', () => {
      this.showTrashBin();
    });
    }
    }, 100);
  }

  refreshUnifiedHomeworkPanel(panel, assignments, courseInfos) {
    if (!panel) return;
    const listElement = panel.querySelector('.unified-homework-list');
    if (listElement) {
    this.populateHomeworkList(listElement, assignments, courseInfos);
    }
    const countElement = panel.querySelector('#homework-count');
    if (countElement) {
    countElement.textContent = `共 ${assignments.length} 项作业`;
    }
    const trashBinBtn = panel.querySelector('#trash-bin-btn');
    const trashCountSpan = panel.querySelector('#trash-count');
    if (trashBinBtn && trashCountSpan) {
    const deletedCount = Storage.getDeletedHomeworks().length;
    trashCountSpan.textContent = deletedCount > 0 ? `回收站 (${deletedCount})` : '回收站';
    trashBinBtn.classList.toggle('has-items', deletedCount > 0);
    }
    const searchInput = panel.querySelector('#homework-search');
    if (searchInput) {
    // 触发一次搜索以应用当前过滤条件
    const evt = new Event('input', { bubbles: true });
    searchInput.dispatchEvent(evt);
    }
  }

  buildHomeworkCard(assignment, courseInfo, index = 0) {
    if (!assignment) return null;

    const isExercise = assignment.type === 4;
    const activityType = isExercise ? 'exercise' : 'assignment';
    const title = assignment.title || assignment.activityName || `${isExercise ? '练习' : '作业'} ${index + 1}`;
    const courseName = assignment.siteName
    ? assignment.siteName
    : (courseInfo && courseInfo.name ? courseInfo.name : '课程信息加载中...');
    const teacherName = courseInfo?.teachers || '';

    let deadlineDisplay = '无期限';
    if (assignment.endTime) {
    try {
    if (typeof assignment.endTime === 'string' && assignment.endTime.includes('-')) {
      const parts = assignment.endTime.split(' ');
      if (parts.length >= 2) {
        const datePart = parts[0].split('-').slice(1).join('-');
        const timePart = parts[1].split(':').slice(0, 2).join(':');
        deadlineDisplay = `${datePart} ${timePart}`;
      } else {
        deadlineDisplay = assignment.endTime.split(' ')[0];
      }
    } else {
      const date = Utils.parseDateFlexible(assignment.endTime);
      if (date) {
        deadlineDisplay = date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
        });
      } else {
        deadlineDisplay = '时间格式错误';
      }
    }
    } catch (_) {
    deadlineDisplay = '时间格式错误';
    }
    }

    let statusClass = 'normal';
    let statusText = '正常';
    if (assignment.endTime) {
    try {
    const endDate = Utils.parseDateFlexible(assignment.endTime);
    if (endDate) {
      const now = new Date();
      const diff = endDate - now;
      if (diff < 0) {
        statusClass = 'overdue';
        statusText = '已逾期';
      } else if (diff < 72 * 60 * 60 * 1000) {
        statusClass = 'urgent';
        statusText = '即将到期';
      }
    }
    } catch (_) { /* ignore */ }
    }

    const typeLabel = isExercise ? '练习' : '作业';

    const card = document.createElement('div');
    card.className = `unified-homework-card ${statusClass}`;
    card.dataset.assignmentId = String(assignment.activityId ?? '');
    card.dataset.assignmentTitle = title;
    card.dataset.assignmentType = activityType;

    const info = document.createElement('div');
    info.className = 'homework-info';

    const titleElem = document.createElement('h4');
    titleElem.className = 'homework-title';
    titleElem.textContent = title;
    titleElem.title = title;
    info.appendChild(titleElem);

    const courseRow = document.createElement('div');
    courseRow.className = 'homework-course';
    courseRow.innerHTML = `${SVG_ICONS.homeworkCourse}<span></span>`;
    const courseSpan = courseRow.querySelector('span');
    if (courseSpan) courseSpan.textContent = courseName;
    info.appendChild(courseRow);

    if (teacherName) {
    const teacherRow = document.createElement('div');
    teacherRow.className = 'homework-teacher';
    teacherRow.innerHTML = `${SVG_ICONS.homeworkTeacher}<span></span>`;
    const teacherSpan = teacherRow.querySelector('span');
    if (teacherSpan) teacherSpan.textContent = teacherName;
    info.appendChild(teacherRow);
    }

    const deadlineRow = document.createElement('div');
    deadlineRow.className = 'homework-deadline';
    deadlineRow.innerHTML = `${SVG_ICONS.homeworkClock}<span></span>`;
    const deadlineSpan = deadlineRow.querySelector('span');
    if (deadlineSpan) deadlineSpan.textContent = deadlineDisplay;
    info.appendChild(deadlineRow);

    card.appendChild(info);

    const badge = document.createElement('div');
    badge.className = `homework-status-badge ${statusClass}`;
    badge.textContent = `${typeLabel} - ${statusText}`;
    card.appendChild(badge);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'homework-delete-btn';
    deleteBtn.dataset.assignmentId = String(assignment.activityId ?? '');
    deleteBtn.title = '移除作业';
    deleteBtn.innerHTML = SVG_ICONS.homeworkDelete;
    card.appendChild(deleteBtn);

    return card;
  }

  populateHomeworkList(container, assignments, courseInfos) {
    if (!container) return;
    container.innerHTML = '';
    const fragment = document.createDocumentFragment();
    assignments.forEach((assignment, index) => {
    const courseInfo = courseInfos?.[assignment.activityId];
    const card = this.buildHomeworkCard(assignment, courseInfo, index);
    if (card) fragment.appendChild(card);
    });
    container.appendChild(fragment);
  }

  addUnifiedHomeworkStyles() {
    if (this._homeworkStylesInjected) return;
    GM_addStyle(`
    .unified-homework-container {
    background: #ffffff;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.08);
    border: 1px solid #ebeef5;
    margin: 24px auto 0;
    padding: 0;
    max-width: 1200px;
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
    }



    .unified-homework-header {
    background: #fff;
    color: #303133;
    padding: 20px 24px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #ebeef5;
    }

    .title-section {
    display: flex;
    align-items: center;
    gap: 12px;
    }

        .unified-homework-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: #303133;
    letter-spacing: -0.02em;
    }

    .unified-homework-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    }

    .trash-bin-info {
    font-size: 14px;
    color: #909399;
    background-color: #f5f7fa;
    padding: 4px 10px;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.3s;
    user-select: none;
    }

    .trash-bin-info:hover {
    background-color: #e4e7ed;
    color: #606266;
    }

    .trash-bin-info.has-items {
    color: #67c23a;
    background-color: #f0f9ff;
    }

    .trash-bin-info.has-items:hover {
    background-color: #e1f5fe;
    color: #5ba832;
    }

    .homework-count {
    font-size: 14px;
    color: #909399;
    background-color: #f5f7fa;
    padding: 4px 10px;
    border-radius: 4px;
    }

    .homework-count,
    .trash-bin-info {
    font-weight: 500;
    letter-spacing: 0.02em;
    }

    .search-container {
    padding: 16px 24px;
    }

    .search-container input {
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

    .search-container input:focus {
    border-color: #409EFF;
    box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.2);
    }

    .unified-homework-list {
    max-height: 70vh;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 12px 20px 24px;
    background: transparent;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 20px;
    justify-content: center;
    }

    .unified-homework-card {
    height: auto;
    padding: 16px;
    background-color: #ffffff;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
    margin: 0;
    transition: all 0.3s;
    display: flex;
    flex-direction: column;
    border: 1px solid #ebeef5;
    position: relative;
    overflow: hidden;
    cursor: pointer;
    }

    .unified-homework-card:hover {
    background-color: #f9fafc;
    box-shadow: 0 6px 16px rgba(0,0,0,0.1);
    transform: translateY(-2px);
    }

    .unified-homework-card.urgent {
    border-left: 4px solid #ffe6b3;
    background-color: #ffffff;
    }

    .unified-homework-card.overdue {
    border-left: 4px solid #ffd6d6;
    background-color: #ffffff;
    }

    .homework-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    }

    .homework-title {
    margin: 0 0 12px 0;
    font-size: 15px;
    font-weight: 600;
    color: #303133;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
    width: 100%;
    line-height: 1.4;
    padding-right: 70px;
    max-width: 100%;
    }

    .homework-course,
    .homework-teacher,
    .homework-deadline {
    font-size: 13px;
    color: #606266;
    display: flex;
    align-items: center;
    gap: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 400;
    }

    .homework-course svg,
    .homework-teacher svg,
    .homework-deadline svg {
    flex-shrink: 0;
    opacity: 0.7;
    }

    .homework-status-badge {
    position: absolute;
    top: 12px;
    right: 12px;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 12px;
    background: #f5f7fa;
    color: #909399;
    }

    .homework-status-badge.urgent {
    background: #fff7e6;
    color: #b26a00;
    border: none;
    }

    .homework-status-badge.overdue {
    background: #fff0f0;
    color: #c0392b;
    border: none;
    }

    .homework-delete-btn {
    position: absolute;
    bottom: 8px;
    right: 8px;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid #dcdfe6;
    border-radius: 50%;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transition: all 0.3s;
    color: #909399;
    z-index: 10;
    }

    .unified-homework-card:hover .homework-delete-btn {
    opacity: 1;
    }

    .homework-delete-btn:hover {
    background: #f56c6c;
    color: white;
    border-color: #f56c6c;
    }



    /* 现代化滚动条样式 */
    .unified-homework-list::-webkit-scrollbar {
    width: 8px;
    }

    .unified-homework-list::-webkit-scrollbar-track {
    background: rgba(245, 247, 250, 0.3);
    border-radius: 10px;
    margin: 16px 0;
    }

    .unified-homework-list::-webkit-scrollbar-thumb {
    background: linear-gradient(135deg, rgba(64, 158, 255, 0.3) 0%, rgba(64, 158, 255, 0.2) 100%);
    border-radius: 10px;
    border: 2px solid transparent;
    background-clip: content-box;
    transition: all 0.3s ease;
    }

    .unified-homework-list::-webkit-scrollbar-thumb:hover {
    background: linear-gradient(135deg, rgba(64, 158, 255, 0.5) 0%, rgba(64, 158, 255, 0.3) 100%);
    border-radius: 10px;
    }

    /* 为Firefox添加现代滚动条 */
    .unified-homework-list {
    scrollbar-width: thin;
    scrollbar-color: rgba(64, 158, 255, 0.3) rgba(245, 247, 250, 0.3);
    }

    /* 添加一些微动画 */
    @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
    }

    .unified-homework-card {
    animation: fadeInUp 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
    }

    .unified-homework-card:nth-child(1) { animation-delay: 0.1s; }
    .unified-homework-card:nth-child(2) { animation-delay: 0.15s; }
    .unified-homework-card:nth-child(3) { animation-delay: 0.2s; }
    .unified-homework-card:nth-child(4) { animation-delay: 0.25s; }
    .unified-homework-card:nth-child(5) { animation-delay: 0.3s; }
    .unified-homework-card:nth-child(n+6) { animation-delay: 0.35s; }
    `);
    this._homeworkStylesInjected = true;
  }

  openAssignmentDetails(assignmentId, title, type) {
    LOG.debug('Opening details:', { assignmentId, title, type });

    // 根据类型决定跳转到哪个页面
    let url;
    if (type === 'exercise') {
    // 练习详情页 - 使用正确的URL格式
    url = `https://ucloud.bupt.edu.cn/uclass/course.html#/answer?id=${assignmentId}`;
    } else {
    // 作业详情页
    url = `https://ucloud.bupt.edu.cn/uclass/course.html#/student/assignmentDetails_fullpage?assignmentId=${assignmentId}&assignmentTitle=${encodeURIComponent(title)}`;
    }

    LOG.debug('Navigating to:', url);

    // 在当前页面跳转，模拟原始行为
    window.location.href = url;
  }

  // 确认删除作业
  confirmDeleteHomework(title, callback) {
    // 检查是否设置了不再提示
    if (Settings.get('home', 'noConfirmDelete')) {
    callback();
    return;
    }

    // 创建自定义确认对话框
    const modal = document.createElement('div');
    modal.className = 'delete-confirm-modal';
    modal.innerHTML = `
    <div class="delete-confirm-overlay"></div>
    <div class="delete-confirm-content">
    <div class="delete-confirm-header">
      <h3>移除作业</h3>
    </div>
    <div class="delete-confirm-body">
      <p>确定要将作业"<strong>${title}</strong>"移入回收站吗？</p>
      <div class="delete-confirm-options">
        <label class="delete-confirm-checkbox">
        <input type="checkbox" id="no-confirm-checkbox">
        <span>不再提示此确认</span>
        </label>
      </div>
    </div>
    <div class="delete-confirm-actions">
      <button class="cancel-delete-btn">取消</button>
      <button class="confirm-delete-btn">移入回收站</button>
    </div>
    </div>
    `;

    document.body.appendChild(modal);
    this.addDeleteConfirmStyles();

    // 绑定事件
    this.bindDeleteConfirmEvents(modal, callback);

    // 显示动画
    setTimeout(() => {
    modal.classList.add('visible');
    }, 10);
  }

  addDeleteConfirmStyles() {
    if (document.getElementById('delete-confirm-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'delete-confirm-styles';
    styles.textContent = `
    .delete-confirm-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 10001;
    opacity: 0;
    transition: opacity 0.3s ease;
    }

    .delete-confirm-modal.visible {
    opacity: 1;
    }

    .delete-confirm-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    cursor: pointer;
    }

    .delete-confirm-content {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    width: 400px;
    max-width: 90vw;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    }

    .delete-confirm-header {
    padding: 20px 24px 16px;
    border-bottom: 1px solid #ebeef5;
    background: #fafbfc;
    }

    .delete-confirm-header h3 {
    margin: 0;
    font-size: 18px;
    color: #303133;
    }

    .delete-confirm-body {
    padding: 20px 24px;
    background: white;
    }

    .delete-confirm-body p {
    margin: 0 0 16px 0;
    font-size: 14px;
    color: #606266;
    line-height: 1.5;
    }

    .delete-confirm-options {
    margin-top: 16px;
    }

    .delete-confirm-checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #909399;
    cursor: pointer;
    user-select: none;
    }

    .delete-confirm-checkbox input[type="checkbox"] {
    margin: 0;
    cursor: pointer;
    }

    .delete-confirm-actions {
    padding: 16px 24px 20px;
    border-top: 1px solid #ebeef5;
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    background: #fafbfc;
    }

    .cancel-delete-btn, .confirm-delete-btn {
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.3s;
    outline: none;
    }

    .cancel-delete-btn {
    background: #f5f7fa;
    color: #606266;
    border: 1px solid #dcdfe6;
    }

    .cancel-delete-btn:hover {
    background: #e4e7ed;
    border-color: #c0c4cc;
    }

    .confirm-delete-btn {
    background: #f56c6c;
    color: white;
    }

    .confirm-delete-btn:hover {
    background: #e55353;
    }
    `;
    document.head.appendChild(styles);
  }

  bindDeleteConfirmEvents(modal, callback) {
    const closeModal = () => {
    modal.classList.remove('visible');
    setTimeout(() => {
    if (modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
    }, 300);
    };

    // 点击遮罩层关闭
    modal.querySelector('.delete-confirm-overlay').addEventListener('click', closeModal);

    // 取消按钮
    modal.querySelector('.cancel-delete-btn').addEventListener('click', closeModal);

    // 确认按钮
    modal.querySelector('.confirm-delete-btn').addEventListener('click', () => {
    const noConfirmCheckbox = modal.querySelector('#no-confirm-checkbox');

    // 如果选中了"不再提示"，保存设置
    if (noConfirmCheckbox.checked) {
    Settings.set('home', 'noConfirmDelete', true);
    NotificationManager.show('设置已保存', '今后删除作业将不再显示确认提示');
    }

    closeModal();
    callback();
    });

    // ESC键关闭
    const handleKeyPress = (e) => {
    if (e.key === 'Escape') {
    closeModal();
    document.removeEventListener('keydown', handleKeyPress);
    }
    };
    document.addEventListener('keydown', handleKeyPress);
  }

  // 显示回收站
  showTrashBin() {
    const deletedHomeworks = Storage.getDeletedHomeworks();

    // 创建回收站模态框
    const modal = document.createElement('div');
    modal.className = 'trash-bin-modal';
    modal.innerHTML = `
    <div class="trash-bin-overlay"></div>
    <div class="trash-bin-content">
    <div class="trash-bin-header">
      <h3>作业回收站</h3>
      <div class="trash-bin-actions">
        <button class="clear-all-btn" ${deletedHomeworks.length === 0 ? 'disabled' : ''}>清空回收站 (${deletedHomeworks.length})</button>
        <button class="close-trash-btn">×</button>
      </div>
    </div>
    <div class="trash-bin-body">
      ${this.generateTrashBinHTML(deletedHomeworks)}
    </div>
    </div>
    `;

    document.body.appendChild(modal);
    this.addTrashBinStyles();

    // 绑定事件
    this.bindTrashBinEvents(modal, deletedHomeworks);

    // 显示动画
    setTimeout(() => {
    modal.classList.add('visible');
    }, 10);
  }

  updateTrashBinSummary() {
    try {
    const panel = document.getElementById('unified-homework-panel');
    if (!panel) return;
    const trashCountSpan = panel.querySelector('#trash-count');
    const trashBinBtn = panel.querySelector('#trash-bin-btn');
    const deletedCount = Storage.getDeletedHomeworks().length;
    if (trashCountSpan) {
    trashCountSpan.textContent = deletedCount > 0 ? `回收站 (${deletedCount})` : '回收站';
    }
    if (trashBinBtn) {
    trashBinBtn.classList.toggle('has-items', deletedCount > 0);
    }
    } catch (e) {
    LOG.warn('更新回收站状态失败:', e);
    }
  }

  generateTrashBinHTML(deletedHomeworks) {
    if (deletedHomeworks.length === 0) {
    return '<div class="empty-trash">回收站为空<br><small>删除的作业会暂时保存在这里</small></div>';
    }

    return deletedHomeworks.map(item => {
    const assignment = item.data;
    const deletedDate = new Date(item.deletedAt).toLocaleString('zh-CN');
    const title = assignment.title || assignment.activityName || '未知作业';
    const isExercise = assignment.type === 4;
    const typeLabel = isExercise ? '练习' : '作业';

    return `
    <div class="trash-item" data-assignment-id="${item.id}">
      <div class="trash-item-info">
        <h4 class="trash-item-title">${title}</h4>
        <div class="trash-item-meta">
        <span class="trash-item-type">${typeLabel}</span>
        <span class="trash-item-date">删除时间: ${deletedDate}</span>
        </div>
      </div>
      <div class="trash-item-actions">
        <button class="restore-btn" data-assignment-id="${item.id}" title="恢复">
        ${SVG_ICONS.trashRestore}
        恢复
        </button>
        <button class="permanent-delete-btn" data-assignment-id="${item.id}" title="永久删除">
        ${SVG_ICONS.trashDelete}
        </button>
      </div>
    </div>
    `;
    }).join('');
  }

  addTrashBinStyles() {
    if (document.getElementById('trash-bin-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'trash-bin-styles';
    styles.textContent = `
    .trash-bin-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 10000;
    opacity: 0;
    transition: opacity 0.3s ease;
    }

    .trash-bin-modal.visible {
    opacity: 1;
    }

    .trash-bin-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    cursor: pointer;
    }

    .trash-bin-content {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    width: 600px;
    max-width: 90vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    }

    .trash-bin-header {
    padding: 20px 24px 16px;
    border-bottom: 1px solid #ebeef5;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #fafbfc;
    }

    .trash-bin-header h3 {
    margin: 0;
    font-size: 18px;
    color: #303133;
    }

    .trash-bin-actions {
    display: flex;
    gap: 10px;
    align-items: center;
    }

    .clear-all-btn {
    background: #f56c6c;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.3s;
    }

    .clear-all-btn:hover:not(:disabled) {
    background: #e55353;
    }

    .clear-all-btn:disabled {
    background: #c0c4cc;
    cursor: not-allowed;
    }

    .close-trash-btn {
    background: none;
    border: none;
    font-size: 24px;
    color: #909399;
    cursor: pointer;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.3s;
    }

    .close-trash-btn:hover {
    background: #f0f0f0;
    color: #606266;
    }

    .trash-bin-body {
    padding: 16px 24px 24px;
    overflow-y: auto;
    flex: 1;
    background: white;
    }

    .empty-trash {
    text-align: center;
    color: #909399;
    padding: 40px;
    font-size: 16px;
    }

    .trash-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border: 1px solid #ebeef5;
    border-radius: 8px;
    margin-bottom: 12px;
    background: #fafbfc;
    transition: all 0.3s;
    }

    .trash-item:hover {
    background: #f0f2f5;
    border-color: #c0c4cc;
    }

    .trash-item-info {
    flex: 1;
    }

    .trash-item-title {
    margin: 0 0 6px 0;
    font-size: 14px;
    font-weight: 600;
    color: #303133;
    }

    .trash-item-meta {
    display: flex;
    gap: 12px;
    align-items: center;
    font-size: 12px;
    color: #909399;
    }

    .trash-item-type {
    background: #e4e7ed;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 500;
    }

    .trash-item-actions {
    display: flex;
    gap: 8px;
    }

    .restore-btn, .permanent-delete-btn {
    border: none;
    padding: 6px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: all 0.3s;
    }

    .restore-btn {
    background: #67c23a;
    color: white;
    }

    .restore-btn:hover {
    background: #5ba832;
    }

    .permanent-delete-btn {
    background: #f56c6c;
    color: white;
    }

    .permanent-delete-btn:hover {
    background: #e55353;
    }
    `;
    document.head.appendChild(styles);
  }

  bindTrashBinEvents(modal, deletedHomeworks) {
    // 关闭模态框
    const closeModal = () => {
    modal.classList.remove('visible');
    setTimeout(() => {
    if (modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
    }, 300);
    };

    // 点击遮罩层关闭
    modal.querySelector('.trash-bin-overlay').addEventListener('click', closeModal);

    // 点击关闭按钮
    modal.querySelector('.close-trash-btn').addEventListener('click', closeModal);

    // ESC键关闭
    const handleKeyPress = (e) => {
    if (e.key === 'Escape') {
    closeModal();
    document.removeEventListener('keydown', handleKeyPress);
    }
    };
    document.addEventListener('keydown', handleKeyPress);

    // 清空回收站
    const clearAllBtn = modal.querySelector('.clear-all-btn');
    if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
    if (confirm('确定要清空回收站吗？此操作不可恢复！')) {
      Storage.clearDeletedHomeworks();
      this.updateTrashBinSummary();
      NotificationManager.show('已清空', '回收站已清空');
      closeModal();
    }
    });
    }

    // 恢复作业
    modal.querySelectorAll('.restore-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
    const assignmentId = btn.getAttribute('data-assignment-id');
    const trashItem = btn.closest('.trash-item');
    const title = trashItem.querySelector('.trash-item-title').textContent;

    Storage.removeDeletedHomework(assignmentId);
    trashItem.remove();

    // 同步更新统一作业面板，恢复的作业立即显示
    try {
      const panel = document.getElementById('unified-homework-panel');
      const list = panel ? panel.querySelector('.unified-homework-list') : null;
      // 从回收站快照或存储中找回数据
      let item = (Array.isArray(deletedHomeworks) ? deletedHomeworks : []).find(i => String(i.id) === String(assignmentId));
      if (!item) {
        const latest = Storage.getDeletedHomeworks();
        item = latest.find(i => String(i.id) === String(assignmentId));
      }
      if (panel && list && item && item.data) {
        const assign = item.data;
        let courseInfos = {};
        try {
        courseInfos = await API.searchCourses([assign.activityId], { hints: this.buildCourseHints([assign]) });
        } catch (err) { LOG.warn('获取课程信息失败:', err); }
        const card = this.buildHomeworkCard(assign, courseInfos?.[assign.activityId], list.childElementCount);
        if (card) {
        list.insertAdjacentElement('afterbegin', card);
        const countEl = panel.querySelector('#homework-count');
        if (countEl) countEl.textContent = `共 ${panel.querySelectorAll('.unified-homework-card').length} 项作业`;
        }
      }
    } catch (err) { LOG.warn('恢复后更新统一作业面板失败:', err); }

    NotificationManager.show('已恢复', `作业"${title}"已恢复`);

    // 更新按钮数量显示和状态
    const remainingItems = modal.querySelectorAll('.trash-item');
    const clearBtn = modal.querySelector('.clear-all-btn');
    clearBtn.textContent = `清空回收站 (${remainingItems.length})`;

    if (remainingItems.length === 0) {
      modal.querySelector('.trash-bin-body').innerHTML = '<div class="empty-trash">回收站为空<br><small>删除的作业会暂时保存在这里</small></div>';
      clearBtn.disabled = true;
    }

    // 同步更新统一面板回收站计数
    try {
      const unifiedPanel = document.getElementById('unified-homework-panel');
      if (unifiedPanel) {
        const trashCountSpan = unifiedPanel.querySelector('#trash-count');
        const trashBinBtn = unifiedPanel.querySelector('#trash-bin-btn');
        const dcount = Storage.getDeletedHomeworks().length;
        if (trashCountSpan) trashCountSpan.textContent = dcount > 0 ? `回收站 (${dcount})` : '回收站';
        if (trashBinBtn) trashBinBtn.classList.toggle('has-items', dcount > 0);
      }
    } catch {}
    });
    });

    // 永久删除
    modal.querySelectorAll('.permanent-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
    const assignmentId = btn.getAttribute('data-assignment-id');
    const trashItem = btn.closest('.trash-item');
    const title = trashItem.querySelector('.trash-item-title').textContent;

    if (confirm(`确定要永久删除作业"${title}"吗？此操作不可恢复！`)) {
      Storage.removeDeletedHomework(assignmentId);
      trashItem.remove();

      NotificationManager.show('已删除', `作业"${title}"已永久删除`);

      // 更新按钮数量显示和状态
      const remainingItems = modal.querySelectorAll('.trash-item');
      const clearBtn = modal.querySelector('.clear-all-btn');
      clearBtn.textContent = `清空回收站 (${remainingItems.length})`;

      if (remainingItems.length === 0) {
        modal.querySelector('.trash-bin-body').innerHTML = '<div class="empty-trash">回收站为空<br><small>删除的作业会暂时保存在这里</small></div>';
        clearBtn.disabled = true;
      }
    }
    });
    });
  }

  // ===== 辅助方法实现 =====

  autoSwitchToAssignmentInfoTab() {
    // 等待页面和标签页加载完成
    const switchToAssignmentTab = async () => {
    try {
    // 等待标签页容器加载
    await Utils.wait(() => document.querySelector('.details-tabs'), 5000);

    // 再等待一下确保标签页完全渲染
    await Utils.sleep(500);

    // 查找"作业信息"标签
    const assignmentTab = document.querySelector('#tab-first') ||
          document.querySelector('[aria-controls="pane-first"]') ||
          document.querySelector('.el-tabs__item:first-child');

    if (assignmentTab) {
      LOG.debug('找到作业信息标签，准备点击');

      // 检查是否已经是激活状态
      if (!assignmentTab.classList.contains('is-active')) {
        LOG.debug('点击作业信息标签');
        assignmentTab.click();

        // 如果点击没有效果，尝试触发 tab 切换事件
        setTimeout(() => {
        const firstPane = document.querySelector('#pane-first');
        if (firstPane && firstPane.style.display === 'none') {
        LOG.debug('尝试手动切换标签页');
        // 手动切换标签页显示状态
        const allTabs = document.querySelectorAll('.el-tabs__item');
        const allPanes = document.querySelectorAll('.el-tab-pane');

        allTabs.forEach(tab => tab.classList.remove('is-active'));
        allPanes.forEach(pane => {
          pane.style.display = 'none';
          pane.setAttribute('aria-hidden', 'true');
        });

        assignmentTab.classList.add('is-active');
        if (firstPane) {
          firstPane.style.display = '';
          firstPane.setAttribute('aria-hidden', 'false');
        }
        }
        }, 200);
      } else {
        LOG.debug('作业信息标签已经是激活状态');
      }
    } else {
      LOG.warn('未找到作业信息标签');
    }
    } catch (error) {
    LOG.error('自动切换到作业信息标签失败:', error);
    }
    };

    // 延迟执行，确保页面完全加载
    setTimeout(switchToAssignmentTab, 1000);
  }

  extractFilenameFromPreviewUrl(url) {
    try {
    const match = url.match(/previewUrl=([^&]+)/);
    if (!match) return null;
    const previewUrl = decodeURIComponent(match[1]);
    const filenameMatch = previewUrl.match(/filename%3D([^&]+)/);
    if (!filenameMatch) return null;
    return decodeURIComponent(decodeURIComponent(filenameMatch[1]));
    } catch (e) {
    return null;
    }
  }

  autoClosePreviewPopup() {
    if (this._autoCloseHandle && typeof this._autoCloseHandle.disconnect === 'function') {
    this._autoCloseHandle.disconnect();
    this.observers.delete(this._autoCloseHandle);
    }

    const target = document.body;
    if (!target) return;

    const handledDialogs = new WeakSet();
    let rafId = null;

    const processVisibleDialog = () => {
    const wrapper = Utils.qs('div.el-message-box__wrapper');
    if (!wrapper || handledDialogs.has(wrapper)) return;

    const display = window.getComputedStyle(wrapper).display;
    if (display === 'none') return;

    const messageElement = Utils.qs('.el-message-box__message p', wrapper);
    if (!messageElement) {
    handledDialogs.add(wrapper);
    return;
    }

    const text = messageElement.textContent || '';
    if (!text.includes('您正在学习其他课件') && !text.includes('您已经在学习此课件了')) {
    handledDialogs.add(wrapper);
    return;
    }

    const confirmButton = Utils.qs('.el-button--primary', wrapper);
    if (confirmButton) {
    confirmButton.click();
    handledDialogs.add(wrapper);
    }
    };

    const scheduleCheck = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(processVisibleDialog);
    };

    const observer = new MutationObserver(scheduleCheck);
    observer.observe(target, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style', 'class']
    });

    scheduleCheck();

    const handle = {
    disconnect() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    observer.disconnect();
    }
    };

    this._autoCloseHandle = handle;
    this.observers.add(handle);
  }

  insertCourseInfo(courseInfo) {
    let inserting = false;

    const insertCourseInfoElement = async () => {
    if (inserting) return;
    inserting = true;
    try {
    const titleElement = await Utils.wait(() => {
      return Utils.$x('/html/body/div[1]/div/div[2]/div[2]/div/div/div[2]/div/div[2]/div[1]/div/div/div[1]/div/p[1]')[0]
        || document.querySelector('#assignment-info .activity-title')
        || document.querySelector('.activity-title');
    }, {
      target: document.querySelector('#assignment-info') || document.body,
      observerOptions: { childList: true, subtree: true },
      timeout: 5000
    }).catch(() => null);

    if (!titleElement) return;

    const container = titleElement.parentElement;
    if (!container || container.querySelector('.course-info-badge-detail')) return;

    const courseInfoElement = document.createElement('div');
    courseInfoElement.className = 'course-info-badge-detail';
    const courseName = (courseInfo && courseInfo.name) ? courseInfo.name : '课程信息';
    const teachersText = courseInfo && courseInfo.teachers ? `(${courseInfo.teachers})` : '';
    const courseText = Utils.escapeHtml(`${courseName}${teachersText}`);
    courseInfoElement.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" style="vertical-align: -2px; margin-right: 5px; fill: currentColor;">
      <path d="M802.2 795.8H221.8c-18.5 0-33.6-15-33.6-33.6V261.8c0-18.5 15-33.6 33.6-33.6h580.4c18.5 0 33.6 15 33.6 33.6v500.4c0 18.5-15.1 33.6-33.6-33.6zM255.4 728.6h513.2V295.4H255.4v433.2z"></path>
      <path d="M864 728.6H160c-18.5 0-33.6-15-33.6-33.6V160c0-18.5 15-33.6 33.6-33.6h580.4c18.5 0 33.6 15 33.6 33.6v50.4h62c18.5 0 33.6 15 33.6 33.6v545c0 18.5-15.1 33.6-33.6 33.6zm-670.4-67.2h603.2V227.2H193.6v434.2zm670.4-134.4H830.4V295.4c0-18.5-15-33.6-33.6-33.6H227.2v-62h502.8v434.4z"></path>
      <path d="M322.6 626.2h378.8c8.4 0 15.2-6.8 15.2-15.2s-6.8-15.2-15.2-15.2H322.6c-8.4 0-15.2 6.8-15.2 15.2s6.8 15.2 15.2 15.2zM322.6 498.6h378.8c8.4 0 15.2-6.8 15.2-15.2s-6.8-15.2-15.2-15.2H322.6c-8.4 0-15.2 6.8-15.2 15.2s6.8 15.2 15.2 15.2zM322.6 371h378.8c8.4 0 15.2-6.8 15.2-15.2s-6.8-15.2-15.2-15.2H322.6c-8.4 0-15.2 6.8-15.2 15.2s6.8 15.2 15.2 15.2z"></path>
    </svg>
    <span>${courseText}</span>
    `;

    container.insertBefore(courseInfoElement, titleElement);
    } finally {
    inserting = false;
    }
    };

    void insertCourseInfoElement();

    // 设置标签页切换监听，确保切换回"作业信息"时重新插入课程信息
    this.setupTabSwitchListener(courseInfo, insertCourseInfoElement);
  }

  setupTabSwitchListener(courseInfo, insertFunction) {
    let isPageInitialized = false;

    const callInsert = () => {
    try {
    const maybe = insertFunction();
    if (maybe && typeof maybe.then === 'function') {
      maybe.catch(err => LOG.warn('插入课程信息失败:', err));
    }
    } catch (error) {
    LOG.warn('插入课程信息失败:', error);
    }
    };

    setTimeout(() => {
    isPageInitialized = true;
    LOG.debug('页面初始化完成，启用标签页监听');
    }, 2000);

    const setupTabListeners = () => {
    const assignmentInfoTab = document.querySelector('#tab-first');
    if (assignmentInfoTab && !assignmentInfoTab.hasAttribute('data-course-listener')) {
    assignmentInfoTab.setAttribute('data-course-listener', 'true');
    assignmentInfoTab.addEventListener('click', () => {
      if (!isPageInitialized) {
        LOG.debug('页面初始化中，忽略标签点击');
        return;
      }

      LOG.debug('作业信息标签被点击');
      setTimeout(() => {
        const currentActiveTab = document.querySelector('#tab-first');
        const firstPane = document.querySelector('#pane-first');

        if (currentActiveTab && currentActiveTab.classList.contains('is-active') &&
        firstPane && firstPane.style.display !== 'none') {
        const hasCourseInfo = document.querySelector('.course-info-badge-detail');
        if (!hasCourseInfo) {
        LOG.debug('重新插入课程信息');
        callInsert();
        }
        }
      }, 300);
    });
    }
    };

    setTimeout(() => {
    setupTabListeners();
    LOG.debug('标签页监听器已设置');
    }, 1000);

    const tabObserver = new MutationObserver(Utils.debounce(() => {
    if (!isPageInitialized) return;
    const assignmentInfoTab = document.querySelector(CONSTANTS.SELECTORS.assignmentInfoTab);
    const firstPane = document.querySelector(CONSTANTS.SELECTORS.assignmentInfoPane);
    if (assignmentInfoTab && assignmentInfoTab.classList.contains('is-active') && firstPane && firstPane.style.display !== 'none') {
    const hasCourseInfo = document.querySelector('.course-info-badge-detail');
    if (!hasCourseInfo) callInsert();
    setupTabListeners();
    }
    }, 150));
    const tabsRoot = document.querySelector('.details-tabs') || document.body;
    tabObserver.observe(tabsRoot, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-hidden'] });
    this.observers.add(tabObserver);
  }

  findAssignmentResourceElements() {
    const container = document.querySelector('#assignment-info');
    if (!container) return [];

    const preferredSelectors = [
    '.assignment-resource .resource-item',
    '.assignment-attachment__item',
    '.assignment-attachment-list .attachment-item',
    '.work-attachment .attachment-item',
    '.attachment-list .attachment-item',
    '.resource-attachment .resource-item',
    '.resource-item',
    '.file-item'
    ];

    for (const selector of preferredSelectors) {
    const nodes = Array.from(container.querySelectorAll(selector));
    if (nodes.length) return nodes;
    }

    const hostSet = new Set();
    container.querySelectorAll('i.by-icon-eye-grey, i.by-icon-yundown-grey, i.by-icon-download').forEach(icon => {
    const host = icon.closest('.attachment-item, .resource-item, .file-item, .el-row, li');
    if (host) hostSet.add(host);
    });
    if (hostSet.size) return Array.from(hostSet);

    const genericRows = Array.from(container.querySelectorAll('.el-row, li')).filter(node => {
    return node.querySelector('a, button, i.by-icon-eye-grey, i.by-icon-yundown-grey');
    });
    return genericRows;
  }

  async handleAssignmentResources(assignmentId) {
    try {
    const detail = await API.getAssignmentDetail(assignmentId);
    if (!detail?.data?.assignmentResource) return;

    const resources = detail.data.assignmentResource;
    const previewCache = new Map();
    const resolveFilename = (res, index) => {
    return res?.resourceName
      || res?.name
      || res?.fileName
      || `附件-${index + 1}`;
    };
    const fetchPreviewInfo = (res) => {
    const resourceId = res?.resourceId || res?.id;
    if (!resourceId) {
      return Promise.reject(new Error('缺少资源ID，无法获取预览链接'));
    }
    const key = String(resourceId);
    const cached = previewCache.get(key);
    if (cached) {
      return cached instanceof Promise ? cached : Promise.resolve(cached);
    }
    const promise = Utils.withRetry(() => API.getPreviewURL(resourceId), 3, 300)
      .then(data => {
        previewCache.set(key, data);
        return data;
      })
      .catch(err => {
        previewCache.delete(key);
        throw err;
      });
    previewCache.set(key, promise);
    return promise;
    };

    const resourceNodes = await Utils.wait(() => {
    const nodes = this.findAssignmentResourceElements();
    return nodes.length ? nodes : null;
    }, {
    timeout: 8000,
    target: document.querySelector('#assignment-info') || document.body,
    observerOptions: { childList: true, subtree: true }
    }).catch(() => []);

    if (!resourceNodes.length) {
    LOG.warn('未找到作业附件节点，跳过资源增强');
    return;
    }

        const normalizeText = (text: unknown) => {
      if (!text) return '';
      return String(text).replace(/\s+/g, ' ').trim().toLowerCase();
    };
    const labelCache = new Map<Element, string>();
    const getNodeLabel = (node: Element) => {
      if (!labelCache.has(node)) {
        labelCache.set(node, normalizeText(node.textContent));
      }
      return labelCache.get(node) ?? '';
    };

    const usedNodes = new Set<HTMLElement>();
    const pickNodeForResource = (resource: Record<string, unknown>, fallbackIndex: number, filename: string) => {
    const normalizedName = normalizeText(filename);
    if (normalizedName) {
      for (const node of resourceNodes) {
        if (usedNodes.has(node)) continue;
        const label = getNodeLabel(node);
        if (!label) continue;
        if (label.includes(normalizedName) || normalizedName.includes(label)) {
        usedNodes.add(node);
        return node;
        }
      }
    }
    for (let i = fallbackIndex; i < resourceNodes.length; i++) {
      const node = resourceNodes[i];
      if (!usedNodes.has(node)) {
        usedNodes.add(node);
        return node;
      }
    }
    for (const node of resourceNodes) {
      if (!usedNodes.has(node)) {
        usedNodes.add(node);
        return node;
      }
    }
    return null;
    };

    const describeError = (error: unknown) =>
      error instanceof Error ? error.message : String(error ?? '未知错误');

    const getPreviewInfoOrNotify = async (
      resourceItem: Record<string, unknown>,
      action: '预览' | '下载'
    ): Promise<{ previewUrl?: string; onlinePreview?: string } | null> => {
      try {
        return await fetchPreviewInfo(resourceItem);
      } catch (err) {
        LOG.error('Fetch preview info failed:', err);
        NotificationManager.show(`${action}失败`, describeError(err), 'error');
        return null;
      }
    };

    resources.forEach((resource, index) => {
    const filename = resolveFilename(resource, index);
    const targetNode = pickNodeForResource(resource, index, filename);
    if (!targetNode) return;

    const resourceId = resource?.resourceId || resource?.id;
    if (resourceId) {
      targetNode.dataset.uepResourceId = String(resourceId);
    }

    // 创建预览按钮
    const previewBtn = document.createElement('i');
    previewBtn.title = '预览';
    previewBtn.classList.add('by-icon-eye-grey');
    previewBtn.addEventListener('click', async () => {
      const previewInfo = await getPreviewInfoOrNotify(resource, '预览');
      if (!previewInfo) return;

      const finalPreviewUrl = previewInfo.previewUrl;
      const finalOnlinePreview = previewInfo.onlinePreview;
      if (!finalPreviewUrl) {
        NotificationManager.show('预览失败', '未获取到预览地址', 'error');
        return;
      }

      try {
        if (Settings.get('preview', 'autoDownload')) {
          const useGM = typeof GM_download === 'function';
          const safeName = Utils.sanitizeFilename(filename);
          if (useGM) {
            await this.downloadManager.downloadViaGM(finalPreviewUrl, safeName, true);
          } else {
            await this.downloadManager.downloadFile(finalPreviewUrl, safeName);
          }
        }
      } catch (e) {
        LOG.error('Auto download on preview failed:', e);
      }
      try {
        this.openPreview(finalPreviewUrl, filename, finalOnlinePreview);
      } catch (err) {
        LOG.error('Open preview failed:', err);
        NotificationManager.show('预览失败', describeError(err), 'error');
      }
    });

    // 创建下载按钮
    const downloadBtn = document.createElement('i');
    downloadBtn.title = '下载';
    downloadBtn.classList.add('by-icon-yundown-grey');
    downloadBtn.addEventListener('click', async () => {
      const previewInfo = await getPreviewInfoOrNotify(resource, '下载');
      if (!previewInfo) return;

      const finalPreviewUrl = previewInfo.previewUrl;
      if (!finalPreviewUrl) {
        NotificationManager.show('下载失败', '未获取到下载地址', 'error');
        return;
      }

      try {
        const useGM = typeof GM_download === 'function';
        const safeName = Utils.sanitizeFilename(filename);
        if (useGM) {
          await this.downloadManager.downloadViaGM(finalPreviewUrl, safeName, true);
        } else {
          await this.downloadManager.downloadFile(finalPreviewUrl, safeName);
        }
      } catch (e) {
        LOG.error('Download failed:', e);
        NotificationManager.show('下载失败', describeError(e), 'error');
      }
    });

    // 移除已存在的下载/预览图标，避免重复
    targetNode.querySelectorAll('i.by-icon-download, i.by-icon-yundown-grey, i.by-icon-eye-grey')
      .forEach(icon => icon.remove());
    targetNode.appendChild(downloadBtn);
    targetNode.appendChild(previewBtn);
    });
    } catch (error) {
    LOG.error('Handle assignment resources error:', error);
    }
  }

  // 清理所有已注册的观察者与临时资源
  destroy() {
    if (this.observers && this.observers.size) {
    this.observers.forEach(obs => {
    if (obs && typeof obs.disconnect === 'function') {
      obs.disconnect();
    }
    });
    this.observers.clear();
    }
    if (this._courseExtractorRetryTimer) {
    clearTimeout(this._courseExtractorRetryTimer);
    this._courseExtractorRetryTimer = null;
    }
    try {
    if (this.courseExtractor && typeof this.courseExtractor.toggleOriginalContainer === 'function') {
    this.courseExtractor.toggleOriginalContainer(true);
    }
    if (this.courseExtractor?.courseContainer && this.courseExtractor.courseContainer.parentNode) {
    if (this.courseExtractor.searchInput && this.courseExtractor._courseSearchHandler) {
      try {
        this.courseExtractor.searchInput.removeEventListener('input', this.courseExtractor._courseSearchHandler);
      } catch (_) { /* ignore */ }
    }
    this.courseExtractor.courseContainer.parentNode.removeChild(this.courseExtractor.courseContainer);
    this.courseExtractor.courseContainer = null;
    this.courseExtractor.coursesContainer = null;
    this.courseExtractor.searchInput = null;
    this.courseExtractor.courseCountElement = null;
    }
    } catch (e) {
    LOG.debug('Cleanup course extractor failed:', e);
    }
    if (typeof this._imageViewerCleanup === 'function') {
    try { this._imageViewerCleanup(); } catch (e) { LOG.debug('Cleanup image viewer failed:', e); }
    this._imageViewerCleanup = null;
    }
    Utils.hideImageLightbox();
    if (this._notificationMarkReadHandler) {
    document.removeEventListener('click', this._notificationMarkReadHandler, true);
    this._notificationMarkReadHandler = null;
    }
    if (typeof this._homeSimplifyCleanup === 'function') {
    try { this._homeSimplifyCleanup(); } catch (e) { LOG.debug('Cleanup home simplify failed:', e); }
    this._homeSimplifyCleanup = null;
    }
    this.setThemeActive(false);
  }

  openPreview(url, filename, onlinePreview) {
    if (Utils.hasFileExtension(filename, CONSTANTS.FILE_EXTENSIONS.office)) {
    Utils.openTab(CONSTANTS.OFFICE_PREVIEW_BASE + encodeURIComponent(url));
    } else if (onlinePreview) {
    Utils.openTab(onlinePreview + encodeURIComponent(url));
    }
  }

  async setupCourseResources(resources) {
    if (!resources.length) return;

    const resourceItems = Utils.$x(CONSTANTS.SELECTORS.resourceItems);
    const previewItems = Utils.$x(CONSTANTS.SELECTORS.previewItems);

    if (!resourceItems.length) return;

    const getResourceId = (res) => {
    if (!res || typeof res !== 'object') return null;
    const candidates = [
    res.id,
    res.resourceId,
    res.storageId,
    res.attachmentId,
    res.storage?.id,
    ];
    for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && candidate !== '') {
      return String(candidate);
    }
    }
    return null;
    };

    const resourceById = new Map();
    const resourceNameBuckets = new Map();
    resources.forEach((res) => {
    const id = getResourceId(res);
    if (id) resourceById.set(id, res);
    const normalizedName = Utils.normalizeText(res.name || res.resourceName || res.fileName);
    if (normalizedName) {
    if (!resourceNameBuckets.has(normalizedName)) resourceNameBuckets.set(normalizedName, []);
    resourceNameBuckets.get(normalizedName).push(res);
    }
    });

    const usedResources = new Set();
    const idAttrRegex = /(resource|storage).*id/i;
    const idCandidateCache = new WeakMap();
    const nameCandidateCache = new WeakMap();
    const nameSelectorList = [
    '.resource-name',
    '.name',
    'a',
    'span',
    'p',
    '[title]'
    ];
    const nameSelectorUnion = nameSelectorList.join(',');

    const collectIdCandidates = (root) => {
    if (!root || !(root instanceof Element)) return new Set();
    if (idCandidateCache.has(root)) return idCandidateCache.get(root);
    const out = new Set();
    const stack = [root];
    while (stack.length) {
    const node = stack.pop();
    if (!(node instanceof Element)) continue;
    if (node.dataset) {
      Object.entries(node.dataset).forEach(([key, value]) => {
        if (!value) return;
        if (idAttrRegex.test(key) || key === 'id') {
        out.add(String(value).trim());
        }
      });
    }
    Array.from(node.attributes || []).forEach(attr => {
      const value = attr?.value;
      if (!value) return;
      if (idAttrRegex.test(attr.name) || attr.name === 'data-id') {
        out.add(String(value).trim());
      }
      if (attr.name === 'href') {
        const match = value.match(/(?:resource|storage)Id=([^&]+)/i);
        if (match && match[1]) out.add(match[1].trim());
      }
    });
    if (node.children && node.children.length) {
      for (let i = node.children.length - 1; i >= 0; i -= 1) {
        stack.push(node.children[i]);
      }
    }
    }
    idCandidateCache.set(root, out);
    return out;
    };

    const collectNameCandidates = (root) => {
    if (!root) return new Set();
    if (nameCandidateCache.has(root)) return nameCandidateCache.get(root);
    const out = new Set();
    const push = (text) => {
    const normalized = Utils.normalizeText(text);
    if (normalized) out.add(normalized);
    };
    if (root instanceof Element) {
    const title = root.getAttribute?.('title');
    if (title) push(title);
    if (typeof root.textContent === 'string') {
      push(root.textContent);
    }
    if (typeof root.querySelectorAll === 'function') {
      try {
        root.querySelectorAll(nameSelectorUnion).forEach(node => {
        const nodeTitle = node.getAttribute?.('title');
        if (nodeTitle) push(nodeTitle);
        if (typeof node.textContent === 'string') push(node.textContent);
        });
      } catch (_) { /* ignore selector errors */ }
    }
    } else if (root && typeof root.textContent === 'string') {
    push(root.textContent);
    }
    nameCandidateCache.set(root, out);
    return out;
    };

    const previewLookup = new Map();
    previewItems.forEach(previewEl => {
    collectIdCandidates(previewEl).forEach(id => {
    if (id && !previewLookup.has(id)) {
      previewLookup.set(id, previewEl);
    }
    });
    });

    const takeResourceFromBucket = (name) => {
    const bucket = resourceNameBuckets.get(name);
    if (!bucket || bucket.length === 0) return null;
    const idx = bucket.findIndex(res => !usedResources.has(res));
    if (idx === -1) return null;
    const [picked] = bucket.splice(idx, 1);
    return picked;
    };

    const resolveResourceForElement = (element, fallbackIndex) => {
    const fallbackPreview = previewItems[fallbackIndex] || null;
    const idCandidates = new Set([
    ...collectIdCandidates(element),
    ...collectIdCandidates(fallbackPreview)
    ]);

    for (const rawId of idCandidates) {
    const id = rawId?.trim();
    if (!id) continue;
    const res = resourceById.get(id);
    if (res && !usedResources.has(res)) {
      resourceById.delete(id);
      usedResources.add(res);
      const previewEl = previewLookup.get(id) || fallbackPreview;
      return { resource: res, previewEl };
    }
    }

    const nameCandidates = new Set([
    ...collectNameCandidates(element),
    ...collectNameCandidates(fallbackPreview)
    ]);
    for (const name of nameCandidates) {
    const res = takeResourceFromBucket(name);
    if (res && !usedResources.has(res)) {
      usedResources.add(res);
      const resId = getResourceId(res);
      const previewEl = resId ? (previewLookup.get(resId) || fallbackPreview) : fallbackPreview;
      return { resource: res, previewEl };
    }
    }

    const fallbackResource = resources[fallbackIndex];
    if (fallbackResource && !usedResources.has(fallbackResource)) {
    usedResources.add(fallbackResource);
    const resId = getResourceId(fallbackResource);
    const previewEl = resId ? (previewLookup.get(resId) || fallbackPreview) : fallbackPreview;
    return { resource: fallbackResource, previewEl };
    }

    return null;
    };

    // 为每个资源添加功能
    resourceItems.forEach((element, index) => {
    const resolved = resolveResourceForElement(element, index);
    if (!resolved) {
    LOG.warnThrottled('resource-resolve', '未能为资源项匹配对应的数据，可能导致按钮缺失。');
    return;
    }

    const { resource, previewEl } = resolved;
    const resourceId = getResourceId(resource);
    if (resourceId) {
    element.dataset.uepResourceId = resourceId;
    if (previewEl && previewEl instanceof Element) {
      previewEl.dataset.uepResourceId = resourceId;
    }
    }

    // 自动下载功能
    if (Settings.get('preview', 'autoDownload') && previewEl && !previewEl.dataset.uepAutoDownloadBound) {
    previewEl.dataset.uepAutoDownloadBound = '1';
    previewEl.addEventListener('click', async () => {
      try {
        const { previewUrl } = await API.getPreviewURL(resource.id);
        await this.downloadManager.downloadFile(previewUrl, resource.name);
      } catch (error) {
        LOG.error('Auto download error:', error);
      }
    }, false);
    }

    // 显示所有下载按钮
    if (Settings.get('course', 'showAllDownloadButton') && !element.dataset.uepDownloadButtonBound) {
    element.dataset.uepDownloadButtonBound = '1';
    this.addDownloadButton(element, resource, index);
    }
    });

    // 清理旧版“下载全部”按钮（如果存在）
    const oldAllBtn = document.getElementById('downloadAllButton');
    if (oldAllBtn) {
    const parent = oldAllBtn.parentElement;
    oldAllBtn.remove();
    if (parent && parent.childNodes.length === 0) parent.remove();
    }

    // 仅保留“打包下载 Zip”
    if (Settings.get('course', 'addBatchDownload')) {
    this.addBatchDownloadButton(resources);
    }
  }







  addDownloadButton(container, resource, index) {
    const downloadBtn = document.createElement('i');
    downloadBtn.title = '下载';
    downloadBtn.classList.add('by-icon-download', 'btn-icon', 'visible');
    downloadBtn.style.cssText = `
    display: inline-block !important;
    visibility: visible !important;
    cursor: pointer !important;
    `;

    // 获取data-v属性
    const dataAttr = Array.from(container.attributes).find(attr =>
    attr.localName.startsWith('data-v')
    );
    if (dataAttr) {
    downloadBtn.setAttribute(dataAttr.localName, '');
    }

    downloadBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
    const { previewUrl } = await API.getPreviewURL(resource.id);
    const useGM = typeof GM_download === 'function';
    if (useGM) {
      // 单文件默认询问保存位置（更贴合用户期望）
      await this.downloadManager.downloadViaGM(previewUrl, Utils.sanitizeFilename(resource.name), true);
    } else {
      await this.downloadManager.downloadFile(previewUrl, Utils.sanitizeFilename(resource.name));
    }
    } catch (error) {
    LOG.error('Download error:', error);
    NotificationManager.show('下载失败', error.message, 'error');
    }
    }, false);

    // 移除已存在的下载/预览图标，避免重复
    container.querySelectorAll('i.by-icon-download, i.by-icon-yundown-grey, i.by-icon-eye-grey')
    .forEach(icon => icon.remove());
    container.insertAdjacentElement('afterbegin', downloadBtn);
  }

  getCurrentCourseTitle() {
    const selectors = [
    '.course-info .title',
    '.course-header .title',
    '.course-title',
    '.breadcrumb .active',
    '.course-name',
    ];
    for (const selector of selectors) {
    const node = document.querySelector(selector);
    if (node && node.textContent && node.textContent.trim()) {
    return node.textContent.trim();
    }
    }
    const title = document.title || '';
    if (title.includes('-')) {
    return title.split('-')[0].trim() || '课程资源';
    }
    return title.trim() || '课程资源';
  }

  _dedupeFileName(folderKey, filename, tracker) {
    const key = folderKey || '.';
    if (!tracker.has(key)) tracker.set(key, new Set());
    const used = tracker.get(key);
    const dotIndex = filename.lastIndexOf('.');
    const namePart = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
    const ext = dotIndex > 0 ? filename.slice(dotIndex) : '';
    let candidate = filename;
    let counter = 1;
    while (used.has(candidate.toLowerCase())) {
    candidate = `${namePart} (${counter})${ext}`;
    counter += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  }

  buildZipIndexHtml(courseName, entries) {
    const tree = { name: '', children: new Map(), files: [] };
    const collator = typeof Intl !== 'undefined' && Intl.Collator
    ? new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' })
    : null;
    const compare = (a, b) => collator ? collator.compare(a, b) : a.localeCompare(b);

    const addEntry = (relativePath, entry) => {
    const segments = relativePath.split('/').filter(Boolean);
    let node = tree;
    for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (!node.children.has(segment)) {
      node.children.set(segment, { name: segment, children: new Map(), files: [] });
    }
    node = node.children.get(segment);
    }
    node.files.push(entry);
    };

    entries.forEach(entry => addEntry(entry.relativePath, entry));

    const renderNode = (node) => {
    const childFolders = Array.from(node.children.keys()).sort(compare);
    const files = node.files.slice().sort((a, b) => compare(a.name, b.name));
    let html = '<ul>';

    childFolders.forEach(folderName => {
    const child = node.children.get(folderName);
    html += `<li class="folder"><span>${Utils.escapeHtml(folderName)}</span>${renderNode(child)}</li>`;
    });

    files.forEach(file => {
    html += `<li class="file"><a href="${file.encodedPath}" download="${Utils.escapeHtml(file.name)}">${Utils.escapeHtml(file.name)}</a><span class="size">${Utils.escapeHtml(Utils.formatBytes(file.size))}</span></li>`;
    });

    html += '</ul>';
    return html;
    };

    const generatedAt = new Date().toLocaleString();
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${Utils.escapeHtml(courseName)} - 课件索引</title>
  <style>
  body { font-family: "Segoe UI", "Microsoft YaHei", sans-serif; margin: 24px; color: #333; background: #fafafa; }
  h1 { margin-bottom: 0.2em; }
  .summary { color: #666; margin-bottom: 1em; }
  ul { list-style: none; margin-left: 1em; padding-left: 1em; border-left: 1px dashed #ddd; }
  li { margin: 4px 0; }
  li.folder > span { font-weight: 600; color: #409EFF; }
  li.file a { text-decoration: none; color: #2c3e50; }
  li.file a:hover { text-decoration: underline; }
  li.file .size { color: #999; margin-left: 8px; font-size: 12px; }
  </style>
</head>
<body>
  <h1>${Utils.escapeHtml(courseName)} - 课件索引</h1>
  <div class="summary">共 ${entries.length} 个文件 · 生成时间：${Utils.escapeHtml(generatedAt)}</div>
  <div class="tree">
  ${renderNode(tree)}
  </div>
</body>
</html>`;
  }

  async downloadResourcesAsZip(resources) {
    const JSZip = await Utils.ensureJSZip();
    const zip = new JSZip();
    const courseName = this.getCurrentCourseTitle();
    const rootName = Utils.sanitizeFilename(courseName) || '课程资源';
    const rootFolder = zip.folder(rootName);
    const nameTracker = new Map();
    const entries = [];
    const progress = this.downloadManager.ensureProgress();
    this.downloadManager.downloading = true;
    this.downloadManager.beginProgress();

    const total = resources.length || 1;
    let completed = 0;

    const updateProgress = (fraction) => {
    if (progress && typeof progress.set === 'function') {
    progress.set(Math.min(0.9, Math.max(0, fraction)));
    }
    };

    try {
    for (let index = 0; index < resources.length; index++) {
    if (!this.isBatchDownloading) throw new Error('用户取消');
    const resource = resources[index];
    const safeName = Utils.sanitizeFilename(resource.name || `文件_${index + 1}`);
    const pathSegments = Utils.toPathSegments(resource.path);
    const folderKey = pathSegments.join('/') || '.';
    const finalName = this._dedupeFileName(folderKey, safeName, nameTracker);
    const relativeSegments = pathSegments.length ? [...pathSegments, finalName] : [finalName];

    const { previewUrl } = await Utils.withRetry(() => API.getPreviewURL(resource.id), 3, 400);
    if (!this.isBatchDownloading) throw new Error('用户取消');

    const buffer = await this.downloadManager.fetchBinary(previewUrl, {
      timeoutMs: 20000,
      onProgress: (loaded, totalBytes) => {
        if (!this.isBatchDownloading) return;
        const fraction = totalBytes > 0
        ? (completed + Math.min(loaded / totalBytes, 1)) / total
        : (completed + 0.5) / total;
        updateProgress(fraction);
      }
    });

    if (!this.isBatchDownloading) throw new Error('用户取消');

    const fileData = buffer instanceof ArrayBuffer ? buffer : buffer?.buffer || buffer;
    const folder = pathSegments.reduce((acc, segment) => acc.folder(segment), rootFolder);
    folder.file(finalName, fileData);

    const size = fileData instanceof ArrayBuffer ? fileData.byteLength : (fileData?.length || 0);
    const relativePath = relativeSegments.join('/');
    entries.push({
      name: finalName,
      relativePath,
      encodedPath: Utils.encodePathSegments(relativeSegments),
      size,
    });

    completed += 1;
    updateProgress(completed / total);
    }

    rootFolder.file('index.html', this.buildZipIndexHtml(courseName, entries));
    rootFolder.file('metadata.json', JSON.stringify({
    courseName,
    generatedAt: new Date().toISOString(),
    files: entries,
    }, null, 2));

    const blob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
    if (progress && typeof progress.set === 'function') {
      const percent = typeof metadata?.percent === 'number' ? metadata.percent : 0;
      const value = 0.9 + (percent / 100) * 0.1;
      progress.set(Math.min(1, value));
    }
    });

    const zipName = Utils.sanitizeFilename(`${courseName || '课程资源'}-${Utils.formatDateForFilename()}.zip`);
    this.downloadManager.saveBlob(blob, zipName);
    NotificationManager.show('打包完成', `成功打包 ${entries.length} 个文件`);
    return 'success';
    } catch (error) {
    if (/取消/.test(error?.message || '') || error?.message === '下载已取消') {
    NotificationManager.show('已取消', '批量打包已停止', 'info');
    return 'cancelled';
    }
    LOG.error('Zip download error:', error);
    NotificationManager.show('打包失败', error?.message || '未知错误', 'error');
    throw error;
    } finally {
    this.downloadManager.resetTransferState();
    }
  }

  async runLegacyBatchDownload(resources) {
    const useGM = typeof GM_download === 'function';
    const concurrency = 1;
    let nextIndex = 0;

    const fetchPreview = async (id) => {
    let attempt = 0;
    while (attempt < 3) {
    try {
      return await API.getPreviewURL(id);
    } catch (error) {
      attempt += 1;
      if (attempt >= 3) throw error;
      await Utils.sleep(300 * attempt);
    }
    }
    };

    const worker = async () => {
    while (this.isBatchDownloading) {
    const index = nextIndex++;
    if (index >= resources.length) return;
    const resource = resources[index];
    const safeName = Utils.sanitizeFilename(resource.name || `file_${index + 1}`);

    let attempt = 0;
    const maxAttempts = 5;
    while (this.isBatchDownloading && attempt < maxAttempts) {
      try {
        const { previewUrl } = await fetchPreview(resource.id);
        if (!this.isBatchDownloading) return;
        if (useGM) {
        await this.downloadManager.downloadViaGM(previewUrl, safeName, false);
        } else {
        await this.downloadManager.downloadFile(previewUrl, safeName);
        }
        await Utils.sleep(300 + Math.random() * 400);
        break;
      } catch (error) {
        attempt += 1;
        LOG.error('Batch item download error:', error);
        if (attempt >= maxAttempts) break;
        await Utils.sleep(700 * attempt);
      }
    }
    }
    };

    try {
    const workers = Array.from({ length: concurrency }, () => worker());
    await Promise.all(workers);
    if (!this.isBatchDownloading) {
    NotificationManager.show('已取消', '批量下载已停止', 'info');
    return 'cancelled';
    }
    return 'completed';
    } catch (error) {
    LOG.error('Batch download error:', error);
    NotificationManager.show('批量下载失败', error?.message || '未知错误', 'error');
    throw error;
    }
  }

  addBatchDownloadButton(resources) {
    if (document.getElementById('downloadAllButton')) return;

    const buttonHtml = `
    <div style="display: flex; flex-direction: row; justify-content: end; margin-right: 24px; margin-top: 20px;">
    <button type="button" class="el-button submit-btn el-button--primary" id="downloadAllButton">
      下载全部
    </button>
    </div>
    `;

    const resourceList = Utils.$x('/html/body/div/div/div[2]/div[2]/div/div/div');
    if (!resourceList.length) return;

    const containerElement = document.createElement('div');
    containerElement.innerHTML = buttonHtml;
    resourceList[0].before(containerElement);

    const button = document.getElementById('downloadAllButton');
    const zipMode = Settings.get('course', 'zipBatchDownload');
    const idleLabel = zipMode ? '打包下载' : '下载全部';
    const cancelLabel = zipMode ? '取消打包' : '取消下载';
    button.textContent = idleLabel;

    button.onclick = async () => {
    // 若正在批量下载，则视为取消
    if (this.isBatchDownloading) {
    this.isBatchDownloading = false;
    this.downloadManager.cancel();
    button.textContent = idleLabel;
    return;
    }

    if (!Array.isArray(resources) || resources.length === 0) {
    NotificationManager.show('暂无文件', '当前课程没有可下载的课件', 'info');
    return;
    }

    // 开始批量下载
    this.isBatchDownloading = true;
    button.textContent = cancelLabel;

    try {
    if (zipMode) {
      await this.downloadResourcesAsZip(resources);
    } else {
      await this.runLegacyBatchDownload(resources);
    }
    } catch (error) {
    // 已在具体方法中处理通知与日志，这里仅确保状态回收
    } finally {
    this.isBatchDownloading = false;
    button.textContent = idleLabel;
    }
    };
  }
  createImageViewer(imageUrl) {
    if (!imageUrl) return;
    if (typeof this._imageViewerCleanup === 'function') {
    try { this._imageViewerCleanup(); } catch (e) { LOG.debug('Close existing image viewer failed:', e); }
    this._imageViewerCleanup = null;
    }
    const cleanup = Utils.showImageLightbox(imageUrl, {
    onClose: () => { this._imageViewerCleanup = null; }
    });
    if (typeof cleanup === 'function') {
    this._imageViewerCleanup = () => {
    cleanup();
    this._imageViewerCleanup = null;
    };
    } else {
    // Fallback：直接在新标签中打开
    Utils.openTab(imageUrl, { active: true });
    }
  }

  createUI() {
    if (!Settings.get('system', 'showConfigButton')) {
    if (this._settingsToggle) this._settingsToggle.style.display = 'none';
    if (this._settingsPanel) this._settingsPanel.style.display = 'none';
    this._settingsInitialized = false;
    return;
    }

    if (this._settingsInitialized) {
    if (this._settingsToggle) this._settingsToggle.style.display = '';
    return;
    }
    this._settingsInitialized = true;

    if (!this._settingsStylesInjected) {
    GM_addStyle(`
    #yzHelper-settings {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #fff;
    box-shadow: 0 4px 16px rgba(0,0,0,0.08);
    border-radius: 12px;
    z-index: 9999;
    width: 500px;
    height: 450px;
    font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
    transition: all 0.3s ease;
    opacity: 0;
    transform: translateY(10px);
    color: #333;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    display: none;
    }
    #yzHelper-settings.visible {
    opacity: 1;
    transform: translateY(0);
    }

    #yzHelper-header {
    padding: 15px 20px;
    border-bottom: 1px solid #ebeef5;
    background: #fff;
    color: #303133;
    font-weight: bold;
    font-size: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: none;
    }

    #yzHelper-main {
    display: flex;
    flex: 1;
    overflow: hidden;
    }

    #yzHelper-settings-sidebar {
    width: 140px;
    background: #f5f7fa;
    padding: 15px 0;
    border-right: 1px solid #ebeef5;
    overflow-y: auto;
    overflow-x: hidden;
    }

    #yzHelper-settings-sidebar .menu-item {
    padding: 12px 15px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 14px;
    color: #606266;
    display: flex;
    align-items: center;
    gap: 8px;
    border-radius: 6px 0 0 6px;
    margin: 2px 0;
    }

    #yzHelper-settings-sidebar .menu-item:hover {
    background: #e3f0fd;
    color: #409EFF;
    transform: none;
    }

    #yzHelper-settings-sidebar .menu-item.active {
    background: #409EFF;
    color: #fff;
    font-weight: 500;
    box-shadow: none;
    }

    #yzHelper-settings-sidebar .emoji {
    font-size: 16px;
    }

    #yzHelper-settings-content {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
    position: relative;
    padding-bottom: 70px;
    background: #fff;
    }

    #yzHelper-settings-content .settings-section {
    display: none;
    }

    #yzHelper-settings-content .settings-section.active {
    display: block;
    }

    #yzHelper-settings h3 {
    margin-top: 0;
    margin-bottom: 15px;
    font-size: 18px;
    font-weight: 600;
    color: #303133;
    padding-bottom: 10px;
    border-bottom: 1px solid #ebeef5;
    }
    #yzHelper-settings .setting-item {
    margin-bottom: 16px;
    }
    #yzHelper-settings .setting-toggle {
    display: flex;
    align-items: center;
    }
    #yzHelper-settings .setting-item:last-of-type {
    margin-bottom: 20px;
    }
    #yzHelper-settings .switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    margin-right: 10px;
    }
    #yzHelper-settings .switch input {
    opacity: 0;
    width: 0;
    height: 0;
    }
    #yzHelper-settings .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #dcdfe6;
    transition: .3s;
    border-radius: 24px;
    }
    #yzHelper-settings .slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: .3s;
    border-radius: 50%;
    }
    #yzHelper-settings input:checked + .slider {
    background: #409EFF;
    box-shadow: none;
    }
    #yzHelper-settings input:focus + .slider {
    box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.15);
    }
    #yzHelper-settings input:checked + .slider:before {
    transform: translateX(20px);
    }
    #yzHelper-settings .setting-label {
    font-size: 14px;
    cursor: pointer;
    }

    #yzHelper-settings .setting-description {
    display: block;
    margin-left: 54px;
    font-size: 12px;
    color: #666;
    background: #f5f7fa;
    border-left: 3px solid #409EFF;
    border-radius: 0 4px 4px 0;
    max-height: 0;
    overflow: hidden;
    opacity: 0;
    transition: all 0.3s ease;
    padding: 0 12px;
    box-shadow: none;
    }

    #yzHelper-settings .setting-description.visible {
    max-height: 100px;
    opacity: 1;
    margin-top: 8px;
    padding: 8px 12px;
    }

    #yzHelper-settings .buttons {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    position: absolute;
    bottom: 0px;
    right: 0px;
    background: #fff;
    padding: 10px 20px;
    width: calc(100% - 40px);
    border-top: 1px solid #ebeef5;
    box-sizing: border-box;
    }
    #yzHelper-settings button {
    background: #409EFF;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
    color: #fff;
    transition: all 0.2s ease;
    outline: none;
    font-size: 14px;
    box-shadow: none;
    }
    #yzHelper-settings button:hover {
    background: #3076c9;
    transform: none;
    box-shadow: none;
    }
    #yzHelper-settings button.cancel {
    background: #f5f7fa;
    color: #606266;
    box-shadow: none;
    }
    #yzHelper-settings button.cancel:hover {
    background: #e4e7ed;
    transform: none;
    box-shadow: none;
    }

    #yzHelper-settings-toggle {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #409EFF;
    color: #fff;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    cursor: pointer;
    z-index: 9998;
    box-shadow: 0 4px 12px rgba(64, 158, 255, 0.15);
    transition: all 0.3s ease;
    }
    #yzHelper-settings-toggle:hover {
    background: #3076c9;
    transform: scale(1.05);
    box-shadow: 0 6px 20px rgba(64, 158, 255, 0.18);
    }

    #yzHelper-settings input[type="text"],
    #yzHelper-settings input[type="password"],
    #yzHelper-settings input[type="email"] {
    width: 100%;
    padding: 10px 15px;
    border: 1px solid #dcdfe6;
    border-radius: 4px;
    font-size: 14px;
    color: #606266;
    box-sizing: border-box;
    transition: all 0.3s;
    outline: none;
    background: #fff;
    }
    #yzHelper-settings input[type="text"]:focus,
    #yzHelper-settings input[type="password"]:focus,
    #yzHelper-settings input[type="email"]:focus {
    border-color: #409EFF;
    box-shadow: 0 0 0 2px rgba(64, 158, 255, 0.12);
    }

    #yzHelper-settings .action-btn {
    background: #f56c6c;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.3s;
    outline: none;
    }

    #yzHelper-settings .action-btn:hover {
    background: #e55353;
    }

    #yzHelper-settings .action-btn:disabled {
    background: #c0c4cc;
    cursor: not-allowed;
    }

    #yzHelper-settings .action-btn.secondary {
    background: #409EFF;
    margin-left: 10px;
    }

    #yzHelper-settings .action-btn.secondary:hover {
    background: #337ecc;
    }

    #yzHelper-settings .setting-toggle {
    flex-wrap: wrap;
    gap: 10px;
    }
    `);
    this._settingsStylesInjected = true;
    }

    // 创建设置按钮
    let settingsToggle = document.getElementById("yzHelper-settings-toggle");
    if (!settingsToggle) {
    settingsToggle = document.createElement('div');
    settingsToggle.id = "yzHelper-settings-toggle";
    settingsToggle.title = "云邮助手设置";
    settingsToggle.innerHTML = SVG_ICONS.settingsGear;
    document.body.appendChild(settingsToggle);
    } else {
    settingsToggle.style.display = '';
    }
    this._settingsToggle = settingsToggle;

    // 创建设置面板
    let settingsPanel = document.getElementById("yzHelper-settings");
    if (!settingsPanel) {
    settingsPanel = document.createElement("div");
    settingsPanel.id = "yzHelper-settings";
    document.body.appendChild(settingsPanel);
    }
    this._settingsPanel = settingsPanel;

    settingsPanel.innerHTML = this.buildSettingsHeader() + this.buildSettingsMainContent();
    if (!document.body.contains(settingsPanel)) {
    document.body.appendChild(settingsPanel);
    }

    // 调整设置图标，替换占位问号
    try { this.adjustSettingsIcons(settingsToggle, settingsPanel); } catch (e) { /* noop */ }

    // 事件处理
    this.setupSettingsEvents(settingsToggle, settingsPanel);
  }

  buildSettingsHeader() {
    return `
    <div id="yzHelper-header">
    <span>云邮教学空间助手</span>
    <span id="yzHelper-version">v${VERSION}</span>
    </div>
    `;
  }

  buildSettingsMainContent() {
    const sidebarHtml = this.buildSettingsSidebarHtml();
    const sectionsHtml = this.buildSettingsSectionsHtml();
    return `
    <div id="yzHelper-main">
    <div id="yzHelper-settings-sidebar">
      ${sidebarHtml}
    </div>
    <div id="yzHelper-settings-content">
      ${sectionsHtml}
      <div class="buttons">
        <button id="cancelSettings" class="cancel">取消</button>
        <button id="saveSettings">保存设置</button>
      </div>
    </div>
    </div>
    `;
  }

  buildSettingsSidebarHtml() {
    return SETTINGS_SECTIONS.map((section, index) => `
    <div class="menu-item ${index === 0 ? 'active' : ''}" data-section="${section.id}">
    <span class="emoji">?</span>
    <span>${Utils.escapeHtml(section.title)}</span>
    </div>
    `).join('');
  }

  buildSettingsSectionsHtml() {
    return SETTINGS_SECTIONS.map((section, index) => `
    <div class="settings-section ${index === 0 ? 'active' : ''}" id="section-${section.id}">
    <h3>${Utils.escapeHtml(section.heading)}</h3>
    ${section.options.map(option => this.renderSettingOption(section, option)).join('')}
    </div>
    `).join('');
  }

  renderSettingOption(sectionConfig, option) {
    if (option.type === 'action') {
    const buttonClass = option.buttonClass || 'action-btn';
    const description = option.description ? `<div class="setting-description">${Utils.escapeHtml(option.description)}</div>` : '';
    return `
    <div class="setting-item">
      <div class="setting-toggle">
        <button id="${option.buttonId}" class="${buttonClass}">${Utils.escapeHtml(option.buttonText || '执行')}</button>
      </div>
      ${description}
    </div>
    `;
    }

    const category = option.category || sectionConfig.defaultCategory;
    const key = option.key;
    if (!category || !key) return '';
    const inputId = `${category}_${key}`;
    const descId = `description-${inputId}`;
    const checked = Settings.get(category, key) ? 'checked' : '';
    const label = Utils.escapeHtml(option.label);
    const description = option.description ? Utils.escapeHtml(option.description) : '';

    return `
    <div class="setting-item">
    <div class="setting-toggle">
      <label class="switch">
        <input type="checkbox" id="${inputId}" ${checked}>
        <span class="slider"></span>
      </label>
      <span class="setting-label" data-for="${descId}">${label}</span>
    </div>
    ${description ? `<div class="setting-description" id="${descId}">${description}</div>` : ''}
    </div>
    `;
  }

  getSectionIcon(section) {
    const iconMap = {
    gear: SVG_ICONS.settingsGear,
    home: SVG_ICONS.settingsHome,
    preview: SVG_ICONS.settingsPreview,
    course: SVG_ICONS.homeworkCourse,
    homework: SVG_ICONS.homeworkTeacher,
    notification: SVG_ICONS.settingsNotification,
    system: SVG_ICONS.settingsSystem,
    };
    return iconMap[section] || '';
  }

  adjustSettingsIcons(settingsToggle, settingsPanel) {
    if (settingsToggle) {
    const gearIcon = this.getSectionIcon('gear');
    if (gearIcon) settingsToggle.innerHTML = gearIcon;
    }

    if (!settingsPanel) return;

    Utils.qsa('#yzHelper-settings-sidebar .menu-item', settingsPanel).forEach(item => {
    const section = item.getAttribute('data-section');
    const holder = item.querySelector('.emoji');
    const icon = this.getSectionIcon(section);
    if (holder && icon) holder.innerHTML = icon;
    });

    Utils.qsa('#yzHelper-settings-content h3', settingsPanel).forEach(h3 => {
    try { h3.textContent = (h3.textContent || '').replace(/^[?？]+\s*/, ''); } catch (e) {}
    });
  }

  setupSettingsEvents(settingsToggle, settingsPanel) {
    // 菜单切换功能
    document.querySelectorAll("#yzHelper-settings-sidebar .menu-item").forEach((item) => {
    item.addEventListener("click", function () {
    document.querySelectorAll("#yzHelper-settings-sidebar .menu-item").forEach((i) => {
      i.classList.remove("active");
    });
    document.querySelectorAll("#yzHelper-settings-content .settings-section").forEach((section) => {
      section.classList.remove("active");
    });

    this.classList.add("active");
    const sectionId = "section-" + this.getAttribute("data-section");
    document.getElementById(sectionId).classList.add("active");

    document.querySelectorAll(".setting-description").forEach((desc) => {
      desc.classList.remove("visible");
    });
    });
    });

    // 设置描述显示/隐藏功能
    document.querySelectorAll(".setting-label").forEach((label) => {
    label.addEventListener("click", function () {
    const descriptionId = this.getAttribute("data-for");
    const description = document.getElementById(descriptionId);

    document.querySelectorAll(".setting-description").forEach((desc) => {
      if (desc.id !== descriptionId) {
        desc.classList.remove("visible");
      }
    });

    description.classList.toggle("visible");
    });
    });

    const settingsTrigger = () => {
    const isVisible = settingsPanel.classList.contains("visible");
    if (isVisible) {
    settingsPanel.classList.remove("visible");
    setTimeout(() => {
      settingsPanel.style.display = "none";
    }, 300);
    } else {
    settingsPanel.style.display = "flex";
    void settingsPanel.offsetWidth;
    settingsPanel.classList.add("visible");
    }
    };

    const notifySettingsSaved = () => NotificationManager.show("设置已保存", "刷新页面后生效");

    settingsToggle.addEventListener("click", settingsTrigger);

    document.getElementById("cancelSettings").addEventListener("click", () => {
    settingsPanel.classList.remove("visible");
    setTimeout(() => {
    settingsPanel.style.display = "none";
    }, 300);
    });

    document.getElementById("saveSettings").addEventListener("click", () => {
    Array.from(document.querySelector("#yzHelper-settings-content").querySelectorAll('input[type="checkbox"]')).forEach((checkbox) => {
    const checkboxId = checkbox.id;
    if (checkboxId.includes("_")) {
      const [category, settingName] = checkboxId.split("_");
      if (Settings.defaults[category] && settingName) {
        Settings.set(category, settingName, checkbox.checked);
      }
    }
    });
    settingsPanel.classList.remove("visible");
    setTimeout(() => {
    settingsPanel.style.display = "none";
    notifySettingsSaved();
    }, 300);
    });

    // 清空作业回收站按钮事件
    const clearDeletedBtn = document.getElementById("clear-deleted-homeworks-btn");
    if (clearDeletedBtn) {
    const updateButtonState = () => {
    const deletedCount = Storage.getDeletedHomeworks().length;
    clearDeletedBtn.textContent = `清空作业回收站 (${deletedCount})`;
    clearDeletedBtn.disabled = deletedCount === 0;
    };

    updateButtonState();

    clearDeletedBtn.addEventListener("click", () => {
    const deletedHomeworks = Storage.getDeletedHomeworks();
    if (deletedHomeworks.length === 0) {
      notifySettingsSaved();
      return;
    }

    if (confirm(`确定要清空回收站中的 ${deletedHomeworks.length} 个作业吗？此操作不可恢复！`)) {
      Storage.clearDeletedHomeworks();
      this.updateTrashBinSummary();
      updateButtonState();
      notifySettingsSaved();
    }
    });
    }
  }

  registerMenuCommands() {
    GM_registerMenuCommand('显示/隐藏插件悬浮窗', () => {
    const current = Settings.get('system', 'showConfigButton');
    Settings.set('system', 'showConfigButton', !current);
    NotificationManager.show('设置已更新', '页面刷新后生效');
    });
    // 切换调试日志
    GM_registerMenuCommand('切换调试日志', () => {
    const cur = GM_getValue('DEBUG', false);
    const next = !cur;
    GM_setValue('DEBUG', next);
    DEBUG = next;
    NotificationManager.show('提示', next ? 'DEBUG 已开启' : 'DEBUG 已关闭');
    });
  }

  // removed dead: destroy

  async handleCoursesPage() {
    const enableNewView = Settings.get('home', 'enableNewView');
    this.setThemeActive(enableNewView);
    if (Settings.get('system', 'betterTitle')) {
    document.title = '我的课程 - 教学云空间';
    }

    // 检查是否开启新版视图功能
    if (!enableNewView) {
    return;
    }

    // 增加更严格的页面检查，确保真正在课程页面上
    const isReallyCoursePage = this.isCourseRoute();

    // 检查是否为通知页面
    const isNotificationPage = this.isNotificationRoute();

    if (!isReallyCoursePage || isNotificationPage) {
    return;
    }

    // 优先检查DOM中是否存在课程相关元素，不存在则直接返回
    if (!Utils.qs('.my-lesson-section') &&
    !Utils.qs('.el-carousel__item')) {
    LOG.debug('未检测到课程页面DOM元素，跳过处理');
    return;
    }

    try {
    await Utils.wait(() => Utils.qs('.my-lesson-section'), {
    timeout: 8000,
    observerOptions: { childList: true, subtree: true }
    });
    } catch (e) {
    LOG.error('等待课程容器超时:', e);
    return;
    }

    try {
    const success = await this.courseExtractor.extractCourses();
    if (success) {
    const displaySuccess = this.courseExtractor.displayCourses();

    if (displaySuccess) {
      // 隐藏原始容器
      this.courseExtractor.toggleOriginalContainer(false);
    } else {
      LOG.error('课程显示失败');
      this.courseExtractor.toggleOriginalContainer(true);
    }
    } else {
    this.courseExtractor.toggleOriginalContainer(true);
    NotificationManager.show('正在加载', '首次提取失败，5秒后自动重试...', 'info');

    if (this._courseExtractorRetryTimer) {
      clearTimeout(this._courseExtractorRetryTimer);
    }
    this._courseExtractorRetryTimer = window.setTimeout(async () => {
      this._courseExtractorRetryTimer = null;
      if (!this.isCourseRoute() || this.isNotificationRoute()) return;
      const retrySuccess = await this.courseExtractor.extractCourses({ force: true });
      if (retrySuccess) {
        const displaySuccess = this.courseExtractor.displayCourses();
        if (displaySuccess) {
        this.courseExtractor.toggleOriginalContainer(false);
        } else {
        this.courseExtractor.toggleOriginalContainer(true);
        }
      } else {
        LOG.error('多次尝试后仍无法提取课程');
        NotificationManager.show('提取失败', '无法提取课程列表，请刷新页面重试', 'error');
        this.courseExtractor.toggleOriginalContainer(true);
      }
    }, 5000);
    }
    } catch (error) {
    LOG.error('处理课程页面时出错:', error);
    NotificationManager.show('发生错误', '处理课程页面时出错: ' + error.message, 'error');
    this.courseExtractor.toggleOriginalContainer(true);
    }
  }
  }

  
