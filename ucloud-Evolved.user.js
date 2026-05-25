// ==UserScript==
// @name         ucloud-Evolved
// @namespace    http://tampermonkey.net/
// @version      0.38
// @description  主页作业显示所属课程，使用Office 365预览课件，增加通知显示数量，通知按时间排序，去除悬浮窗，解除复制限制，课件自动下载，批量下载，资源页展示全部下载按钮，更好的页面标题
// @author       Quarix
// @match        https://ucloud.bupt.edu.cn/*
// @match        https://ucloud.bupt.edu.cn/uclass/course.html*
// @match        https://ucloud.bupt.edu.cn/uclass/*
// @match        https://ucloud.bupt.edu.cn/office/*
// @icon         https://ucloud.bupt.edu.cn/favicon.ico
// @require      https://mirrors.sustech.edu.cn/cdnjs/ajax/libs/nprogress/0.2.0/nprogress.min.js#sha512-bUg5gaqBVaXIJNuebamJ6uex//mjxPk8kljQTdM1SwkNrQD7pjS+PerntUSD+QRWPNJ0tq54/x4zRV8bLrLhZg==
// @resource     NPROGRESS_CSS https://mirrors.sustech.edu.cn/cdnjs/ajax/libs/nprogress/0.2.0/nprogress.min.css#sha512-42kB9yDlYiCEfx2xVwq0q7hT4uf26FUgSIZBK8uiaEnTdShXjwr8Ip1V4xGJMg3mHkUt9nNuTDxunHF0/EgxLQ==
// @connect      github.com
// @grant        GM_getResourceText
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_openInTab
// @grant        unsafeWindow
// @run-at       document-start
// @license      MIT
// @updateURL    https://github.com/uarix/ucloud-Evolved/raw/refs/heads/main/ucloud-Evolved.user.js
// @downloadURL  https://github.com/uarix/ucloud-Evolved/raw/refs/heads/main/ucloud-Evolved.user.js
// ==/UserScript==

