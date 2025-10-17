export type SettingCategory =
  | "home"
  | "preview"
  | "course"
  | "homework"
  | "notification"
  | "system";

export interface SettingActionOption {
  type: "action";
  buttonId: string;
  buttonText: string;
  buttonClass?: string;
  description?: string;
}

export interface SettingToggleOption {
  key: string;
  default: boolean;
  label: string;
  description: string;
  category?: SettingCategory;
  type?: undefined;
}

export type SettingOption = SettingActionOption | SettingToggleOption;

export interface SettingSection {
  id: SettingCategory;
  iconKey: SettingCategory;
  title: string;
  heading: string;
  defaultCategory: SettingCategory;
  options: SettingOption[];
}

export const SETTINGS_SECTIONS: SettingSection[] = [
  {
    id: "home",
    iconKey: "home",
    title: "个人主页",
    heading: "个人主页设置",
    defaultCategory: "home",
    options: [
      {
        key: "enableNewView",
        default: true,
        label: "开启新版视图",
        description:
          "开启新版界面视图，包含：1）统一作业视图：将所有待办作业在一个界面中统一显示，包含课程来源、截止时间、紧急程度等信息；2）课程列表显示：将本学期所有课程在一个界面中统一展示，提供搜索功能，无需翻页查看。",
      },
      {
        key: "simplifyHomePage",
        default: false,
        label: "简化主页界面",
        description:
          "隐藏顶部导航菜单和右侧访问历史面板，使界面更加简洁，专注于作业和课程内容。",
      },
      {
        key: "noConfirmDelete",
        default: false,
        label: "删除作业时不再提示",
        description:
          "删除作业时跳过确认对话框，直接移入回收站。可以提高操作效率，但需要小心操作。",
      },
      {
        type: "action",
        buttonId: "clear-deleted-homeworks-btn",
        buttonText: "清空作业回收站",
        buttonClass: "action-btn",
      },
    ],
  },
  {
    id: "preview",
    iconKey: "preview",
    title: "课件预览",
    heading: "课件预览设置",
    defaultCategory: "preview",
    options: [
      {
        key: "autoDownload",
        default: false,
        label: "预览课件时自动下载",
        description:
          "当打开课件预览时，自动触发下载操作，方便存储课件到本地。",
      },
      {
        key: "autoSwitchOffice",
        default: false,
        label: "使用 Office365 预览 Office 文件",
        description:
          "使用微软 Office365 在线服务预览 Office 文档，提供更好的浏览体验。",
      },
      {
        key: "autoSwitchPdf",
        default: true,
        label: "使用浏览器原生阅读器预览PDF文件",
        description:
          "使用系统（浏览器）原生的阅读器预览PDF文档，提供更好的浏览体验。",
      },
      {
        key: "autoSwitchImg",
        default: true,
        label: "使用脚本内置阅读器预览图片文件",
        description:
          "使用脚本内置的阅读器预览图片文件，提供更好的浏览体验。",
      },
      {
        key: "autoClosePopup",
        default: true,
        label: "自动关闭弹窗",
        description:
          "自动关闭预览时出现的“您已经在学习”等提示弹窗。",
      },
      {
        key: "hideTimer",
        default: true,
        label: "隐藏预览界面倒计时",
        description: "隐藏预览界面中的倒计时提示，获得无干扰的阅读体验。",
      },
    ],
  },
  {
    id: "course",
    iconKey: "course",
    title: "课程详情",
    heading: "课程详情设置",
    defaultCategory: "course",
    options: [
      {
        key: "addBatchDownload",
        default: true,
        label: "增加批量下载按钮",
        description: "增加批量下载按钮，方便一键下载课程中的所有课件。",
      },
      {
        key: "zipBatchDownload",
        default: false,
        label: "批量打包为 Zip",
        description: "将批量下载的课件打包成 Zip 文件，方便集中管理。",
      },
      {
        key: "showAllDownloadButton",
        default: false,
        label: "显示所有下载按钮",
        description:
          "使每个课件文件都有下载按钮，不允许下载的课件在启用后也可以下载。",
      },
    ],
  },
  {
    id: "homework",
    iconKey: "homework",
    title: "作业详情",
    heading: "作业详情设置",
    defaultCategory: "homework",
    options: [
      {
        key: "showHomeworkSource",
        default: true,
        label: "显示作业所属课程",
        description:
          "在作业详情页显示作业所属的课程名称，便于区分不同课程的作业。",
      },
    ],
  },
  {
    id: "notification",
    iconKey: "notification",
    title: "消息通知",
    heading: "消息通知设置",
    defaultCategory: "notification",
    options: [
      {
        key: "showMoreNotification",
        default: true,
        label: "显示更多的通知",
        description:
          "在通知列表中显示更多的历史通知，不再受限于默认显示数量。",
      },
      {
        key: "sortNotificationsByTime",
        default: true,
        label: "通知按照时间排序",
        description: "将通知按照时间先后顺序排列，更容易找到最新或最早的通知。",
      },
      {
        key: "betterNotificationHighlight",
        default: true,
        label: "优化未读通知高亮",
        description:
          "增强未读通知的视觉提示，使未读消息更加醒目，不易遗漏重要信息。",
      },
    ],
  },
  {
    id: "system",
    iconKey: "system",
    title: "系统设置",
    heading: "系统设置",
    defaultCategory: "system",
    options: [
      {
        key: "betterTitle",
        default: true,
        label: "优化页面标题",
        description: "优化浏览器标签页的标题显示，更直观地反映当前页面内容。",
      },
      {
        key: "unlockCopy",
        default: true,
        label: "解除复制限制",
        description: "解除全局的复制限制，方便摘录内容进行学习笔记。",
      },
      {
        key: "showConfigButton",
        default: true,
        label: "显示插件悬浮窗",
        description: "在网页界面显示助手配置按钮，方便随时调整设置。",
      },
    ],
  },
];

type SettingState = Record<string, Record<string, boolean>>;

export class Settings {
  static defaults: SettingState = Settings.buildDefaults();
  static current: SettingState = {};

  private static buildDefaults(): SettingState {
    const defaults: SettingState = {};
    SETTINGS_SECTIONS.forEach((section) => {
      const defaultCategory = section.defaultCategory;
      section.options.forEach((option) => {
        if ("type" in option && option.type === "action") return;
        const category = option.category ?? defaultCategory;
        if (!defaults[category]) defaults[category] = {};
        defaults[category][option.key] = option.default ?? false;
      });
    });
    return defaults;
  }

  static init(): void {
    this.current = {};
    Object.entries(this.defaults).forEach(([category, entries]) => {
      this.current[category] = {};
      Object.entries(entries).forEach(([key, fallback]) => {
        this.current[category][key] = GM_getValue(`${category}_${key}`, fallback);
      });
    });
  }

  static get(category: string, key: string): boolean {
    const current = this.current[category]?.[key];
    if (typeof current === "boolean") return current;
    const fallback = this.defaults[category]?.[key];
    return typeof fallback === "boolean" ? fallback : false;
  }

  static set(category: string, key: string, value: boolean): void {
    if (!this.current[category]) this.current[category] = {};
    this.current[category][key] = value;
    GM_setValue(`${category}_${key}`, value);
  }
}
