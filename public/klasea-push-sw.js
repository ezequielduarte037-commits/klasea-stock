// Recibe avisos. No intercepta ni cachea páginas, pedidos ni assets de la app.
const USER_DB = "klasea-push-session";
function sessionDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(USER_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("session");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function storedUser(value, write = false) {
  const db = await sessionDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("session", write ? "readwrite" : "readonly");
      const store = transaction.objectStore("session");
      const request = write ? store.put(value, "user") : store.get("user");
      let result;
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(write ? value : result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
function localUrl(value) {
  try {
    const url = new URL(value || "/", self.location.origin);
    return url.origin === self.location.origin && ["https:", "http:"].includes(url.protocol) ? url.href : self.location.origin + "/";
  } catch { return self.location.origin + "/"; }
}
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "PUSH_USER") return;
  const port = event.ports && event.ports[0];
  event.waitUntil(storedUser(event.data.userId || null, true)
    .then(() => { if (port) port.postMessage({ ok: true }); })
    .catch(() => { if (port) port.postMessage({ ok: false }); }));
});
self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let data = {};
    try { data = event.data ? event.data.json() || {} : {}; } catch { /* El fallback también se muestra. */ }
    const current = await storedUser().catch(() => null);
    // Una salida pendiente de la cuenta anterior no expone su información.
    if (!current || data.userId !== current) {
      // Safari exige que todo push produzca un aviso visible. Nunca se revela
      // contenido de otra cuenta, incluso si llega una salida vieja al cerrar sesión.
      await self.registration.showNotification("Klase A", {
        body: "Abrí la app para consultar tus avisos.", icon: "/icons/icon-192.png", tag: "klasea-session",
        data: { url: self.location.origin + "/", userId: null },
      });
      return;
    }
    const target = new URL(localUrl(data.url));
    if (typeof data.clave === "string" && typeof data.fecha === "string") {
      target.searchParams.set("_push_clave", data.clave);
      target.searchParams.set("_push_fecha", data.fecha);
      target.searchParams.set("_push_user", current);
    }
    await self.registration.showNotification(String(data.title || "Klase A").slice(0, 160), {
      body: String(data.body || "Tenés una novedad en Klase A.").slice(0, 500),
      icon: "/icons/icon-192.png", badge: "/icons/icon-192.png",
      tag: String(data.tag || data.notificationId || "klasea-novedad"),
      data: { url: target.href, userId: current },
    });
  })());
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const current = await storedUser().catch(() => null);
    const details = event.notification.data || {};
    const belongs = current && details.userId === current;
    const url = belongs ? localUrl(details.url) : self.location.origin + "/";
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      // Primero al frente: después de esperar la navegación, Android puede
      // negar el foco y terminar abriendo una segunda ventana.
      try { const focused = await existing.focus(); await (focused || existing).navigate(url); return; }
      catch { /* La ventana pudo cerrarse mientras se abría el aviso. */ }
    }
    await self.clients.openWindow(url);
  })());
});
