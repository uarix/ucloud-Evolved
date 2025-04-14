# ucloud-Evolved

<p align="center">
  <img src="./img/logo.jpg" alt="ucloud-Evolved Logo"/>
  <br>
  <a href="https://github.com/uarix/ucloud-Evolved/stargazers"><img src="https://img.shields.io/github/stars/uarix/ucloud-Evolved?style=flat-square" alt="Stars"></a>
  <a href="https://github.com/uarix/ucloud-Evolved/graphs/contributors"><img src="https://img.shields.io/github/contributors/uarix/ucloud-Evolved?style=flat-square" alt="Contributors"></a>
  <a href="https://github.com/uarix/ucloud-Evolved/commits/main"><img src="https://img.shields.io/github/commit-activity/y/uarix/ucloud-Evolved?style=flat-square" alt="Commit Activity"></a>
  <a href="https://github.com/uarix/ucloud-Evolved/commits/main"><img src="https://img.shields.io/github/last-commit/uarix/ucloud-Evolved?style=flat-square" alt="Last Commit"></a>
  <br>
  <a href="https://github.com/uarix/ucloud-Evolved/issues"><img src="https://img.shields.io/github/issues/uarix/ucloud-Evolved?style=flat-square" alt="Issues"></a>
  <a href="https://github.com/uarix/ucloud-Evolved/pulls"><img src="https://img.shields.io/github/issues-pr/uarix/ucloud-Evolved?style=flat-square" alt="Pull Requests"></a>
  <a href="https://github.com/uarix/ucloud-Evolved/watchers"><img src="https://img.shields.io/github/watchers/uarix/ucloud-Evolved?style=flat-square" alt="Watchers"></a>
  <a href="https://github.com/uarix/ucloud-Evolved/issues?q=is%3Aissue+is%3Aclosed"><img src="https://img.shields.io/github/issues-closed/uarix/ucloud-Evolved?style=flat-square" alt="Closed Issues"></a>
  <br>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/版本-0.30-blue" alt="版本">
</p>

**ucloud-Evolved** 是一款专为 Tampermonkey 插件打造的云邮教学空间优化脚本，专门为北京邮电大学云邮教学空间设计，能够优化学习体验、提高效率，让教学平台使用更加便捷。

<p align="left">  
  <a href="https://github.com/uarix/ucloud-Evolved/raw/refs/heads/main/ucloud-Evolved.user.js" target="_blank">  
    <img src="https://img.shields.io/badge/-%E7%82%B9%E5%87%BB%E5%AE%89%E8%A3%85%20ucloud--Evolved-brightgreen?style=for-the-badge&logo=tampermonkey" alt="点击安装 ucloud-Evolved" />  
  </a>  
</p>

## ✨ 主要功能  

### 1. 个人主页优化  
- 加大翻页按钮尺寸  
- 显示作业来源  
- 课程便捷跳转  

### 2. 课件预览增强  
- 预览时自动下载  
- 支持多种文件预览方式  
  - Office 文件使用 Office365 预览  
  - PDF 文件使用浏览器原生阅读器  
  - 图片文件使用内置阅读器  
- 自动关闭弹窗  
- 隐藏预览界面倒计时  

### 3. 课程管理优化  
- 增加批量下载按钮  
- 显示所有下载选项  

### 4. 作业管理助手  
- 显示作业所属课程  

### 5. 通知管理优化  
- 显示更多历史通知（从默认值修改为 1000 条）
- 通知按时间排序  
- 增强未读通知高亮  

### 6. 系统功能增强  
- 修复 ticket 跳转问题  
- 优化页面标题  
- 解除复制限制  
- 内置自动更新检查  
- 可配置悬浮窗按钮  
- 更多的课程扩大课程列表单页数量（从默认值修改为 15 条）
- ~~更多的 DDL ：没有这回事~~


## 💻 兼容性

- **浏览器**：支持安装了 Tampermonkey / Violentmonkey / Greasemonkey 的现代浏览器
- **平台**：仅适用于北京邮电大学云邮教学空间 (https://ucloud.bupt.edu.cn/)

## 📥 安装方法

1. 安装浏览器扩展：[Tampermonkey](https://www.tampermonkey.net/)（或其他用户脚本管理器）
2. 安装本脚本（以下任选一种方式）：
   - [通过 Github 安装 ](https://github.com/uarix/ucloud-Evolved/raw/refs/heads/main/ucloud-Evolved.user.js)
   - [通过 GreasyFork 安装](https://greasyfork.org/zh-CN/scripts/532489-ucloud-evolved)
   - 复制源代码到脚本管理器中创建新脚本
3. 访问云邮教学空间，自动启用增强功能

## 🔧 使用说明

1. **设置面板访问**：访问云邮教学空间后，点击页面右下角的⚙️图标打开设置面板
2. **自定义配置**：
   - 预览课件时自动下载：开启后预览文件时将自动下载
   - 使用Office 365预览课件：开启后使用Microsoft在线服务预览Office文档
3. **下载功能**：
   - 批量下载：在课程资源页面点击"下载全部"按钮

## 🔄 更新日志

### 当前版本：0.30

- 更好的悬浮窗菜单结构
- 更多的配置项
- 新功能：替换默认图片预览器
- UI：现可通过右上角个人菜单找到插件设置

### 0.28

- 修复翻页按钮不居中
- 修复菜单内指针样式

### 0.27

- 新功能：通知按照时间排序
- 新功能：优化未读通知高亮
- 优化悬浮窗UI

<img src="./img/image1.jpg" alt="主界面" width="40%"> 

### 0.26

- 修复：课程页面footer遮蔽课程卡片问题

### 0.25

- 新功能：更好的页面标题

### 0.24

- 修复自动更新设置

### 0.23

- 新功能：使用浏览器内置的 PDF 预览组件替换云平台 PDF 预览器

## 👥 致谢

Youxam [云邮教学空间助手](https://greasyfork.org/zh-CN/scripts/478125-%E4%BA%91%E9%82%AE%E6%95%99%E5%AD%A6%E7%A9%BA%E9%97%B4%E5%8A%A9%E6%89%8B)

## ⚖️ 许可证

本项目基于 [MIT许可证](https://opensource.org/licenses/MIT) 开源

## 📧 反馈与支持

如发现问题或有功能建议，请通过 [GitHub issues](https://github.com/uarix/ucloud-Evolved/issues) 提交反馈

[![Star History Chart](https://api.star-history.com/svg?repos=uarix/ucloud-Evolved&type=Date)](https://www.star-history.com/#uarix/ucloud-Evolved&Date)

---

> [!NOTE]
>
> - 本脚本仅用于学习便利和个人使用，不得用于任何商业目的
> - 使用本脚本产生的任何问题由用户自行承担
> - 本脚本不会收集任何用户数据或个人信息
> - 本脚本与北京邮电大学无关。使用时请遵守学校相关规定和网络使用条例。
