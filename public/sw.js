/* Proggaa service worker: Web Push only (no offline caching).
 *
 * The server sends { title, body, url, tag } (see src/lib/push/delivery-rules.ts
 * buildPushPayload): nothing but what is shown on screen and a same-site path.
 * Clicking opens that path; a signed-out visitor is sent through /login first
 * by the site's own middleware. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Proggaa";
  const url = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//") ? data.url : "/notifications";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === "string" ? data.body : "",
      icon: "/branding/proggaa-logo-512.png",
      badge: "/branding/proggaa-logo-512.png",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || "/notifications";
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          return client.navigate(target).then((c) => (c || client).focus());
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
