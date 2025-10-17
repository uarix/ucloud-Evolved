# Project Overview

This project is a [Tampermonkey](https://www.tampermonkey.net/) UserScript that enhances the functionality of the `ucloud.bupt.edu.cn` website. It is written in a single JavaScript file, `ucloud-Evolved-Plus.js`.

The script provides a variety of quality-of-life improvements for students using the BUPT ucloud platform, including:

*   **Enhanced Homepage:** Displays the course for each assignment and shows all courses for the current semester.
*   **Improved Courseware Handling:** Enables previewing courseware with Office 365, automatic and batch downloading, and makes all download buttons visible.
*   **Better Notifications:** Increases the number of notifications displayed and sorts them chronologically.
*   **General UI/UX Fixes:** Removes annoying floating windows, lifts copy restrictions, and provides more descriptive page titles.

# Building and Running

This is a UserScript, so there is no build process. To use or develop this script:

1.  Install the [Tampermonkey](https://www.tampermonkey.net/) browser extension.
2.  Open the `ucloud-Evolved-Plus.js` file in a text editor.
3.  Copy the entire content of the file.
4.  Open the Tampermonkey dashboard in your browser, go to the "Utilities" tab, and paste the code into the editor.
5.  Save the script.
6.  Navigate to `https://ucloud.bupt.edu.cn/` to see the script in action.

# Development Conventions

*   The script is written in plain JavaScript.
*   It uses several `@grant` permissions to interact with the Tampermonkey API for features like `GM_addStyle`, `GM_setValue`, `GM_getValue`, etc.
*   The script uses modern JavaScript features like `async/await`, `class`, and `const/let`.
*   The code is organized into classes for managing different aspects of the script's functionality, such as `Utils`, `Storage`, `API`, `DownloadManager`, `NotificationManager`, and `CourseExtractor`.
*   There is a `SETTINGS_SECTIONS` constant that defines the configuration options for the script, which are then managed by the `Settings` class.
