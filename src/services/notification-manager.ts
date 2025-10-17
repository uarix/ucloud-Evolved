import { Utils } from "../utils";

type NotificationType = "success" | "error" | "info" | "warn" | "warning";
type NotificationVariant = "success" | "error" | "info" | "warn";

export class NotificationManager {
  static show(title: string, message: string, type: NotificationType = "success"): void {
    const root = document.body;
    if (!root) return;

    const normalized = typeof type === "string" ? type.toLowerCase() : "success";
    const variant: NotificationVariant =
      normalized === "error"
        ? "error"
        : normalized === "info"
        ? "info"
        : normalized === "warn" || normalized === "warning"
        ? "warn"
        : "success";

    const notification = document.createElement("div");
    notification.className = `uep-notification uep-notification--${variant}`;
    notification.innerHTML = `
      <div class="uep-notification__title">${Utils.escapeHtml(title)}</div>
      <div class="uep-notification__message">${Utils.escapeHtml(message)}</div>
    `;

    root.appendChild(notification);

    requestAnimationFrame(() => {
      notification.classList.add("is-visible");
    });

    window.setTimeout(() => {
      notification.classList.remove("is-visible");
      window.setTimeout(() => {
        notification.remove();
      }, 300);
    }, 3000);
  }
}
