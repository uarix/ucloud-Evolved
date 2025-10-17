import { registerNotificationInterceptors } from "./interceptors/notifications";
import { CONSTANTS } from "./constants";
import { UCloudEnhancer } from "./app/ucloud-enhancer";

registerNotificationInterceptors();

function bootstrap(): void {
  if (!location.href.startsWith("https://ucloud.bupt.edu.cn/")) {
    return;
  }

  const ticket = new URLSearchParams(location.search).get("ticket");
  if (ticket && ticket.length) {
    window.setTimeout(() => {
      location.href = CONSTANTS.URLS.home;
    }, 500);
    return;
  }

  const start = (): void => {
    new UCloudEnhancer().init();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}

bootstrap();
