const DAY_MS = 86_400_000;

function normalizeSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR");
}

/** Cada palabra puede coincidir en título, detalle o actor, sin exigir tildes. */
export function filterNotifications(items, { search = "", type = "todos", state = "todos" } = {}, needsAttention = () => false) {
  const words = normalizeSearch(search).trim().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (type !== "todos" && item.tipo !== type) return false;
    if (state === "sin-leer" && item.leida) return false;
    if (state === "atencion" && (item.leida || !needsAttention(item))) return false;
    const haystack = normalizeSearch([item.titulo, item.detalle, item.actor].filter(Boolean).join(" "));
    return words.every((word) => haystack.includes(word));
  });
}

function dayKey(date, timeZone) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function notificationDateBucket(value, now = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const date = new Date(value || "");
  if (!Number.isFinite(date.getTime())) return { key: "sin-fecha", label: "Fecha no disponible" };
  const key = dayKey(date, timeZone);
  const today = dayKey(now, timeZone);
  const days = Math.round((Date.parse(`${key}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
  const label = days === 0 ? "Hoy" : days === -1 ? "Ayer" : days === 1 ? "Mañana"
    : new Intl.DateTimeFormat("es-AR", { timeZone, day: "numeric", month: "long", ...(key.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}) }).format(date);
  return { key, label };
}

/** Atención primero; dentro de cada sección, fechas descendentes y sin mutar la fuente. */
export function groupNotifications(items, needsAttention, now = new Date(), timeZone) {
  const sections = [
    { key: "atencion", label: "Necesitan atención", items: [] },
    { key: "novedades", label: "Novedades para vos", items: [] },
    { key: "leidas", label: "Ya leídas", items: [] },
  ];
  for (const item of items) {
    const section = item.leida ? sections[2] : needsAttention(item) ? sections[0] : sections[1];
    section.items.push(item);
  }
  return sections.filter((section) => section.items.length).map((section) => {
    const dates = new Map();
    const sorted = [...section.items].sort((a, b) => (Date.parse(b.fecha) || 0) - (Date.parse(a.fecha) || 0));
    for (const item of sorted) {
      const bucket = notificationDateBucket(item.fecha, now, timeZone);
      if (!dates.has(bucket.key)) dates.set(bucket.key, { ...bucket, items: [] });
      dates.get(bucket.key).items.push(item);
    }
    return { ...section, dates: [...dates.values()] };
  });
}