(function () {
  "use strict";
  /**
   * @param {object} modules - webpack 模块对象
   */
  function patchModules(modules) {
    const patchJobs = [
      {
        name: "setNotice",
        identifiers: ['name:"setNotice"', "size:10"],
        patched: !GM_getValue("notification_showMoreNotification", true),
        replacements: [[/size\s*:\s*10/g, `size: ${GM_getValue("notification_notificationPageSize", 1000)}`]],
      },
      {
        name: "studentHomepage",
        identifiers: ['name:"studentHomepage"', "tapUndone", "tapSiteItem"],
        patched: !GM_getValue("home_openInNewTab", true),
        replacements: [
          // 规则来自 'tapUndone'
          [
            /window\.location\.href\s*=\s*("course\.html#\/teacher\/forum\/topicDetail_fullpage\?tid="\s*\+\s*e\.activityId)/g,
            'window.open($1, "_blank")',
          ],
          [
            /window\.location\.href\s*=\s*("course\.html#\/student\/assignmentDetails_fullpage\?activeTabName="\s*\+\s*t\s*\+\s*"&assignmentId="\s*\+\s*e\.activityId\s*\+\s*"&assignmentType="\s*\+\s*e\.assignmentType\s*\+\s*"&assignmentTitle="\s*\+\s*e\.activityName\s*\+\s*"&evaluationStatus="\s*\+\s*e\.evaluationStatus\s*\+\s*"&studentGroupId="\s*\+\s*e\.studentGroupId\s*\+\s*"&isOpenEvaluation="\s*\+\s*e\.isOpenEvaluation)/g,
            'window.open($1, "_blank")',
          ],
          [
            /window\.location\.href\s*=\s*("course\.html#\/answer\?id="\s*\+\s*e\.activityId)/g,
            'window.open($1, "_blank")',
          ],
          // 规则来自 'tapSiteItem'
          [
            /window\.location\.href\s*=\s*(["']course\.html#\/student\/courseHomePage\?ind=1["'])/g,
            'window.open($1, "_blank")',
          ],
          [
            /window\.location\.href\s*=\s*(["']course\.html#\/courseCenterDetail_fullpage["'])/g,
            'window.open($1, "_blank")',
          ],
        ],
      },
      // ,{
      //     name: 'anotherModule',
      //     identifiers: ['...'],
      //     patched: false,
      //     replacements: [ ... ]
      // } // <-- 新 Hook 示例
    ];

    /**
     * 尝试对模块字符串应用一个补丁任务
     * @param {string} moduleString - 原始模块代码
     * @param {object} job - patchJobs 数组中的一个补丁任务
     * @returns {{modifiedSource: string, isTarget: boolean}}
     */
    function applyPatchJob(moduleString, job) {
      const isTarget = job.identifiers.every((id) => moduleString.includes(id));
      if (!isTarget) {
        return { modifiedSource: moduleString, isTarget: false };
      }
      const modifiedSource = job.replacements.reduce(
        (currentSource, [regex, replacement]) => {
          return currentSource.replace(regex, replacement);
        },
        moduleString // reduce 的初始值
      );

      return { modifiedSource, isTarget: true };
    }

    const totalPatchesNeeded = patchJobs.length;
    let patchesApplied = 0;
    console.log(
      `[ucloud-Evolved] 开始 patching。需要寻找 ${totalPatchesNeeded} 个模块...`
    );

    for (const moduleId in modules) {
      if (patchesApplied === totalPatchesNeeded) {
        console.log("[ucloud-Evolved] 所有模块均已 patch。停止遍历。");
        break;
      }
      const originalModule = modules[moduleId];
      let currentModuleString = originalModule.toString();
      let moduleHasBeenModified = false;

      try {
        for (const job of patchJobs) {
          if (job.patched) {
            continue;
          }

          const { modifiedSource, isTarget } = applyPatchJob(
            currentModuleString,
            job
          );

          if (isTarget) {
            if (modifiedSource !== currentModuleString) {
              console.log(
                `[ucloud-Evolved] 目标 '${job.name}' (ID: ${moduleId}) 匹配。准备应用 patch...`
              );

              currentModuleString = modifiedSource;
              moduleHasBeenModified = true;

              job.patched = true;
              patchesApplied++;
            } else {
              console.warn(
                `[ucloud-Evolved] 找到 '${job.name}' (ID: ${moduleId})，但正则表达式替换失败!`
              );
            }
          }
        }

        if (moduleHasBeenModified) {
          console.log(
            `[ucloud-Evolved] (ID: ${moduleId}) 所有 patches 应用完毕。正在重新构造模块...`
          );
          const hookedModule = new Function(`return (${currentModuleString})`)();
          modules[moduleId] = hookedModule; // 在内存中替换模块
          console.log(`[Hook Script] (ID: ${moduleId}) patch 成功!`);
        }
      } catch (error) {
        console.error(
          `[ucloud-Evolved] Patch 模块 ${moduleId} 失败! 错误:`,
          error
        );
        console.error(
          "[ucloud-Evolved] 发生错误的模块代码 (可能已部分 patch):",
          currentModuleString
        );
      }
    }

    if (patchesApplied < totalPatchesNeeded) {
      console.log(
        `[ucloud-Evolved] Patch 结束，但未进行所有patch。已patch ${patchesApplied}/${totalPatchesNeeded} 处。`
      );
    }
  }
  let originalWebpackJsonp = unsafeWindow.webpackJsonp;
  let webpackJsonp_ = undefined;

  function hookWebpackFunction(originalFunc) {
    return function (chunkIds, modules, ...rest) {
      patchModules(modules);
      return originalFunc.apply(this, [chunkIds, modules, ...rest]);
    };
  }

  function hookWebpackArray(array) {
    array.forEach((chunk) => patchModules(chunk[1]));
    const originalPush = array.push;
    array.push = function (...args) {
      const chunk = args[0];
      if (chunk && chunk[1]) {
        patchModules(chunk[1]);
      }
      return originalPush.apply(this, args);
    };
    return array;
  }

  if (typeof originalWebpackJsonp === "function") {
    webpackJsonp_ = hookWebpackFunction(originalWebpackJsonp);
  } else if (Array.isArray(originalWebpackJsonp)) {
    webpackJsonp_ = hookWebpackArray(originalWebpackJsonp);
  } else {
    webpackJsonp_ = originalWebpackJsonp;
  }

  Object.defineProperty(unsafeWindow, "webpackJsonp", {
    configurable: true,
    enumerable: true,
    get() {
      return webpackJsonp_;
    },
    set(newValue) {
      console.log("[ucloud-Evolved] `webpackJsonp` assignment captured.");
      if (Array.isArray(newValue)) {
        webpackJsonp_ = hookWebpackArray(newValue);
      } else if (typeof newValue === "function") {
        webpackJsonp_ = hookWebpackFunction(newValue);
      } else {
        webpackJsonp_ = newValue;
      }
    },
  });
})();

(function () {
  if (location.href.startsWith("https://ucloud.bupt.edu.cn/office/")) {
    if (
      GM_getValue("preview_autoSwitchOffice", false) ||
      GM_getValue("preview_autoSwitchPdf", true) ||
      GM_getValue("preview_autoSwitchImg", true)
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
        if (!GM_getValue("preview_autoSwitchOffice", false)) {
          return;
        }
        if (window.stop) window.stop();
        location.href =
          "https://view.officeapps.live.com/op/view.aspx?src=" +
          encodeURIComponent(viewURL.toString());
        return;
      } else if (filename.endsWith(".pdf")) {
        if (!GM_getValue("preview_autoSwitchPdf", true)) {
          return;
        }
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
      } else if (
        filename.endsWith(".jpg") ||
        filename.endsWith(".png") ||
        filename.endsWith(".jpeg") ||
        filename.endsWith(".gif") ||
        filename.endsWith(".webp") ||
        filename.endsWith(".bmp") ||
        filename.endsWith(".tiff") ||
        filename.endsWith(".svg")
      ) {
        if (!GM_getValue("preview_autoSwitchImg", true)) {
          return;
        }
        if (window.stop) window.stop();
        function createModernImageViewer(imageUrl) {
          const style = document.createElement("style");
          style.textContent = `
          .modern-image-viewer {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.9);
            z-index: 9999;
            display: flex;
            flex-direction: column;
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          }

          .viewer-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 20px;
            background-color: rgba(0, 0, 0, 0.7);
            z-index: 1;
          }

          .viewer-title {
            font-size: 16px;
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 70%;
          }

          .viewer-controls {
            display: flex;
            gap: 15px;
          }

          .viewer-button {
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            font-size: 16px;
            padding: 5px;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background-color 0.2s;
          }

          .viewer-button:hover {
            background-color: rgba(255, 255, 255, 0.1);
          }

          .viewer-content {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
          }

          .viewer-image {
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            transform-origin: center center;
            transition: transform 0.05s linear;
            cursor: grab;
          }

          .viewer-image.dragging {
            cursor: grabbing;
            transition: none;
          }

          .viewer-toolbar {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 12px;
            background-color: rgba(0, 0, 0, 0.7);
            gap: 20px;
          }

          .zoom-level {
            font-size: 14px;
            min-width: 60px;
            text-align: center;
          }

          .viewer-help {
            position: absolute;
            bottom: 80px;
            left: 50%;
            transform: translateX(-50%);
            background-color: rgba(0, 0, 0, 0.7);
            padding: 15px 20px;
            border-radius: 8px;
            max-width: 400px;
            font-size: 14px;
            display: none;
            z-index: 2;
          }

          .viewer-help h3 {
            margin-top: 0;
            margin-bottom: 10px;
            font-size: 16px;
          }

          .viewer-help ul {
            margin: 0;
            padding-left: 20px;
          }

          .viewer-help li {
            margin-bottom: 5px;
          }

          .keyboard-shortcut {
            display: inline-block;
            background-color: rgba(255, 255, 255, 0.1);
            padding: 2px 6px;
            border-radius: 3px;
            margin: 0 2px;
          }

          @media (max-width: 768px) {
            .viewer-controls {
              gap: 10px;
            }

            .viewer-button {
              font-size: 14px;
            }

            .viewer-toolbar {
              padding: 10px;
              gap: 15px;
            }
          }
        `;
          document.head.appendChild(style);

          // 创建预览器DOM结构
          document.body.innerHTML = `
          <div class="modern-image-viewer">
            <div class="viewer-header">
              <div class="viewer-title">${getImageFileName(imageUrl)}</div>
              <div class="viewer-controls">
                <button class="viewer-button" id="help-btn" title="帮助">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-4h2v2h-2zm2.07-7.75l-.9.92c-.5.51-.86.97-1.04 1.69-.08.32-.13.68-.13 1.14h2c0-.47.08-.91.22-1.31.2-.58.53-.97.98-1.42l.9-.92c.35-.36.58-.82.58-1.35 0-1.1-.9-2-2-2s-2 .9-2 2h2c0-.55.45-1 1-1s1 .45 1 1c0 .28-.12.53-.31.72z"/>
                  </svg>
                </button>
                <button class="viewer-button" id="download-btn" title="下载">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
                  </svg>
                </button>
              </div>
            </div>

            <div class="viewer-content">
              <img id="viewer-img" class="viewer-image" src="${imageUrl}" alt="预览图片" draggable="false">
            </div>

            <div class="viewer-toolbar">
              <button class="viewer-button" id="rotate-left" title="向左旋转">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7.11 8.53L5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47zM6.09 13H4.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.87-1.59-1.01-2.47zm1.01 5.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L7.1 18.32zM13 4.07V1L8.45 5.55 13 10V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z"/>
                </svg>
              </button>
              <button class="viewer-button" id="zoom-out" title="缩小">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14zM7 9h5v1H7z"/>
                </svg>
              </button>
              <span class="zoom-level" id="zoom-level">100%</span>
              <button class="viewer-button" id="zoom-in" title="放大">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                  <path d="M12 10h-2v2H9v-2H7V9h2V7h1v2h2z"/>
                </svg>
              </button>
              <button class="viewer-button" id="zoom-reset" title="重置">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                </svg>
              </button>
              <button class="viewer-button" id="rotate-right" title="向右旋转">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M15.55 5.55L11 1v3.07C7.06 4.56 4 7.92 4 12s3.05 7.44 7 7.93v-2.02c-2.84-.48-5-2.94-5-5.91s2.16-5.43 5-5.91V10l4.55-4.45zM19.93 11c-.17-1.39-.72-2.73-1.62-3.89l-1.42 1.42c.54.75.88 1.6 1.02 2.47h2.02zM13 17.9v2.02c1.39-.17 2.74-.71 3.9-1.61l-1.44-1.44c-.75.54-1.59.89-2.46 1.03zm3.89-2.42l1.42 1.41c.9-1.16 1.45-2.5 1.62-3.89h-2.02c-.14.87-.48 1.72-1.02 2.48z"/>
                </svg>
              </button>
            </div>

            <div class="viewer-help" id="help-panel">
              <h3>键盘快捷键</h3>
              <ul>
                <li><span class="keyboard-shortcut">+</span> 或 <span class="keyboard-shortcut">-</span> 放大/缩小</li>
                <li><span class="keyboard-shortcut">0</span> 重置缩放</li>
                <li><span class="keyboard-shortcut">←</span> <span class="keyboard-shortcut">→</span> 左右旋转</li>
                <li><span class="keyboard-shortcut">R</span> 重置所有变换</li>
                <li><span class="keyboard-shortcut">D</span> 下载图片</li>
                <li><span class="keyboard-shortcut">Esc</span> 关闭预览器</li>
              </ul>
            </div>
          </div>
        `;

          document.body.style.overflow = "hidden";

          // 获取元素引用
          const viewer = document.querySelector(".modern-image-viewer");
          const image = document.getElementById("viewer-img");
          const helpBtn = document.getElementById("help-btn");
          const helpPanel = document.getElementById("help-panel");
          const downloadBtn = document.getElementById("download-btn");
          const rotateLeftBtn = document.getElementById("rotate-left");
          const rotateRightBtn = document.getElementById("rotate-right");
          const zoomInBtn = document.getElementById("zoom-in");
          const zoomOutBtn = document.getElementById("zoom-out");
          const zoomResetBtn = document.getElementById("zoom-reset");
          const zoomLevelDisplay = document.getElementById("zoom-level");

          // 图片变换状态
          const state = {
            scale: 1,
            rotation: 0,
            translateX: 0,
            translateY: 0,
            dragging: false,
            lastX: 0,
            lastY: 0,
            loaded: false,
          };

          // 图片加载完成事件
          image.onload = () => {
            state.loaded = true;
            image.style.opacity = 1;
            applyTransform();
          };

          // 应用变换
          function applyTransform() {
            image.style.transform = `translate(${state.translateX}px, ${state.translateY}px) rotate(${state.rotation}deg) scale(${state.scale})`;
            zoomLevelDisplay.textContent = `${Math.round(state.scale * 100)}%`;
          }

          // 缩放图片
          function zoom(delta) {
            if (!state.loaded) return;

            const oldScale = state.scale;
            state.scale = Math.max(0.1, Math.min(10, state.scale + delta));

            // Only adjust position if we have mouse coordinates
            if (state.lastClientX !== undefined) {
              const imageRect = image.getBoundingClientRect();

              // Get the position relative to the image's natural center
              const naturalWidth = image.naturalWidth;
              const naturalHeight = image.naturalHeight;

              // Calculate the point on the original image that was under the cursor
              const viewportX = state.lastClientX - imageRect.left;
              const viewportY = state.lastClientY - imageRect.top;

              // Convert to coordinates relative to the image center in the current scale
              const imageX = viewportX - imageRect.width / 2;
              const imageY = viewportY - imageRect.height / 2;

              // Calculate how this point's position changes with the new scale
              const scaleDiff = state.scale - oldScale;

              // Adjust translation to keep the point under cursor
              state.translateX -= (imageX * scaleDiff) / oldScale;
              state.translateY -= (imageY * scaleDiff) / oldScale;
            }

            applyTransform();
          }

          // 旋转图片
          function rotate(degrees) {
            if (!state.loaded) return;
            state.rotation = (state.rotation + degrees) % 360;
            applyTransform();
          }

          // 重置变换
          function resetTransform() {
            if (!state.loaded) return;
            state.scale = 1;
            state.rotation = 0;
            state.translateX = 0;
            state.translateY = 0;
            applyTransform();
          }

          // 下载图片
          function downloadImage() {
            const a = document.createElement("a");
            a.href = imageUrl;
            a.download = getImageFileName(imageUrl);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }

          // 从URL中提取文件名
          function getImageFileName(url) {
            try {
              const urlObj = new URL(url);
              const pathParts = urlObj.pathname.split("/");
              const fileName = decodeURIComponent(
                pathParts[pathParts.length - 1]
              );
              return fileName || "图片预览";
            } catch (e) {
              return "图片预览";
            }
          }

          image.addEventListener("mousedown", (e) => {
            if (!state.loaded) return;
            e.preventDefault();
            state.dragging = true;
            state.lastX = e.clientX;
            state.lastY = e.clientY;
            image.classList.add("dragging");
          });

          document.addEventListener("mousemove", (e) => {
            state.lastClientX = e.clientX;
            state.lastClientY = e.clientY;

            if (!state.dragging) return;
            e.preventDefault();

            state.translateX += e.clientX - state.lastX;
            state.translateY += e.clientY - state.lastY;
            state.lastX = e.clientX;
            state.lastY = e.clientY;

            applyTransform();
          });

          document.addEventListener("mouseup", () => {
            state.dragging = false;
            image.classList.remove("dragging");
          });

          let lastTouchDistance = 0;
          let touchRotationStart = 0;

          image.addEventListener(
            "touchstart",
            (e) => {
              if (!state.loaded) return;
              if (e.touches.length === 1) {
                e.preventDefault();
                state.dragging = true;
                state.lastX = e.touches[0].clientX;
                state.lastY = e.touches[0].clientY;
                image.classList.add("dragging");
              } else if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const touchDistance = Math.sqrt(dx * dx + dy * dy);
                const scaleFactor = touchDistance / lastTouchDistance;

                if (
                  !isNaN(scaleFactor) &&
                  isFinite(scaleFactor) &&
                  scaleFactor > 0
                ) {
                  const oldScale = state.scale;
                  state.scale = Math.max(
                    0.1,
                    Math.min(10, state.scale * scaleFactor)
                  );

                  const centerX =
                    (e.touches[0].clientX + e.touches[1].clientX) / 2;
                  const centerY =
                    (e.touches[0].clientY + e.touches[1].clientY) / 2;

                  const imageRect = image.getBoundingClientRect();

                  const imageX =
                    centerX - (imageRect.left + imageRect.width / 2);
                  const imageY =
                    centerY - (imageRect.top + imageRect.height / 2);

                  state.translateX += imageX * (1 - scaleFactor);
                  state.translateY += imageY * (1 - scaleFactor);

                  lastTouchDistance = touchDistance;
                }

                touchRotationStart =
                  (Math.atan2(
                    e.touches[1].clientY - e.touches[0].clientY,
                    e.touches[1].clientX - e.touches[0].clientX
                  ) *
                    180) /
                  Math.PI;
              }
            },
            { passive: false }
          );

          image.addEventListener(
            "touchmove",
            (e) => {
              if (!state.loaded) return;
              e.preventDefault();

              if (e.touches.length === 1 && state.dragging) {
                state.translateX += e.touches[0].clientX - state.lastX;
                state.translateY += e.touches[0].clientY - state.lastY;
                state.lastX = e.touches[0].clientX;
                state.lastY = e.touches[0].clientY;
                applyTransform();
              } else if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const touchDistance = Math.sqrt(dx * dx + dy * dy);
                const scaleFactor = touchDistance / lastTouchDistance;

                if (
                  !isNaN(scaleFactor) &&
                  isFinite(scaleFactor) &&
                  scaleFactor > 0
                ) {
                  const oldScale = state.scale;
                  state.scale = Math.max(
                    0.1,
                    Math.min(10, state.scale * scaleFactor)
                  );

                  const centerX =
                    (e.touches[0].clientX + e.touches[1].clientX) / 2;
                  const centerY =
                    (e.touches[0].clientY + e.touches[1].clientY) / 2;
                  const imageRect = image.getBoundingClientRect();

                  const x = centerX - imageRect.left;
                  const y = centerY - imageRect.top;

                  // 这是关键修复 - 调整以保持缩放点位置不变
                  state.translateX +=
                    (1 - scaleFactor) * (x - state.translateX);
                  state.translateY +=
                    (1 - scaleFactor) * (y - state.translateY);

                  lastTouchDistance = touchDistance;
                }

                const touchRotation =
                  (Math.atan2(
                    e.touches[1].clientY - e.touches[0].clientY,
                    e.touches[1].clientX - e.touches[0].clientX
                  ) *
                    180) /
                  Math.PI;

                const rotationDelta = touchRotation - touchRotationStart;
                if (!isNaN(rotationDelta) && isFinite(rotationDelta)) {
                  state.rotation = (state.rotation + rotationDelta) % 360;
                  touchRotationStart = touchRotation;
                }

                applyTransform();
              }
            },
            { passive: false }
          );

          image.addEventListener("touchend", () => {
            state.dragging = false;
            image.classList.remove("dragging");
          });

          // 鼠标滚轮缩放
          viewer.addEventListener(
            "wheel",
            (e) => {
              if (!state.loaded) return;
              e.preventDefault();
              const delta = e.deltaY < 0 ? 0.1 : -0.1;

              // 保存鼠标位置
              state.lastClientX = e.clientX;
              state.lastClientY = e.clientY;

              zoom(delta);
            },
            { passive: false }
          );

          // 按钮点击事件
          helpBtn.addEventListener("click", () => {
            helpPanel.style.display =
              helpPanel.style.display === "block" ? "none" : "block";
          });
          downloadBtn.addEventListener("click", downloadImage);
          rotateLeftBtn.addEventListener("click", () => rotate(-90));
          rotateRightBtn.addEventListener("click", () => rotate(90));
          zoomInBtn.addEventListener("click", () => zoom(0.1));
          zoomOutBtn.addEventListener("click", () => zoom(-0.1));
          zoomResetBtn.addEventListener("click", resetTransform);

          // 键盘快捷键
          document.addEventListener("keydown", (e) => {
            if (!state.loaded) return;

            switch (e.key) {
              case "Escape":
                closeViewer();
                break;
              case "+":
              case "=":
                zoom(0.1);
                break;
              case "-":
                zoom(-0.1);
                break;
              case "0":
                state.scale = 1;
                applyTransform();
                break;
              case "ArrowLeft":
                rotate(-90);
                break;
              case "ArrowRight":
                rotate(90);
                break;
              case "r":
              case "R":
                resetTransform();
                break;
              case "d":
              case "D":
                downloadImage();
                break;
              case "h":
              case "H":
              case "?":
                helpPanel.style.display =
                  helpPanel.style.display === "block" ? "none" : "block";
                break;
            }
          });

          // 点击背景关闭帮助面板
          viewer.addEventListener("click", (e) => {
            if (e.target === viewer && helpPanel.style.display === "block") {
              helpPanel.style.display = "none";
            }
          });

          // 双击图片重置缩放
          image.addEventListener("dblclick", (e) => {
            if (!state.loaded) return;
            e.preventDefault();

            if (state.scale === 1) {
              state.lastClientX = e.clientX;
              state.lastClientY = e.clientY;
              zoom(1);
            } else {
              resetTransform();
            }
          });
        }
        createModernImageViewer(viewURL.toString());
        return;
      }
      return;
    }
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
    if (GM_getValue("notification_showMoreNotification", true)) {
      // if (
      //   typeof url === "string" &&
      //   url.includes("/ykt-basics/api/inform/news/list")
      // ) {
      //   url = url.replace(/size=\d+/, "size=1000");
      // } else
      if (
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
  document.addEventListener("DOMContentLoaded", initializeExtension);
  const settingsConfig = {
    home: {
      emoji: '👤',
      title: '个人主页',
      items: {
        useBiggerButton: {
          type: 'checkbox',
          label: '加大翻页按钮尺寸',
          description: '增大页面翻页按钮的尺寸和点击区域，提升操作便捷性。',
          defaultValue: true
        },
        openInNewTab: {
          type: 'checkbox',
          label: '在新标签中打开详情页',
          description: '个人主页中的课程和作业详情链接将在新标签页中打开，方便多任务处理。',
          defaultValue: true
        },
        addHomeworkSource: {
          type: 'checkbox',
          label: '显示作业来源',
          description: '为作业添加来源，直观显示发布作业的课程。',
          defaultValue: true
        },
        useWheelPageTurner: {
          type: 'checkbox',
          label: '使用鼠标滚轮翻页',
          description: '可以使用鼠标滚轮来翻动个人主页的"本学期课程"和"待办"。',
          defaultValue: true
        },
        showOverdueBadge: {
          type: 'checkbox',
          label: '待办逾期提示',
          description: '在已逾期的待办旁显示红色"已逾期"标签，3天内到期的显示橙色"XXh截止"标签。',
          defaultValue: false
        }
      }
    },
    preview: {
      emoji: '🖼️',
      title: '课件预览',
      items: {
        autoDownload: {
          type: 'checkbox',
          label: '预览课件时自动下载',
          description: '当打开课件预览时，自动触发下载操作，方便存储课件到本地。',
          defaultValue: false
        },
        autoSwitchOffice: {
          type: 'checkbox',
          label: '使用 Office365 预览 Office 文件',
          description: '使用微软 Office365 在线服务预览 Office 文档，提供更好的浏览体验。',
          defaultValue: false
        },
        autoSwitchPdf: {
          type: 'checkbox',
          label: '使用浏览器原生阅读器预览 PDF 文件',
          description: '使用系统（浏览器）原生的阅读器预览PDF文档，提供更好的浏览体验。移动端及部分平板可能不支持。',
          defaultValue: true
        },
        autoSwitchImg: {
          type: 'checkbox',
          label: '使用内置阅读器预览图片文件',
          description: '使用脚本内置的阅读器预览图片文件，提供更好的浏览体验。',
          defaultValue: true
        },
        autoClosePopup: {
          type: 'checkbox',
          label: '自动关闭预览时的学习弹窗',
          description: '自动关闭预览时出现的"您已经在学习"及同类弹窗。',
          defaultValue: true
        },
        hideTimer: {
          type: 'checkbox',
          label: '隐藏预览界面的倒计时',
          description: '隐藏课件预览页面的倒计时显示。',
          defaultValue: true
        }
      }
    },
    course: {
      emoji: '📚',
      title: '课程详情',
      items: {
        addBatchDownload: {
          type: 'checkbox',
          label: '增加批量下载按钮',
          description: '增加批量下载按钮，方便一键下载课程中的所有课件。',
          defaultValue: false
        },
        showAllDownloadButoon: {
          type: 'checkbox',
          label: '显示所有下载选项',
          description: '在资源页显示所有可用的下载按钮。',
          defaultValue: true
        }
      }
    },
    homework: {
      emoji: '📝',
      title: '作业详情',
      items: {
        showHomeworkSource: {
          type: 'checkbox',
          label: '显示作业所属课程',
          description: '在作业详情页显示作业所属的课程名称，便于区分不同课程的作业。',
          defaultValue: true
        }
      }
    },
    notification: {
      emoji: '📢',
      title: '消息通知',
      items: {
        showMoreNotification: {
          type: 'checkbox',
          label: '显示更多历史通知',
          description: '在通知列表中显示更多的历史通知，不再受限于默认显示数量。',
          defaultValue: true,
        },
        notificationPageSize: {
          type: 'number',
          label: '单页显示通知数量',
          description: '设置通知列表单页显示的通知条数（范围：10-2000）。',
          defaultValue: 1000,
          min: 10,
          max: 2000,
          enabledBy: 'showMoreNotification'
        },
        sortNotificationsByTime: {
          type: 'checkbox',
          label: '通知按时间排序',
          description: '将通知按照时间先后顺序排列，更容易找到最新或最早的通知。',
          defaultValue: true,
        },
        betterNotificationHighlight: {
          type: 'checkbox',
          label: '优化未读通知高亮',
          description: '为未读通知添加更显眼的视觉效果，避免遗漏重要信息。',
          defaultValue: true
        }
      }
    },
    system: {
      emoji: '⚙️',
      title: '系统设置',
      items: {
        fixTicketBug: {
          type: 'checkbox',
          label: '修复 ticket 跳转问题',
          description: '修复登录过期后，重新登录出现无法获取ticket提示的问题。',
          defaultValue: true
        },
        betterTitle: {
          type: 'checkbox',
          label: '优化页面标题',
          description: '优化浏览器标签页的标题显示，更直观地反映当前页面内容。',
          defaultValue: true
        },
        unlockCopy: {
          type: 'checkbox',
          label: '解除复制限制',
          description: '解除全局的复制限制，方便摘录内容进行学习笔记。',
          defaultValue: true
        },
        autoUpdate: {
          type: 'checkbox',
          label: '启用自动更新检查',
          description: '定期检查脚本更新，确保您始终使用最新版本的功能和修复。',
          defaultValue: false
        },
        showConfigButton: {
          type: 'checkbox',
          label: '显示插件悬浮窗',
          description: '在网页界面显示助手配置按钮，方便随时调整设置。',
          defaultValue: true
        }
      }
    }
  };

  // 从配置自动生成settings对象
  const settings = {};
  Object.keys(settingsConfig).forEach(category => {
    settings[category] = {};
    const items = settingsConfig[category].items;
    Object.keys(items).forEach(key => {
      const item = items[key];
      const settingId = `${category}_${key}`;
      settings[category][key] = GM_getValue(settingId, item.defaultValue);
    });
  });

  // 辅助变量
  let sumBytes = 0,
    loadedBytes = 0,
    downloading = false;
  let gpage = -1;
  let glist = null;
  let onlinePreview = null;

  // 初始化扩展功能
  function initializeExtension() {
    // 注册菜单命令
    registerMenuCommands();

    const nprogressCSS = GM_getResourceText("NPROGRESS_CSS");
    GM_addStyle(nprogressCSS);

    loadui();

    addFunctionalCSS();
    setTimeout(main, 100);

    if (settings.system.autoUpdate) {
      checkForUpdates();
    }

    window.addEventListener("hashchange", () => {
      setTimeout(main, 500);
    });
  }

  // 注册菜单命令
  function registerMenuCommands() {
    GM_registerMenuCommand(
      (settings.system.showConfigButton ? "✅ " : "❌ ") +
        "显示插件悬浮窗：" +
        (settings.system.showConfigButton ? "已启用" : "已禁用"),
      () => {
        settings.system.showConfigButton = !settings.system.showConfigButton;
        GM_setValue(
          "system_showConfigButton",
          settings.system.showConfigButton
        );
        location.reload();
      }
    );
    
    GM_registerMenuCommand("⚙️ 打开插件设置", () => {
      if (
        document
          .getElementById("yzHelper-settings")
          .classList.contains("visible")
      ) {
        document
          .getElementById("yzHelper-settings")
          .classList.remove("visible");
        setTimeout(() => {
          document.getElementById("yzHelper-settings").style.display = "none";
        }, 300);
        return;
      }
      document.getElementById("yzHelper-settings").style.display = "flex";
      void document.getElementById("yzHelper-settings").offsetWidth;
      document.getElementById("yzHelper-settings").classList.add("visible");
    });
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
          border-bottom: 1px solid #eee;
          background-color: #ecb000;
          color: white;
          font-weight: bold;
          font-size: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
      }

      #yzHelper-main {
          display: flex;
          flex: 1;
          overflow: hidden;
      }

      #yzHelper-settings-sidebar {
          width: 140px;
          background: #f7f7f7;
          padding: 15px 0;
          border-right: 1px solid #eee;
          overflow-y: auto;
      }

      #yzHelper-settings-sidebar .menu-item {
          padding: 12px 15px;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 14px;
          color: #666;
          display: flex;
          align-items: center;
          gap: 8px;
      }

      #yzHelper-settings-sidebar .menu-item:hover {
          background: #efefef;
          color: #333;
      }

      #yzHelper-settings-sidebar .menu-item.active {
          background: #ffbe00;
          color: #fff;
          font-weight: 500;
      }

      #yzHelper-settings-sidebar .emoji {
          font-size: 16px;
      }

      #yzHelper-settings-content {
          flex: 1;
          padding: 20px;
          overflow-y: auto;
          position: relative;
          padding-bottom: 70px; /* Space for buttons */
      }

      #yzHelper-settings-content .settings-section {
          display: none;
      }

      #yzHelper-settings-content .settings-section.active {
          display: block;
      }

      #section-about .about-content {
          line-height: 1.6;
          font-size: 14px;
      }

      #section-about h4 {
          margin: 16px 0 8px;
          font-size: 15px;
      }

      #section-about ul {
          margin: 8px 0;
          padding-left: 20px;
      }

      #section-about li {
          margin-bottom: 4px;
      }

      #section-about .github-link {
          display: inline-flex;
          align-items: center;
          padding: 6px 12px;
          background: #f6f8fa;
          border: 1px solid rgba(27, 31, 36, 0.15);
          border-radius: 6px;
          color: #24292f;
          text-decoration: none;
          font-weight: 500;
          transition: background-color 0.2s;
      }

      #section-about .github-link:hover {
          background-color: #f3f4f6;
      }

      #section-about .github-icon {
          margin-right: 6px;
          fill: currentColor;
      }


      #section-about .feedback-note {
          margin-top: 14px;
          border-top: 1px solid #eaecef;
          padding-top: 14px;
          font-size: 13px;
          color: #57606a;
      }

      #section-about code {
          background: rgba(175, 184, 193, 0.2);
          padding: 0.2em 0.4em;
          border-radius: 6px;
          font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace;
          font-size: 85%;
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
          cursor: pointer;
      }

      #yzHelper-settings .setting-description {
        display: block; /* 始终保持在DOM中 */
        margin-left: 54px;
        font-size: 12px;
        color: #666;
        background: #f9f9f9;
        border-left: 3px solid #ffbe00;
        border-radius: 0 4px 4px 0;
        max-height: 0;
        overflow: hidden;
        opacity: 0;
        transition: all 0.3s ease;
        padding: 0 12px;
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
          position: fixed;
          bottom: 0px;
          right: 25px;
          background: white;
          padding: 10px 0;
          width: calc(100% - 180px);
          border-top: 1px solid #f5f5f5;
          box-sizing: border-box;
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
      #yzHelper-settings .setting-item.disabled .setting-toggle,
      #yzHelper-settings .setting-item .setting-toggle:has(input:disabled) {
          opacity: 0.7;
      }

      #yzHelper-settings input:disabled + .slider {
          background-color: #ffbe00;
          opacity: 0.5;
          cursor: not-allowed;
      }

      #yzHelper-settings input:disabled + .slider:before {
          background-color: #f0f0f0;
      }

      #yzHelper-settings .setting-item:has(input:disabled) .setting-label:after {
          content: " 🔒";
          font-size: 12px;
      }

      #yzHelper-settings .setting-item:has(input:disabled) .setting-description {
          border-left-color: #ccc;
          font-style: italic;
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
    if (settings.system.showConfigButton) {
      document.body.appendChild(settingsToggle);
    }

    // 生成单个设置项的HTML
    function generateSettingItem(category, key, item) {
      const settingId = `${category}_${key}`;
      const value = settings[category][key];
      const disabledAttr = item.disabled ? 'disabled' : '';
      
      if (item.type === 'checkbox') {
        const checkedAttr = value ? 'checked' : '';
        return `
          <div class="setting-item">
            <div class="setting-toggle">
              <label class="switch">
                <input type="checkbox" id="${settingId}" ${checkedAttr} ${disabledAttr} data-type="checkbox">
                <span class="slider"></span>
              </label>
              <span class="setting-label" data-for="description-${settingId}">${item.label}</span>
            </div>
            <div class="setting-description" id="description-${settingId}">
              ${item.description}
            </div>
          </div>
        `;
      } else if (item.type === 'number') {
        const enabledByCheckbox = item.enabledBy ? `${category}_${item.enabledBy}` : null;
        const numberDisabled = enabledByCheckbox && !settings[category][item.enabledBy];
        const numberDisabledAttr = numberDisabled || item.disabled ? 'disabled' : '';
        const enabledByAttr = enabledByCheckbox ? `data-enabled-by="${enabledByCheckbox}"` : '';
        
        return `
          <div class="setting-item">
            <div class="setting-toggle">
              <label class="setting-label" data-for="description-${settingId}">${item.label}</label>
              <input type="number" 
                id="${settingId}" 
                value="${value}" 
                min="${item.min || 0}" 
                max="${item.max || 9999}" 
                ${numberDisabledAttr} 
                ${enabledByAttr}
                data-type="number"
                style="width: 80px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; margin-left: 10px;">
            </div>
            <div class="setting-description" id="description-${settingId}">
              ${item.description}
            </div>
          </div>
        `;
      }
      return '';
    }

    // 生成设置区块的HTML
    function generateSettingsSection(category, config, isActive = false) {
      const activeClass = isActive ? 'active' : '';
      const items = config.items;
      const itemsHTML = Object.keys(items).map(key => 
        generateSettingItem(category, key, items[key])
      ).join('');
      
      return `
        <div class="settings-section ${activeClass}" id="section-${category}">
          <h3>${config.emoji} ${config.title}</h3>
          ${itemsHTML}
        </div>
      `;
    }

    // 生成侧边栏菜单HTML
    function generateSidebarMenu() {
      const categories = Object.keys(settingsConfig);
      return categories.map((category, index) => {
        const config = settingsConfig[category];
        const activeClass = index === 0 ? 'active' : '';
        return `
          <div class="menu-item ${activeClass}" data-section="${category}">
            <span class="emoji">${config.emoji}</span>
            <span>${config.title.replace(/^[^\s]+\s/, '')}</span>
          </div>
        `;
      }).join('') + `
        <div class="menu-item" data-section="about">
          <span class="emoji">ℹ️</span>
          <span>关于助手</span>
        </div>
      `;
    }

    // 生成所有设置区块HTML
    function generateAllSections() {
      let sectionsHTML = '';
      let isFirst = true;
      
      const categories = Object.keys(settingsConfig);
      for (const category of categories) {
        sectionsHTML += generateSettingsSection(category, settingsConfig[category], isFirst);
        isFirst = false;
      }
      
      // 添加关于助手区块
      sectionsHTML += `
        <div class="settings-section" id="section-about">
          <h3>ℹ️ 关于云邮教学空间助手</h3>
          <div class="about-content">
            <p>云邮教学空间助手是一款专为云邮教学空间平台设计的浏览器增强脚本。</p>

            <h4>🚀 主要功能</h4>
            <ul>
              <li>📍 个人主页优化 - 智能布局，提升交互体验</li>
              <li>📄 课件预览增强 - 流畅浏览，轻松获取学习资源</li>
              <li>📥 课程管理优化 - 批量下载，多样化下载选项</li>
              <li>📋 作业管理助手 - 精准显示课程归属，提高管理效率</li>
              <li>🔔 通知管理优化 - 智能整理，突出重点通知</li>
              <li>🛠️ 系统功能增强 - 页面标题优化，解除复制限制等实用功能</li>
            </ul>

            <h4>🔗 相关链接</h4>
            <p>
              <a href="https://github.com/uarix/ucloud-Evolved/" target="_blank" class="github-link">
                <svg class="github-icon" height="16" width="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path>
                </svg>
                <span>GitHub 项目主页</span>
              </a>
            </p>

            <p class="feedback-note">
              如有问题或建议，请通过
              <a href="https://github.com/uarix/ucloud-Evolved/issues" target="_blank">GitHub Issues</a>
              提交反馈。
            </p>
          </div>
        </div>
      `;
      
      return sectionsHTML;
    }

    const settingsPanel = document.createElement("div");
    settingsPanel.id = "yzHelper-settings";

    const header = `
      <div id="yzHelper-header">
        <span>云邮教学空间助手</span>
        <span id="yzHelper-version">v${GM_info.script.version}</span>
      </div>
    `;

    const mainContent = `
    <div id="yzHelper-main">
        <div id="yzHelper-settings-sidebar">
            ${generateSidebarMenu()}
        </div>

        <div id="yzHelper-settings-content">
            ${generateAllSections()}
            <div class="buttons">
                <button id="cancelSettings" class="cancel">取消</button>
                <button id="saveSettings">保存设置</button>
            </div>
        </div>
    </div>
    `;

    settingsPanel.innerHTML = header + mainContent;
    document.body.appendChild(settingsPanel);

    // 菜单切换功能
    document
      .querySelectorAll("#yzHelper-settings-sidebar .menu-item")
      .forEach((item) => {
        item.addEventListener("click", function () {
          // 移除所有菜单项的活动状态
          document
            .querySelectorAll("#yzHelper-settings-sidebar .menu-item")
            .forEach((i) => {
              i.classList.remove("active");
            });
          document
            .querySelectorAll("#yzHelper-settings-content .settings-section")
            .forEach((section) => {
              section.classList.remove("active");
            });

          this.classList.add("active");
          const sectionId = "section-" + this.getAttribute("data-section");
          document.getElementById(sectionId).classList.add("active");

          // 隐藏所有设置描述
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

        // 隐藏所有其他描述
        document.querySelectorAll(".setting-description").forEach((desc) => {
          if (desc.id !== descriptionId) {
            desc.classList.remove("visible");
          }
        });

        // 切换当前描述的可见性
        description.classList.toggle("visible");
      });
    });

    function settingsTrigger() {
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
    }

    settingsToggle.addEventListener("click", settingsTrigger);

    document.getElementById("cancelSettings").addEventListener("click", () => {
      settingsPanel.classList.remove("visible");
      setTimeout(() => {
        settingsPanel.style.display = "none";
      }, 300);
    });

    // 为checkbox添加事件监听器以启用/禁用关联的number输入
    document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', function() {
        const checkboxId = this.id;
        // 查找所有依赖此checkbox的number输入
        document.querySelectorAll(`input[type="number"][data-enabled-by="${checkboxId}"]`).forEach(numberInput => {
          numberInput.disabled = !this.checked;
        });
      });
    });

    document.getElementById("saveSettings").addEventListener("click", () => {
      // 保存checkbox设置
      Array.from(
        document
          .querySelector("#yzHelper-settings-content")
          .querySelectorAll('input[type="checkbox"]:not(:disabled)')
      ).forEach((checkbox) => {
        const checkboxId = checkbox.id;
        if (checkboxId.includes("_")) {
          const [category, settingName] = checkboxId.split("_");
          if (settings[category] && settingName !== undefined) {
            settings[category][settingName] = checkbox.checked;
            GM_setValue(`${category}_${settingName}`, checkbox.checked);
          }
        }
      });
      
      // 保存number输入设置
      Array.from(
        document
          .querySelector("#yzHelper-settings-content")
          .querySelectorAll('input[type="number"]:not(:disabled)')
      ).forEach((numberInput) => {
        const inputId = numberInput.id;
        if (inputId.includes("_")) {
          const [category, settingName] = inputId.split("_");
          if (settings[category] && settingName !== undefined) {
            const value = parseInt(numberInput.value, 10);
            settings[category][settingName] = value;
            GM_setValue(`${category}_${settingName}`, value);
          }
        }
      });
      
      settingsPanel.classList.remove("visible");
      setTimeout(() => {
        settingsPanel.style.display = "none";
        showNotification("设置已保存", "刷新页面后生效");
      }, 300);
    });

    const ul_observer = new MutationObserver((mutations) => {
      const dropdownMenus = document.querySelectorAll(
        'ul.el-dropdown-menu.el-popper.dropdown-info[id*="dropdown-menu"]'
      );

      if (dropdownMenus.length > 0) {
        dropdownMenus.forEach((menu) => {
          if (!menu.querySelector(".plugin-settings-item")) {
            const settingsItem = document.createElement("li");
            settingsItem.setAttribute("tabindex", "-1");
            settingsItem.classList.add(
              "el-dropdown-menu__item",
              "plugin-settings-item"
            );
            settingsItem.innerHTML = "<!---->插件设置";
            settingsItem.addEventListener("click", settingsTrigger);
            menu.appendChild(settingsItem);
          }
        });
        ul_observer.disconnect();
      }
    });
    ul_observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

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
      if (settings.home.showOverdueBadge && tlist[i] && tlist[i].endTime) {
        const existing = nodes[i].querySelector(".yz-overdue-badge");
        if (existing) existing.remove();
        const end = new Date(tlist[i].endTime.replace(" ", "T"));
        const now = new Date();
        const diffMs = end - now;
        if (diffMs < 0) {
          const badge = document.createElement("span");
          badge.className = "yz-overdue-badge overdue";
          badge.textContent = "已逾期";
          nodes[i].querySelector(".activity-title").appendChild(badge);
        } else if (diffMs < 3 * 24 * 60 * 60 * 1000) {
          const hours = Math.ceil(diffMs / (60 * 60 * 1000));
          const badge = document.createElement("span");
          badge.className = "yz-overdue-badge soon";
          badge.textContent = hours + "h截止";
          nodes[i].querySelector(".activity-title").appendChild(badge);
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
    if (settings.home.showOverdueBadge) {
      GM_addStyle(`
      .yz-overdue-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 12px;
        font-weight: 600;
        margin-left: 8px;
        vertical-align: middle;
        line-height: 1.4;
      }
      .yz-overdue-badge.overdue {
        background: #f56c6c;
        color: #fff;
      }
      .yz-overdue-badge.soon {
        background: #e6a23c;
        color: #fff;
      }
      `);
    }
    if (settings.notification.betterNotificationHighlight) {
      GM_addStyle(`
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
    `);
    }
    if (settings.system.unlockCopy) {
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
    if (settings.home.useBiggerButton) {
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
      .el-icon-arrow-left, .el-icon-arrow-right {
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
      }
    `);
    }
  }

  // 主函数
  async function main() {
    "use strict";

    // 获取开关的状态（是否开启）
    const fixTicketEnabled = settings.system.fixTicketBug;

    // ticket跳转：仅当开关开启且存在ticket参数时执行
    if (fixTicketEnabled && new URLSearchParams(location.search).get("ticket")?.length) {
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
      if (settings.system.betterTitle) {
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
        const pageTitle = "[预览] " + (filename || "课件") + " - 教学云空间";
        document.title = pageTitle;
      }
      if (settings.preview.autoClosePopup) {
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
      if (settings.preview.hideTimer) {
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
      if (settings.system.betterTitle) {
        const pageTitle = "[作业] " + title + " - 教学云空间";
        document.title = pageTitle;
      }
      if (settings.homework.showHomeworkSource) {
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
              if (settings.preview.autoDownload) {
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
              ) {
                if (settings.preview.autoSwitchOffice) {
                  openTab(
                    "https://view.officeapps.live.com/op/view.aspx?src=" +
                      encodeURIComponent(url),
                    { active: true, insert: true }
                  );
                } else if (onlinePreview !== null) {
                  openTab(onlinePreview + encodeURIComponent(url), {
                    active: true,
                    insert: true,
                  });
                }
              } else if (onlinePreview !== null)
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
      if (settings.system.betterTitle) {
        const pageTitle = "个人主页 - 教学云空间";
        document.title = pageTitle;
      }
      if (settings.home.addHomeworkSource) {
        // 未完成任务列表
        const list = glist || (await getUndoneList()).data.undoneList;
        if (!list || !Array.isArray(list)) return;
        glist = list;

        const observer = new MutationObserver(async (mutations) => {
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
      }

      function wheelPageTurner() {
        const pageConfigs = [
          {
            // 待办
            targetSelector:
              "#layout-container > div.main-content > div.router-container > div > div.teacher-home-page > div.home-left-container.home-inline-block > div.in-progress-section.home-card > div.in-progress-body",
            prevPageSelector:
              '#layout-container > div.main-content > div.router-container > div > div.teacher-home-page > div.home-left-container.home-inline-block > div.in-progress-section.home-card > div.in-progress-header div[title="上一页"]',
            nextPageSelector:
              '#layout-container > div.main-content > div.router-container > div > div.teacher-home-page > div.home-left-container.home-inline-block > div.in-progress-section.home-card > div.in-progress-header div[title="下一页"]',
            pageIndicatorSelector:
              "#layout-container > div.main-content > div.router-container > div > div.teacher-home-page > div.home-left-container.home-inline-block > div.in-progress-section.home-card > div.in-progress-header div.banner-indicator.home-inline-block",
          },
          {
            // 本学期课程
            targetSelector:
              "#layout-container > div.main-content > div.router-container > div > div.teacher-home-page > div.home-left-container.home-inline-block > div.my-lesson-section.home-card > div.my-lesson-body",
            prevPageSelector:
              '#layout-container > div.main-content > div.router-container > div > div.teacher-home-page > div.home-left-container.home-inline-block > div.my-lesson-section.home-card > div.my-lesson-header div[title="上一页"]',
            nextPageSelector:
              '#layout-container > div.main-content > div.router-container > div > div.teacher-home-page > div.home-left-container.home-inline-block > div.my-lesson-section.home-card > div.my-lesson-header div[title="下一页"]',
            pageIndicatorSelector:
              "#layout-container > div.main-content > div.router-container > div > div.teacher-home-page > div.home-left-container.home-inline-block > div.my-lesson-section.home-card > div.my-lesson-header div.banner-indicator.home-inline-block",
          },
        ];
        function parsePageIndicator(pageIndicator) {
          const text = pageIndicator.textContent.trim();
          const [currentPage, totalPages] = text.split("/").map(Number);
          return { currentPage, totalPages };
        }
        function createWheelHandler(
          prevPageElement,
          nextPageElement,
          pageIndicator
        ) {
          return function (event) {
            const { currentPage, totalPages } =
              parsePageIndicator(pageIndicator);
            if (event.deltaY > 0 && currentPage < totalPages) {
              event.preventDefault();
              nextPageElement.click();
            } else if (event.deltaY < 0 && currentPage > 1) {
              event.preventDefault();
              prevPageElement.click();
            }
          };
        }
        pageConfigs.forEach((config) => {
          const targetDiv = document.querySelector(config.targetSelector);
          const prevPageElement = document.querySelector(
            config.prevPageSelector
          );
          const nextPageElement = document.querySelector(
            config.nextPageSelector
          );
          const pageIndicator = document.querySelector(
            config.pageIndicatorSelector
          );

          if (
            !targetDiv ||
            !prevPageElement ||
            !nextPageElement ||
            !pageIndicator
          )
            return;
          targetDiv.addEventListener(
            "wheel",
            createWheelHandler(prevPageElement, nextPageElement, pageIndicator),
            { passive: false }
          );
        });
      }
      if (settings.home.useWheelPageTurner) wheelPageTurner();
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
        if (settings.system.betterTitle) {
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

            if (settings.preview.autoDownload) {
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
            if (settings.course.showAllDownloadButoon) {
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
            }
          });

          // "下载全部"按钮
          if (
            !document.getElementById("downloadAllButton") &&
            resources.length > 0 &&
            settings.course.addBatchDownload
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
                    const btn = document.getElementById("downloadAllButton");
                    const totalCount = resources.length;
                    let completedCount = 0;
                    btn.innerHTML = "取消下载 (0/" + totalCount + ")";
                    for (let index = 0; index < resources.length; index++) {
                      if (!downloading) return;
                      const file = resources[index];
                      const shortName = file.name.length > 20 ? file.name.substring(0, 17) + "..." : file.name;
                      btn.innerHTML =
                        "取消下载 " + shortName + " (" + (index + 1) + "/" + totalCount + ")";
                      await downloadFile(
                        await getPreviewURL(file.id),
                        file.name
                      );
                      if (!downloading) return;
                      completedCount++;
                    }
                    if (downloading) {
                      downloading = false;
                      btn.innerHTML = "下载全部";
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
      if (settings.system.betterTitle) {
        const pageTitle = "首页 - 教学云空间";
        document.title = pageTitle;
      }
    }
    // 通知页
    else if (
      location.href ==
      "https://ucloud.bupt.edu.cn/uclass/index.html#/set/notice_fullpage"
    ) {
      if (settings.system.betterTitle) {
        const pageTitle = "通知 - 教学云空间";
        document.title = pageTitle;
      }

      function processNotifications() {
        const noticeContainer = document.querySelector(
          "#layout-container > div.main-content > div.router-container > div > div > div.setNotice-body > ul"
        );
        if (!noticeContainer) {
          console.log("通知容器未找到");
          return;
        }
        const noticeItems = Array.from(noticeContainer.querySelectorAll("li"));
        if (noticeItems.length === 0) {
          console.log("未找到通知项");
          return;
        }
        if (settings.notification.sortNotificationsByTime) {
          noticeItems.sort((a, b) => {
            const timeA = a.querySelector("span._left-time");
            const timeB = b.querySelector("span._left-time");
            if (!timeA || !timeB) {
              return 0;
            }
            const timeTextA = timeA.textContent.trim();
            const timeTextB = timeB.textContent.trim();
            const dateA = new Date(timeTextA);
            const dateB = new Date(timeTextB);
            return dateB - dateA;
          });
        }
        noticeItems.forEach((item) => {
          if (settings.notification.betterNotificationHighlight) {
            const hasRedDot = item.querySelector(
              "div.el-badge sup.el-badge__content.is-dot"
            );
            if (hasRedDot) {
              item.classList.remove("notification-with-dot");
              item.classList.add("notification-with-dot");
            } else {
              item.classList.remove("notification-with-dot");
            }
          }
          noticeContainer.appendChild(item);
        });
      }
      if (
        settings.notification.sortNotificationsByTime ||
        settings.notification.betterNotificationHighlight
      ) {
        // 等待通知元素加载好了再处理
        const loadingMaskSelector =
          "#layout-container > div.main-content > div.router-container > div > div > div.setNotice-body > div.el-loading-mask";
        const observer = new MutationObserver((mutations) => {
          const loadingMask = document.querySelector(loadingMaskSelector);
          if (loadingMask && loadingMask.style.display === "none") {
            processNotifications();
            observer.disconnect();
          }
        });

        const loadingMask = document.querySelector(loadingMaskSelector);
        if (loadingMask && loadingMask.style.display === "none") {
          processNotifications();
        } else {
          observer.observe(document.body, {
            attributes: true,
            attributeFilter: ["style"],
            subtree: true,
          });
          setTimeout(() => observer.disconnect(), 10000);
        }
      }
    }
  }
})();
