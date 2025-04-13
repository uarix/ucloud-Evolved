// ==UserScript==
// @name         ucloud-Evolved
// @namespace    http://tampermonkey.net/
// @version      0.26
// @description  主页作业显示所属课程，使用Office 365预览课件，增加通知显示数量，去除悬浮窗，解除复制限制，课件自动下载，批量下载，资源页展示全部下载按钮，更好的页面标题
// @author       Quarix
// @updateURL    https://github.com/uarix/ucloud-Evolved/raw/refs/heads/main/ucloud-Evolved.user.js
// @downloadURL  https://github.com/uarix/ucloud-Evolved/raw/refs/heads/main/ucloud-Evolved.user.js
// @match        https://ucloud.bupt.edu.cn/*
// @match        https://ucloud.bupt.edu.cn/uclass/course.html*
// @match        https://ucloud.bupt.edu.cn/uclass/*
// @match        https://ucloud.bupt.edu.cn/office/*
// @icon         https://ucloud.bupt.edu.cn/favicon.ico
// @require      https://lf9-cdn-tos.bytecdntp.com/cdn/expire-1-M/nprogress/0.2.0/nprogress.min.js#sha256-XWzSUJ+FIQ38dqC06/48sNRwU1Qh3/afjmJ080SneA8=
// @resource     NPROGRESS_CSS https://lf3-cdn-tos.bytecdntp.com/cdn/expire-1-M/nprogress/0.2.0/nprogress.min.css#sha256-pMhcV6/TBDtqH9E9PWKgS+P32PVguLG8IipkPyqMtfY=
// @connect      github.com
// @grant        GM_getResourceText
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function () {
  // 拦截 Office 预览页面
  if (
    location.href.startsWith("https://ucloud.bupt.edu.cn/office/") &&
    GM_getValue("autoSwitchOffice", false)
  ) {
    const url = new URLSearchParams(location.search).get("furl");
    const filename =
      new URLSearchParams(location.search).get("fullfilename") || url;
    const viewURL = new URL(url);
    if (new URLSearchParams(location.search).get("oauthKey")) {
      const viewURLsearch = new URLSearchParams(viewURL.search);
      viewURLsearch.set(
        "oauthKey",
        new URLSearchParams(location.search).get("oauthKey")
      );
      viewURL.search = viewURLsearch.toString();
    }
    if (
      filename.endsWith(".xls") ||
      filename.endsWith(".xlsx") ||
      filename.endsWith(".doc") ||
      filename.endsWith(".docx") ||
      filename.endsWith(".ppt") ||
      filename.endsWith(".pptx")
    ) {
      if (window.stop) window.stop();
      location.href =
        "https://view.officeapps.live.com/op/view.aspx?src=" +
        encodeURIComponent(viewURL.toString());
      return;
    } else if (filename.endsWith(".pdf")) {
      if (window.stop) window.stop();
      // 使用浏览器内置预览器，转blob避免出现下载动作
      fetch(viewURL.toString())
        .then((response) => response.blob())
        .then((blob) => {
          const blobUrl = URL.createObjectURL(blob);
          location.href = blobUrl;
        })
        .catch((err) => console.error("PDF加载失败:", err));
      return;
    }
    return;
  }
})();
(function interceptXHR() {
  const originalOpen = XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.open = function (
    method,
    url,
    async,
    user,
    password
  ) {
    // hook XMR
    if (GM_getValue("showMoreNotification", true)) {
      if (
        typeof url === "string" &&
        url.includes("/ykt-basics/api/inform/news/list")
      ) {
        url = url.replace(/size=\d+/, "size=1000");
      } else if (
        typeof url === "string" &&
        url.includes("/ykt-site/site/list/student/history")
      ) {
        url = url.replace(/size=\d+/, "size=15");
      }
    }

    return originalOpen.call(this, method, url, async, user, password);
  };
})();
(function () {
  // 等待页面DOM加载完成
  document.addEventListener("DOMContentLoaded", initializeExtension);

  // 用户设置
  const settings = {
    autoDownload: GM_getValue("autoDownload", false),
    autoSwitchOffice: GM_getValue("autoSwitchOffice", false),
    autoClosePopup: GM_getValue("autoClosePopup", true),
    hideTimer: GM_getValue("hideTimer", true),
    unlockCopy: GM_getValue("unlockCopy", true),
    showMoreNotification: GM_getValue("showMoreNotification", true),
    useBiggerButton: GM_getValue("useBiggerButton", true),
    autoUpdate: GM_getValue("autoUpdate", false),
    showConfigButton: GM_getValue("showConfigButton", true),
    betterTitle: GM_getValue("betterTitle", true),
  };

  // 辅助变量
  let jsp;
  let sumBytes = 0,
    loadedBytes = 0,
    downloading = false;
  let setClicked = false;
  let gpage = -1;
  let glist = null;
  let onlinePreview = null;

  // 初始化扩展功能
  function initializeExtension() {
    // 注册菜单命令
    registerMenuCommands();

    const nprogressCSS = GM_getResourceText("NPROGRESS_CSS");
    GM_addStyle(nprogressCSS);

    if (settings.showConfigButton) {
      loadui();
    }
    addFunctionalCSS();
    main();

    if (settings.autoUpdate) {
      checkForUpdates();
    }

    // 监听URL哈希变化
    let hash = location.hash;
    setInterval(() => {
      if (location.hash != hash) {
        hash = location.hash;
        main();
      }
    }, 50);
  }

  // 注册菜单命令
  function registerMenuCommands() {
    GM_registerMenuCommand(
      (settings.showConfigButton ? "✅" : "❌") +
        "显示配置按钮：" +
        (settings.showConfigButton ? "已启用" : "已禁用"),
      () => {
        settings.showConfigButton = !settings.showConfigButton;
        GM_setValue("showConfigButton", settings.showConfigButton);
        location.reload();
      }
    );
    GM_registerMenuCommand(
      (settings.autoDownload ? "✅" : "❌") +
        "预览课件时自动下载：" +
        (settings.autoDownload ? "已启用" : "已禁用"),
      () => {
        settings.autoDownload = !settings.autoDownload;
        GM_setValue("autoDownload", settings.autoDownload);
        location.reload();
      }
    );

    GM_registerMenuCommand(
      (settings.autoSwitchOffice ? "✅" : "❌") +
        "使用 Office365 预览课件：" +
        (settings.autoSwitchOffice ? "已启用" : "已禁用"),
      () => {
        settings.autoSwitchOffice = !settings.autoSwitchOffice;
        GM_setValue("autoSwitchOffice", settings.autoSwitchOffice);
        location.reload();
      }
    );
  }
  /**
   * 通用标签页打开函数
   * @param {string} url - 要打开的URL
   * @param {Object} options - 选项参数
   * @param {boolean} [options.active=true] - 新标签页是否获得焦点
   * @param {boolean} [options.insert=true] - 是否在当前标签页旁边插入新标签页
   * @param {boolean} [options.setParent=true] - 新标签页是否将当前标签页设为父页面
   * @param {string} [options.windowName="_blank"] - window.open的窗口名称
   * @param {string} [options.windowFeatures=""] - window.open的窗口特性
   * @returns {Object|Window|null} 打开的标签页对象
   */
  function openTab(url, options = {}) {
    const defaultOptions = {
      active: true,
      insert: true,
      setParent: true,
      windowName: "_blank",
      windowFeatures: "",
    };
    const finalOptions = { ...defaultOptions, ...options };
    if (typeof GM_openInTab === "function") {
      try {
        return GM_openInTab(url, {
          active: finalOptions.active,
          insert: finalOptions.insert,
          setParent: finalOptions.setParent,
        });
      } catch (error) {
        return window.open(
          url,
          finalOptions.windowName,
          finalOptions.windowFeatures
        );
      }
    }
  }
  function showUpdateNotification(newVersion) {
    const notification = document.createElement("div");
    notification.style.cssText = `  
        position: fixed;  
        bottom: 80px;  
        right: 20px;  
        background: #4a6cf7;  
        color: white;  
        padding: 15px 20px;  
        border-radius: 8px;  
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);  
        z-index: 10000;  
        font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;  
        max-width: 300px;  
    `;

    notification.innerHTML = `  
        <div style="font-weight: bold; margin-bottom: 5px;">发现新版本 v${newVersion}</div>  
        <div style="font-size: 14px; margin-bottom: 10px;">当前版本 v${GM_info.script.version}</div>  
        <button id="updateNow" style="background: white; color: #4a6cf7; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; margin-right: 10px;">立即更新</button>  
        <button id="updateLater" style="background: transparent; color: white; border: 1px solid white; padding: 5px 10px; border-radius: 4px; cursor: pointer;">稍后提醒</button>  
    `;

    document.body.appendChild(notification);

    document.getElementById("updateNow").addEventListener("click", function () {
      openTab(GM_info.script.downloadURL, { active: true });
      document.body.removeChild(notification);
    });

    document
      .getElementById("updateLater")
      .addEventListener("click", function () {
        document.body.removeChild(notification);
      });
  }

  function checkForUpdates() {
    const lastCheckTime = GM_getValue("lastUpdateCheck", 0);
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000; // 一天的毫秒数

    if (now - lastCheckTime > ONE_DAY) {
      GM_setValue("lastUpdateCheck", now);
      GM_xmlhttpRequest({
        method: "GET",
        url: GM_info.script.updateURL,
        onload: function (response) {
          const versionMatch = response.responseText.match(
            /@version\s+(\d+\.\d+)/
          );
          if (versionMatch && versionMatch[1]) {
            const latestVersion = versionMatch[1];
            const currentVersion = GM_info.script.version;
            if (latestVersion > currentVersion) {
              showUpdateNotification(latestVersion);
            }
          }
        },
      });
    }
  }

  function loadui() {
    GM_addStyle(`  
        #yzHelper-settings {  
            position: fixed;  
            bottom: 20px;  
            right: 20px;  
            background: #ffffff;  
            box-shadow: 0 5px 25px rgba(0, 0, 0, 0.15);  
            border-radius: 12px;  
            padding: 20px;  
            z-index: 9999;  
            display: none;  
            width: 300px;  
            font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;  
            transition: all 0.3s ease;  
            opacity: 0;  
            transform: translateY(10px);  
            color: #333;  
        }  
        #yzHelper-settings.visible {  
            opacity: 1;  
            transform: translateY(0);  
        }  
        #yzHelper-settings h3 {  
            margin-top: 0;  
            margin-bottom: 15px;  
            font-size: 18px;  
            font-weight: 600;  
            color: #2c3e50;  
            padding-bottom: 10px;  
            border-bottom: 1px solid #eee;  
        }  
        #yzHelper-settings .setting-item {  
            margin-bottom: 16px;  
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
            background-color: #ccc;  
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
            background-color: #ffbe00;  
        }  
        #yzHelper-settings input:focus + .slider {  
            box-shadow: 0 0 1px #ffbe00;  
        }  
        #yzHelper-settings input:checked + .slider:before {  
            transform: translateX(20px);  
        }  
        #yzHelper-settings .setting-label {  
            font-size: 14px;  
        }  
        #yzHelper-settings .buttons {  
            display: flex;  
            justify-content: flex-end;  
            gap: 10px;  
        }  
        #yzHelper-settings button {  
            background: #ffbe00;  
            border: none;  
            padding: 8px 16px;  
            border-radius: 6px;  
            cursor: pointer;  
            font-weight: 500;  
            color: #fff;  
            transition: all 0.2s ease;  
            outline: none;  
            font-size: 14px;  
        }  
        #yzHelper-settings button:hover {  
            background: #e9ad00;
        }  
        #yzHelper-settings button.cancel {  
            background: #f1f1f1;  
            color: #666;  
        }  
        #yzHelper-settings button.cancel:hover {  
            background: #e5e5e5;  
        }  
        #yzHelper-settings-toggle {  
            position: fixed;  
            bottom: 20px;  
            right: 20px;  
            background: #ffbe00;  
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
            box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);  
            transition: all 0.3s ease;  
        }  
        #yzHelper-settings-toggle:hover {  
            transform: rotate(30deg);  
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);  
        }  
        #yzHelper-version {  
            position: absolute;  
            bottom: 15px;  
            left: 20px;  
            font-size: 12px;  
            color: #999;  
        }  
    `);

    // 设置面板
    const settingsToggle = document.createElement("div");
    settingsToggle.id = "yzHelper-settings-toggle";
    settingsToggle.innerHTML = "⚙️";
    settingsToggle.title = "云邮助手设置";
    document.body.appendChild(settingsToggle);

    const settingsPanel = document.createElement("div");
    settingsPanel.id = "yzHelper-settings";
    settingsPanel.innerHTML = `  
        <h3>云邮教学空间助手设置</h3>  
        <div class="setting-item">  
            <label class="switch">  
                <input type="checkbox" id="autoDownload" ${
                  settings.autoDownload ? "checked" : ""
                }>  
                <span class="slider"></span>  
            </label>  
            <span class="setting-label">预览课件时自动下载</span>  
        </div>  
        <div class="setting-item">  
            <label class="switch">  
                <input type="checkbox" id="autoSwitchOffice" ${
                  settings.autoSwitchOffice ? "checked" : ""
                }>  
                <span class="slider"></span>  
            </label>  
            <span class="setting-label">使用 Office365 预览课件</span>  
        </div>  
        <div class="setting-item">  
            <label class="switch">  
                <input type="checkbox" id="autoClosePopup" ${
                  settings.autoClosePopup ? "checked" : ""
                }>  
                <span class="slider"></span>  
            </label>  
            <span class="setting-label">自动关闭预览弹窗</span>  
        </div>
        <div class="setting-item">  
            <label class="switch">  
                <input type="checkbox" id="hideTimer" ${
                  settings.hideTimer ? "checked" : ""
                }>  
                <span class="slider"></span>  
            </label>  
            <span class="setting-label">隐藏预览界面倒计时</span>  
        </div>
        <div class="setting-item">  
            <label class="switch">  
                <input type="checkbox" id="unlockCopy" ${
                  settings.unlockCopy ? "checked" : ""
                }>  
                <span class="slider"></span>  
            </label>  
            <span class="setting-label">解除复制限制</span>  
        </div>
        <div class="setting-item">  
            <label class="switch">  
                <input type="checkbox" id="showMoreNotification" ${
                  settings.showMoreNotification ? "checked" : ""
                }>  
                <span class="slider"></span>  
            </label>  
            <span class="setting-label">显示更多的通知</span>  
        </div>
        <div class="setting-item">  
            <label class="switch">  
                <input type="checkbox" id="useBiggerButton" ${
                  settings.useBiggerButton ? "checked" : ""
                }>  
                <span class="slider"></span>  
            </label>  
            <span class="setting-label">加大翻页按钮尺寸</span>  
        </div>
        <div class="setting-item">  
            <label class="switch">  
                <input type="checkbox" id="betterTitle" ${
                  settings.betterTitle ? "checked" : ""
                }>  
                <span class="slider"></span>  
            </label>  
            <span class="setting-label">优化页面标题</span>  
        </div>
        <div class="setting-item">  
            <label class="switch">  
                <input type="checkbox" id="autoUpdate" ${
                  settings.autoUpdate ? "checked" : ""
                }>  
                <span class="slider"></span>  
            </label>  
            <span class="setting-label">内置更新检查</span>  
        </div>
        <div class="buttons">  
            <button id="cancelSettings" class="cancel">取消</button>  
            <button id="saveSettings">保存设置</button>  
        </div>  
        <div id="yzHelper-version">当前版本：${GM_info.script.version}</div>  
    `;
    document.body.appendChild(settingsPanel);

    // 面板交互
    settingsToggle.addEventListener("click", () => {
      const isVisible = settingsPanel.classList.contains("visible");
      if (isVisible) {
        settingsPanel.classList.remove("visible");
        setTimeout(() => {
          settingsPanel.style.display = "none";
        }, 300);
      } else {
        settingsPanel.style.display = "block";
        void settingsPanel.offsetWidth;
        settingsPanel.classList.add("visible");
      }
    });

    document.getElementById("cancelSettings").addEventListener("click", () => {
      settingsPanel.classList.remove("visible");
      setTimeout(() => {
        settingsPanel.style.display = "none";
      }, 300);
    });

    document.getElementById("saveSettings").addEventListener("click", () => {
      settings.autoDownload = document.getElementById("autoDownload").checked;
      settings.autoSwitchOffice =
        document.getElementById("autoSwitchOffice").checked;
      settings.autoClosePopup =
        document.getElementById("autoClosePopup").checked;
      settings.hideTimer = document.getElementById("hideTimer").checked;
      settings.unlockCopy = document.getElementById("unlockCopy").checked;
      settings.showMoreNotification = document.getElementById(
        "showMoreNotification"
      ).checked;
      settings.useBiggerButton =
        document.getElementById("useBiggerButton").checked;
      settings.autoUpdate = document.getElementById("autoUpdate").checked;
      settings.betterTitle = document.getElementById("betterTitle").checked;

      GM_setValue("autoDownload", settings.autoDownload);
      GM_setValue("autoSwitchOffice", settings.autoSwitchOffice);
      GM_setValue("autoClosePopup", settings.autoClosePopup);
      GM_setValue("hideTimer", settings.hideTimer);
      GM_setValue("unlockCopy", settings.unlockCopy);
      GM_setValue("showMoreNotification", settings.showMoreNotification);
      GM_setValue("useBiggerButton", settings.useBiggerButton);
      GM_setValue("autoUpdate", settings.autoUpdate);
      GM_setValue("betterTitle", settings.betterTitle);

      settingsPanel.classList.remove("visible");
      setTimeout(() => {
        settingsPanel.style.display = "none";
        showNotification("设置已保存", "刷新页面后生效");
      }, 300);
    });

    // 通知函数
    function showNotification(title, message) {
      const notification = document.createElement("div");
      notification.style.cssText = `  
            position: fixed;  
            bottom: 80px;    
            right: 20px;  
            background: #4CAF50;  
            color: white;  
            padding: 15px 20px;  
            border-radius: 8px;  
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);  
            z-index: 10000;  
            font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;  
            max-width: 300px;  
            opacity: 0;  
            transform: translateY(-10px);  
            transition: all 0.3s ease;  
        `;

      notification.innerHTML = `  
            <div style="font-weight: bold; margin-bottom: 5px;">${title}</div>  
            <div style="font-size: 14px;">${message}</div>  
        `;

      document.body.appendChild(notification);

      void notification.offsetWidth;

      notification.style.opacity = "1";
      notification.style.transform = "translateY(0)";

      setTimeout(() => {
        notification.style.opacity = "0";
        notification.style.transform = "translateY(-10px)";
        setTimeout(() => {
          document.body.removeChild(notification);
        }, 300);
      }, 3000);
    }
  }
  // 获取Token
  function getToken() {
    const cookieMap = new Map();
    document.cookie.split("; ").forEach((cookie) => {
      const [key, value] = cookie.split("=");
      cookieMap.set(key, value);
    });
    const token = cookieMap.get("iClass-token");
    const userid = cookieMap.get("iClass-uuid");
    return [userid, token];
  }

  // 文件下载相关函数
  async function downloadFile(url, filename) {
    console.log("Call download");
    downloading = true;
    await jsp;
    NProgress.configure({ trickle: false, speed: 0 });
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentLength = response.headers.get("content-length");
      if (!contentLength) {
        throw new Error("Content-Length response header unavailable");
      }

      const total = parseInt(contentLength, 10);
      sumBytes += total;
      const reader = response.body.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!downloading) {
          NProgress.done();
          return;
        }
        chunks.push(value);
        loadedBytes += value.length;
        NProgress.set(loadedBytes / sumBytes);
      }
      NProgress.done();
      sumBytes -= total;
      loadedBytes -= total;
      const blob = new Blob(chunks);
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error("Download failed:", error);
    }
  }

  // 任务搜索函数
  async function searchTask(siteId, keyword, token) {
    const res = await fetch(
      "https://apiucloud.bupt.edu.cn/ykt-site/work/student/list",
      {
        headers: {
          authorization: "Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=",
          "blade-auth": token,
          "content-type": "application/json;charset=UTF-8",
        },
        body: JSON.stringify({
          siteId,
          keyword,
          current: 1,
          size: 5,
        }),
        method: "POST",
      }
    );
    const json = await res.json();
    return json;
  }

  // 课程搜索函数
  async function searchCourse(userId, id, keyword, token) {
    const res = await fetch(
      "https://apiucloud.bupt.edu.cn/ykt-site/site/list/student/current?size=999999&current=1&userId=" +
        userId +
        "&siteRoleCode=2",
      {
        headers: {
          authorization: "Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=",
          "blade-auth": token,
        },
        body: null,
        method: "GET",
      }
    );
    const json = await res.json();
    const list = json.data.records.map((x) => ({
      id: x.id,
      name: x.siteName,
      teachers: x.teachers.map((y) => y.name).join(", "),
    }));

    async function searchWithLimit(list, id, keyword, token, limit = 5) {
      for (let i = 0; i < list.length; i += limit) {
        const batch = list.slice(i, i + limit);
        const jobs = batch.map((x) => searchTask(x.id, keyword, token));
        const ress = await Promise.all(jobs);
        for (let j = 0; j < ress.length; j++) {
          const res = ress[j];
          if (res.data && res.data.records && res.data.records.length > 0) {
            for (const item of res.data.records) {
              if (item.id == id) {
                return batch[j];
              }
            }
          }
        }
      }
      return null;
    }
    return await searchWithLimit(list, id, keyword, token);
  }

  // 获取任务列表
  async function getTasks(siteId, token) {
    const res = await fetch(
      "https://apiucloud.bupt.edu.cn/ykt-site/work/student/list",
      {
        headers: {
          authorization: "Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=",
          "blade-auth": token,
          "content-type": "application/json;charset=UTF-8",
        },
        body: JSON.stringify({
          siteId,
          current: 1,
          size: 9999,
        }),
        method: "POST",
      }
    );
    const json = await res.json();
    return json;
  }

  // 搜索课程
  async function searchCourses(nids) {
    const result = {};
    let ids = [];
    for (let id of nids) {
      const r = get(id);
      if (r) result[id] = r;
      else ids.push(id);
    }

    if (ids.length == 0) return result;
    const [userid, token] = getToken();
    const res = await fetch(
      "https://apiucloud.bupt.edu.cn/ykt-site/site/list/student/current?size=999999&current=1&userId=" +
        userid +
        "&siteRoleCode=2",
      {
        headers: {
          authorization: "Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=",
          "blade-auth": token,
        },
        body: null,
        method: "GET",
      }
    );
    const json = await res.json();
    const list = json.data.records.map((x) => ({
      id: x.id,
      name: x.siteName,
      teachers: x.teachers.map((y) => y.name).join(", "),
    }));
    const hashMap = new Map();
    let count = ids.length;
    for (let i = 0; i < ids.length; i++) {
      hashMap.set(ids[i], i);
    }

    async function searchWithLimit(list, limit = 5) {
      for (let i = 0; i < list.length; i += limit) {
        const batch = list.slice(i, i + limit);
        const jobs = batch.map((x) => getTasks(x.id, token));
        const ress = await Promise.all(jobs);
        for (let j = 0; j < ress.length; j++) {
          const res = ress[j];
          if (res.data && res.data.records && res.data.records.length > 0) {
            for (const item of res.data.records) {
              if (hashMap.has(item.id)) {
                result[item.id] = batch[j];
                set(item.id, batch[j]);
                if (--count == 0) {
                  return result;
                }
              }
            }
          }
        }
      }
      return result;
    }
    return await searchWithLimit(list);
  }

  // 获取未完成列表
  async function getUndoneList() {
    const [userid, token] = getToken();
    const res = await fetch(
      "https://apiucloud.bupt.edu.cn/ykt-site/site/student/undone?userId=" +
        userid,
      {
        headers: {
          authorization: "Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=",
          "blade-auth": token,
        },
        method: "GET",
      }
    );
    const json = await res.json();
    return json;
  }

  // 获取详情
  async function getDetail(id) {
    const [userid, token] = getToken();
    const res = await fetch(
      "https://apiucloud.bupt.edu.cn/ykt-site/work/detail?assignmentId=" + id,
      {
        headers: {
          authorization: "Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=",
          "blade-auth": token,
        },
        body: null,
        method: "GET",
      }
    );
    const json = await res.json();
    return json;
  }

  // 获取站点资源
  async function getSiteResource(id) {
    const [userid, token] = getToken();
    const res = await fetch(
      "https://apiucloud.bupt.edu.cn/ykt-site/site-resource/tree/student?siteId=" +
        id +
        "&userId=" +
        userid,
      {
        headers: {
          authorization: "Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=",
          "blade-auth": token,
        },
        body: null,
        method: "POST",
      }
    );
    const json = await res.json();
    const result = [];
    function foreach(data) {
      if (!data || !Array.isArray(data)) return;
      data.forEach((x) => {
        if (x.attachmentVOs && Array.isArray(x.attachmentVOs)) {
          x.attachmentVOs.forEach((y) => {
            if (y.type !== 2 && y.resource) result.push(y.resource);
          });
        }
        if (x.children) foreach(x.children);
      });
    }
    foreach(json.data);
    return result;
  }

  // 更新作业显示
  async function updateAssignmentDisplay(list, page) {
    if (!list || list.length === 0) return;

    // 获取当前页的作业
    const tlist = list.slice((page - 1) * 6, page * 6);
    if (tlist.length === 0) return;

    // 获取课程信息
    const ids = tlist.map((x) => x.activityId);
    const infos = await searchCourses(ids);

    // 确保所有信息都已获取到
    if (Object.keys(infos).length === 0) return;

    // 准备显示文本
    const texts = tlist.map((x) => {
      const info = infos[x.activityId];
      return info ? `${info.name}(${info.teachers})` : "加载中...";
    });

    // 等待作业元素显示
    const timeout = 5000; // 5秒超时
    const startTime = Date.now();

    let nodes;
    while (Date.now() - startTime < timeout) {
      nodes = $x(
        '//*[@id="layout-container"]/div[2]/div[2]/div/div[2]/div[1]/div[3]/div[2]/div/div'
      );
      if (
        nodes.length > 0 &&
        nodes.some((node) => node.children[0] && node.children[0].innerText)
      ) {
        break;
      }
      await sleep(100);
    }

    // 更新课程信息显示
    for (let i = 0; i < Math.min(nodes.length, texts.length); i++) {
      if (nodes[i] && nodes[i].children[1]) {
        if (nodes[i].children[1].children.length === 0) {
          const p = document.createElement("div");
          const t = document.createTextNode(texts[i]);
          p.appendChild(t);
          p.style.color = "#0066cc";
          nodes[i].children[1].insertAdjacentElement("afterbegin", p);
        } else {
          nodes[i].children[1].children[0].innerHTML = texts[i];
          nodes[i].children[1].children[0].style.color = "#0066cc";
        }
      }
    }
  }

  // XPath选择器
  function $x(xpath, context = document) {
    const iterator = document.evaluate(
      xpath,
      context,
      null,
      XPathResult.ANY_TYPE,
      null
    );
    const results = [];
    let item;
    while ((item = iterator.iterateNext())) {
      results.push(item);
    }
    return results;
  }

  // 本地存储
  function set(k, v) {
    const h = JSON.parse(localStorage.getItem("zzxw") || "{}");
    h[k] = v;
    localStorage.setItem("zzxw", JSON.stringify(h));
  }

  function get(k) {
    const h = JSON.parse(localStorage.getItem("zzxw") || "{}");
    return h[k];
  }

  // 插入课程信息
  function insert(x) {
    if (!x) return;
    if (
      $x(
        "/html/body/div[1]/div/div[2]/div[2]/div/div/div[2]/div/div[2]/div[1]/div/div/div[1]/div/p"
      ).length > 2
    )
      return;
    const d = $x(
      "/html/body/div[1]/div/div[2]/div[2]/div/div/div[2]/div/div[2]/div[1]/div/div/div[1]/div/p[1]"
    );
    if (!d.length) {
      setTimeout(() => insert(x), 50);
      return;
    }
    // 检查是否已经插入过
    const existingText = Array.from(d[0].parentNode.childNodes).some(
      (node) => node.textContent && node.textContent.includes(x.name)
    );

    if (!existingText) {
      const p = document.createElement("p");
      const t = document.createTextNode(x.name + "(" + x.teachers + ")");
      p.appendChild(t);
      d[0].after(p);
    }
  }

  // 辅助函数
  function sleep(n) {
    return new Promise((res) => setTimeout(res, n));
  }

  async function wait(func) {
    let r = func();
    if (r instanceof Promise) r = await r;
    if (r) return r;
    await sleep(50);
    return await wait(func);
  }

  async function waitChange(func, value) {
    const r = value;
    while (1) {
      let t = func();
      if (t instanceof Promise) t = await t;
      if (t != r) return t;
      await sleep(50);
    }
  }

  // 预览URL相关
  async function getPreviewURL(storageId) {
    const res = await fetch(
      "https://apiucloud.bupt.edu.cn/blade-source/resource/preview-url?resourceId=" +
        storageId
    );
    const json = await res.json();
    onlinePreview = json.data.onlinePreview;
    return json.data.previewUrl;
  }

  // 启用文本选择 修改按钮尺寸
  function addFunctionalCSS() {
    GM_addStyle(`
    .teacher-home-page .home-left-container .in-progress-section .in-progress-body .in-progress-item .activity-box .activity-title {  
      height: auto !important;
    }  
    #layout-container > div.main-content > div.router-container > div > div.my-course-page {
      max-height: none !important; 
    }
    `);
    if (settings.enableTextSelection) {
      GM_addStyle(`  
        .el-checkbox, .el-checkbox-button__inner, .el-empty__image img, .el-radio,  
        div, span, p, a, h1, h2, h3, h4, h5, h6, li, td, th {  
          -webkit-user-select: auto !important;  
          -moz-user-select: auto !important;  
          -ms-user-select: auto !important;  
          user-select: auto !important;  
        }  
        `);
      document.addEventListener(
        "copy",
        function (e) {
          e.stopImmediatePropagation();
        },
        true
      );

      document.addEventListener(
        "selectstart",
        function (e) {
          e.stopImmediatePropagation();
        },
        true
      );
    }
    if (settings.useBiggerButton) {
      GM_addStyle(`
      .teacher-home-page .home-left-container .my-lesson-section .my-lesson-header .header-control .banner-control-btn, .teacher-home-page .home-left-container .in-progress-section .in-progress-header .header-control .banner-control-btn {
        width: 60px !important;
        height: 30px !important;
        background: #f2f2f2 !important;
        line-height: auto !important;
      }
      .teacher-home-page .home-left-container .my-lesson-section .my-lesson-header .header-control .banner-control-btn span,.teacher-home-page .home-left-container .in-progress-section .in-progress-header .header-control .banner-control-btn span {
        font-size: 22px !important;
      }
    `);
    }
  }

  // 主函数
  async function main() {
    "use strict";
    // ticket跳转
    if (new URLSearchParams(location.search).get("ticket")?.length) {
      setTimeout(() => {
        location.href = "https://ucloud.bupt.edu.cn/uclass/#/student/homePage";
      }, 500);
      return;
    }

    // 课件预览页面
    if (
      location.href.startsWith(
        "https://ucloud.bupt.edu.cn/uclass/course.html#/resourceLearn"
      )
    ) {
      if (settings.betterTitle) {
        function extractFilename(url) {
          try {
            const match = url.match(/previewUrl=([^&]+)/);
            if (!match) return null;

            const previewUrl = decodeURIComponent(match[1]);

            // 从content-disposition中提取文件名
            const filenameMatch = previewUrl.match(/filename%3D([^&]+)/);
            if (!filenameMatch) return null;

            return decodeURIComponent(decodeURIComponent(filenameMatch[1]));
          } catch (e) {
            return null;
          }
        }
        const url = location.href;
        const filename = extractFilename(url);
        const site = JSON.parse(localStorage.getItem("site"));
        const pageTitle =
          "[预览] " +
          (filename || "课件") +
          " - " +
          site.siteName +
          " - 教学云空间";
        document.title = pageTitle;
      }
      if (settings.autoClosePopup) {
        const dialogBox = document.querySelector("div.el-message-box__wrapper");

        if (
          dialogBox &&
          window.getComputedStyle(dialogBox).display !== "none"
        ) {
          const messageElement = dialogBox.querySelector(
            ".el-message-box__message p"
          );
          if (
            messageElement &&
            (messageElement.textContent.includes("您正在学习其他课件") ||
              messageElement.textContent.includes("您已经在学习此课件了"))
          ) {
            const confirmButton = dialogBox.querySelector(
              ".el-button--primary"
            );
            if (confirmButton) {
              confirmButton.click();
            } else {
              console.log("未找到确认按钮");
            }
          }
        }
      }
      if (settings.hideTimer) {
        GM_addStyle(`
        .preview-container .time {  
            display: none !important;  
        }  
      `);
      }
    }

    // 作业详情页面
    if (
      location.href.startsWith(
        "https://ucloud.bupt.edu.cn/uclass/course.html#/student/assignmentDetails_fullpage"
      )
    ) {
      const q = new URLSearchParams(location.href);
      const id = q.get("assignmentId");
      const r = get(id);
      const [userid, token] = getToken();
      const title = q.get("assignmentTitle");
      if (settings.betterTitle) {
        const pageTitle = "[作业] " + title + " - " + r.name + " - 教学云空间";
        document.title = pageTitle;
      }
      // 显示相关课程信息
      if (r) {
        insert(r);
      } else {
        if (!id || !title) return;
        try {
          const courseInfo = await searchCourse(userid, id, title, token);
          if (courseInfo) {
            insert(courseInfo);
            set(id, courseInfo);
          }
        } catch (e) {
          console.error("获取课程信息失败", e);
        }
      }

      // 处理资源预览和下载
      try {
        const detail = (await getDetail(id)).data;
        if (!detail || !detail.assignmentResource) return;

        const filenames = detail.assignmentResource.map((x) => x.resourceName);
        const urls = await Promise.all(
          detail.assignmentResource.map((x) => {
            return getPreviewURL(x.resourceId);
          })
        );

        await wait(
          () =>
            $x('//*[@id="assignment-info"]/div[2]/div[2]/div[2]/div').length > 0
        );

        $x('//*[@id="assignment-info"]/div[2]/div[2]/div[2]/div').forEach(
          (x, index) => {
            if (
              x.querySelector(".by-icon-eye-grey") ||
              x.querySelector(".by-icon-yundown-grey")
            ) {
              x.querySelector(".by-icon-eye-grey").remove();
              x.querySelector(".by-icon-yundown-grey").remove();
            }

            // 添加预览按钮
            const i = document.createElement("i");
            i.title = "预览";
            i.classList.add("by-icon-eye-grey");
            i.addEventListener("click", () => {
              const url = urls[index];
              const filename = filenames[index];
              if (settings.autoDownload) {
                downloadFile(url, filename);
                console.log("Autodownload");
              }
              if (
                filename.endsWith(".xls") ||
                filename.endsWith(".xlsx") ||
                url.endsWith(".doc") ||
                url.endsWith(".docx") ||
                url.endsWith(".ppt") ||
                url.endsWith(".pptx")
              )
                openTab(
                  "https://view.officeapps.live.com/op/view.aspx?src=" +
                    encodeURIComponent(url),
                  { active: true, insert: true }
                );
              else if (onlinePreview !== null)
                openTab(onlinePreview + encodeURIComponent(url), {
                  active: true,
                  insert: true,
                });
            });

            // 添加下载按钮
            const i2 = document.createElement("i");
            i2.title = "下载";
            i2.classList.add("by-icon-yundown-grey");
            i2.addEventListener("click", () => {
              downloadFile(urls[index], filenames[index]);
            });

            // 插入按钮
            if (x.children.length >= 3) {
              x.children[3]?.remove();
              x.children[2]?.insertAdjacentElement("afterend", i);
              x.children[2]?.remove();
              x.children[1]?.insertAdjacentElement("afterend", i2);
            } else {
              x.appendChild(i2);
              x.appendChild(i);
            }
          }
        );
      } catch (e) {
        console.error("处理资源失败", e);
      }
    }

    // 主页面
    else if (
      location.href.startsWith(
        "https://ucloud.bupt.edu.cn/uclass/#/student/homePage"
      ) ||
      location.href.startsWith(
        "https://ucloud.bupt.edu.cn/uclass/index.html#/student/homePage"
      )
    ) {
      try {
        if (settings.betterTitle) {
          const pageTitle = "个人主页 - 教学云空间";
          document.title = pageTitle;
        }
        // 未完成任务列表
        const list = glist || (await getUndoneList()).data.undoneList;
        if (!list || !Array.isArray(list)) return;
        glist = list;

        const observer = new MutationObserver(async (mutations) => {
          // 当前页码
          const pageElement = document.querySelector(
            "#layout-container > div.main-content > div.router-container > div > div.teacher-home-page > div.home-left-container.home-inline-block > div.in-progress-section.home-card > div.in-progress-header > div > div:nth-child(2) > div > div.banner-indicator.home-inline-block"
          );

          if (!pageElement) return;

          // 解析页码
          const currentPage = parseInt(
            pageElement.innerHTML.trim().split("/")[0]
          );
          if (isNaN(currentPage)) return;

          // 页码变化则更新显示
          if (currentPage !== gpage) {
            gpage = currentPage;
            await updateAssignmentDisplay(list, currentPage);
          }
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: false,
          characterData: true,
        });

        // 初始化页码
        let page = 1;
        const pageElement = document.querySelector(
          "#layout-container > div.main-content > div.router-container > div > div.teacher-home-page > div.home-left-container.home-inline-block > div.in-progress-section.home-card > div.in-progress-header > div > div:nth-child(2) > div > div.banner-indicator.home-inline-block"
        );

        if (pageElement) {
          page = parseInt(pageElement.innerHTML.trim().split("/")[0]);
          gpage = page;
        }

        // 更新作业显示
        await updateAssignmentDisplay(list, page);

        // 本学期课程点击事件
        document.querySelectorAll('div[class="header-label"]').forEach((el) => {
          if (el.textContent.includes("本学期课程")) {
            el.style.cursor = "pointer";
            el.addEventListener("click", (e) => {
              e.preventDefault();
              window.location.href =
                "https://ucloud.bupt.edu.cn/uclass/index.html#/student/myCourse";
            });
          }
        });
      } catch (e) {
        console.error("主页处理失败", e);
      }
    }

    // 课程主页
    else if (
      location.href.startsWith(
        "https://ucloud.bupt.edu.cn/uclass/course.html#/student/courseHomePage"
      )
    ) {
      try {
        const site = JSON.parse(localStorage.getItem("site"));
        if (!site || !site.id) return;
        if (settings.betterTitle) {
          const pageTitle = "[课程] " + site.siteName + " - 教学云空间";
          document.title = pageTitle;
        }

        const id = site.id;
        const resources = await getSiteResource(id);

        // 添加下载按钮到每个资源
        const resourceItems = $x(
          '//div[@class="resource-item"]/div[@class="right"]'
        );
        const previewItems = $x(
          '//div[@class="resource-item"]/div[@class="left"]'
        );

        if (resourceItems.length > 0) {
          resourceItems.forEach((x, index) => {
            if (index >= resources.length) return;

            if (settings.autoDownload) {
              previewItems[index].addEventListener(
                "click",
                async (e) => {
                  const url = await getPreviewURL(resources[index].id);
                  downloadFile(url, resources[index].name);
                  console.log("Autodownload");
                },
                false
              );
            }

            const i = document.createElement("i");
            i.title = "下载";
            i.classList.add("by-icon-download");
            i.classList.add("btn-icon");
            i.classList.add("visible");
            i.style.cssText = `  
          display: inline-block !important;  
          visibility: visible !important;  
          cursor: pointer !important;  
      `;

            // 获取data-v属性
            const dataAttr = Array.from(x.attributes).find((attr) =>
              attr.localName.startsWith("data-v")
            );
            if (dataAttr) {
              i.setAttribute(dataAttr.localName, "");
            }

            i.addEventListener(
              "click",
              async (e) => {
                e.stopPropagation();
                const url = await getPreviewURL(resources[index].id);
                downloadFile(url, resources[index].name);
              },
              false
            );

            if (x.children.length) x.children[0].remove();
            x.insertAdjacentElement("afterbegin", i);
          });

          // "下载全部"按钮
          if (
            !document.getElementById("downloadAllButton") &&
            resources.length > 0
          ) {
            const downloadAllButton = `<div style="display: flex;flex-direction: row;justify-content: end;margin-right: 24px;margin-top: 20px;">  
                      <button type="button" class="el-button submit-btn el-button--primary" id="downloadAllButton">  
                      下载全部  
                      </button>  
                      </div>`;

            const resourceList = $x(
              "/html/body/div/div/div[2]/div[2]/div/div/div"
            );
            if (resourceList.length > 0) {
              const containerElement = document.createElement("div");
              containerElement.innerHTML = downloadAllButton;
              resourceList[0].before(containerElement);

              document.getElementById("downloadAllButton").onclick =
                async () => {
                  downloading = !downloading;
                  if (downloading) {
                    document.getElementById("downloadAllButton").innerHTML =
                      "取消下载";
                    for (let file of resources) {
                      if (!downloading) return;
                      await downloadFile(
                        await getPreviewURL(file.id),
                        file.name
                      );
                    }
                    // 下载完成后重置按钮
                    if (downloading) {
                      downloading = false;
                      document.getElementById("downloadAllButton").innerHTML =
                        "下载全部";
                    }
                  } else {
                    document.getElementById("downloadAllButton").innerHTML =
                      "下载全部";
                  }
                };
            }
          }
        }
      } catch (e) {
        console.error("课程主页处理失败", e);
      }
    } else if (location.href == "https://ucloud.bupt.edu.cn/#/") {
      if (settings.betterTitle) {
        const pageTitle = "首页 - 教学云空间";
        document.title = pageTitle;
      }
    }
  }
})();
