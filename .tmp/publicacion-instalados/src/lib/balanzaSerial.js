/**
 * balanzaSerial — capa de transporte con la balanza por puerto serie (Web Serial API).
 *
 * Requisitos del entorno (importante para la PC del pañol):
 *   - Chrome o Edge de ESCRITORIO. No existe en Firefox, Safari ni mobile.
 *   - Página servida por HTTPS o localhost (Vercel cumple).
 *   - `conectar()` tiene que dispararse desde un gesto del usuario (click), es
 *     requisito de `navigator.serial.requestPort()`.
 *
 * Esta capa NO interpreta el protocolo de la balanza: sólo abre el puerto y
 * entrega los bytes crudos. El parseo vive aparte porque el formato de salida
 * de cada modelo Kretz cambia, y todavía hay que descubrirlo con el sniffer
 * (/balanza) antes de escribir el parser definitivo.
 */

export const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];

/**
 * Config EXACTA de la Kretz NOVEL / AURA (AUN EB30P), según el manual (ítem 15.5):
 *   9600 baudios · ASCII · 1 bit START · 8 bits DATOS sin paridad · 2 BITS DE STOP.
 * Ojo con los 2 stop bits: es lo que la diferencia de la config genérica.
 */
export const CONFIG_KRETZ = { baudRate: 9600, dataBits: 8, stopBits: 2, parity: "none", flowControl: "none" };
export const CONFIG_DEFAULT = CONFIG_KRETZ;

// Caracteres que piden una transmisión en los modos "A pedido" (manual, ítem 15.3.3).
export const PEDIDO_PESO = ["P", "p", "W", "w"];

export function serialSoportado() {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

export class BalanzaSerial {
  constructor() {
    this.port = null;
    this.reader = null;
    this.leyendo = false;
    // Varios componentes pueden escuchar la MISMA conexión (hay una sola balanza
    // física). Por eso son sets de suscriptores y no callbacks únicos: si fuera
    // un callback, la segunda pantalla que monta le pisaba el handler a la primera.
    this.subs = { chunk: new Set(), error: new Set(), close: new Set() };
    this._conectando = null; // promesa en vuelo, para no abrir dos veces a la vez
  }

  get conectado() {
    return Boolean(this.port);
  }

  /** Suscribe a un evento ("chunk" | "error" | "close"). Devuelve la función para desuscribir. */
  on(evento, fn) {
    const set = this.subs[evento];
    if (!set || typeof fn !== "function") return () => {};
    set.add(fn);
    return () => set.delete(fn);
  }

  _emit(evento, arg) {
    for (const fn of this.subs[evento]) {
      try { fn(arg); } catch { /* un suscriptor roto no debe cortar a los demás */ }
    }
  }

  /**
   * Abre el puerto. Si no se pasa `port`, lo pide al usuario (requiere gesto).
   *
   * Si ya hay una conexión en curso devuelve ESA promesa en vez de abrir otra:
   * sin esto, dos componentes montando a la vez (o StrictMode en dev) dejaban
   * el puerto tomado por una instancia y trabado para la otra.
   */
  async conectar(config = {}, port = null) {
    if (!serialSoportado()) {
      throw new Error("Este navegador no soporta Web Serial. Usá Chrome o Edge de escritorio.");
    }
    if (this.port) return this.port.getInfo?.() ?? {};
    if (this._conectando) return this._conectando;
    this._conectando = (async () => {
      const elegido = port ?? await navigator.serial.requestPort();
      try {
        await elegido.open({ ...CONFIG_DEFAULT, ...config });
      } catch (err) {
        // "The port is already open": típico si quedó abierto por un hot-reload
        // o una instancia previa. En vez de fallar (y obligar al replug), lo
        // cerramos y reabrimos para quedarnos con un estado limpio.
        if (!/already open/i.test(err?.message || "")) throw err;
        try { await elegido.close(); } catch { /* puede no dejarse cerrar */ }
        await elegido.open({ ...CONFIG_DEFAULT, ...config });
      }
      return this._trasAbrir(elegido);
    })();
    try {
      return await this._conectando;
    } finally {
      this._conectando = null;
    }
  }

  /**
   * Reconecta sin diálogo usando un puerto ya autorizado antes por el usuario.
   * Clave para la PC del pañol: se autoriza una vez y después entra solo.
   */
  async conectarRecordado(config = {}) {
    if (!serialSoportado()) return null;
    const puertos = await navigator.serial.getPorts();
    if (!puertos.length) return null;
    return this.conectar(config, puertos[0]);
  }

  _trasAbrir(port) {
    this.port = port;
    this.leyendo = true;
    this._loop();
    try { return port.getInfo?.() ?? {}; } catch { return {}; }
  }

  /** Loop de lectura. Se re-engancha si el stream se corta pero el puerto sigue vivo. */
  async _loop() {
    while (this.port?.readable && this.leyendo) {
      let reader = null;
      try {
        reader = this.port.readable.getReader();
        this.reader = reader;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value?.length) this._emit("chunk", value);
        }
      } catch (err) {
        if (this.leyendo) this._emit("error", err);
      } finally {
        try { reader?.releaseLock(); } catch { /* ya estaba liberado */ }
        this.reader = null;
      }
    }
    // Si salimos del loop sin que nadie haya pedido desconectar, el puerto se
    // murió solo (cable desenchufado, driver caído). Hay que soltarlo y avisar,
    // porque si no la UI sigue mostrando "conectado" y las lecturas dan timeout.
    if (this.leyendo) {
      this.leyendo = false;
      try { await this.port?.close(); } catch { /* ya estaba cerrado */ }
      this.port = null;
      this._emit("close");
    }
  }

  /** Manda un comando a la balanza (algunas sólo responden si se las interroga). */
  async enviar(data) {
    if (!this.port?.writable) throw new Error("La balanza no está conectada.");
    const writer = this.port.writable.getWriter();
    try {
      await writer.write(typeof data === "string" ? new TextEncoder().encode(data) : data);
    } finally {
      writer.releaseLock();
    }
  }

  /**
   * Fuerza las líneas de control DTR/RTS. Varios equipos con RS232 no transmiten
   * hasta ver DTR activo (algunos incluso se alimentan de esa línea).
   */
  async señales({ dataTerminalReady = true, requestToSend = true } = {}) {
    if (!this.port) throw new Error("La balanza no está conectada.");
    await this.port.setSignals({ dataTerminalReady, requestToSend });
  }

  async desconectar() {
    this.leyendo = false;
    try { await this.reader?.cancel(); } catch { /* puede estar ya cancelado */ }
    try { await this.port?.close(); } catch { /* puede estar ya cerrado */ }
    this.port = null;
    this.reader = null;
    this._emit("close");
  }
}

/* ── Conexión compartida ───────────────────────────────────────────────────── */

const CLAVE_GLOBAL = "__klaseaBalanza";

/**
 * Instancia ÚNICA de la balanza para toda la app.
 *
 * Hay una sola balanza física, así que tiene que haber una sola conexión.
 *
 * Se guarda en `window` a propósito, NO en una variable de módulo: con el
 * hot-reload de Vite el módulo se re-evalúa y una variable de módulo volvería a
 * cero, creando una instancia nueva mientras el puerto sigue abierto bajo la
 * instancia vieja (que ya nadie referencia). Ese era el caso que obligaba a
 * desenchufar y volver a enchufar el cable. `window` sobrevive al hot-reload,
 * así que la conexión sigue siendo la misma.
 */
export function balanzaCompartida() {
  if (typeof window === "undefined") return new BalanzaSerial();
  if (!window[CLAVE_GLOBAL]) {
    const inst = new BalanzaSerial();
    window[CLAVE_GLOBAL] = inst;
    // Al cerrar o recargar la pestaña hay que soltar el puerto explícitamente:
    // si no, Chrome puede dejarlo tomado y la siguiente carga no lo puede abrir.
    window.addEventListener("beforeunload", () => { inst.desconectar?.(); });
  }
  return window[CLAVE_GLOBAL];
}

// Si HMR llega a descartar este módulo, suelto el puerto antes de que se pierda
// la referencia. Sin esto queda un puerto abierto sin dueño hasta el replug.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (typeof window !== "undefined" && window[CLAVE_GLOBAL]) {
      window[CLAVE_GLOBAL].desconectar?.();
      delete window[CLAVE_GLOBAL];
    }
  });
}

/* ── Utilidades de inspección (las usa el sniffer) ─────────────────────────── */

export function aHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

const CTRL = { 2: "<STX>", 3: "<ETX>", 5: "<ENQ>", 6: "<ACK>", 10: "<LF>", 13: "<CR>", 21: "<NAK>", 27: "<ESC>" };

export function aAscii(bytes) {
  return Array.from(bytes)
    .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : CTRL[b] || `<${b.toString(16).padStart(2, "0")}>`))
    .join("");
}

/**
 * Intenta extraer un peso de una línea de texto de la balanza. Best-effort:
 * cubre los formatos más comunes ("ST,GS,+  1.234kg", "+00123.4 g", "  12.34 ").
 * Sirve para confirmar en el sniffer que estamos leyendo bien; el parser final
 * se escribe cuando sepamos el formato exacto de esta Kretz.
 */
export function parsearPeso(linea) {
  const txt = String(linea ?? "").replace(/\0/g, " ").trim();
  if (!txt) return null;
  const m = txt.match(/([+-]?\s*\d+(?:[.,]\d+)?)\s*(kg|g|lb|oz)?/i);
  if (!m) return null;
  const valor = Number(m[1].replace(/\s+/g, "").replace(",", "."));
  if (!Number.isFinite(valor)) return null;
  const unidad = (m[2] || "").toLowerCase();
  const gramos = unidad === "kg" ? valor * 1000
    : unidad === "lb" ? valor * 453.592
      : unidad === "oz" ? valor * 28.3495
        : valor; // sin unidad asumimos gramos hasta confirmar el protocolo
  const estable = /\b(ST|STABLE)\b/i.test(txt) ? true : /\b(US|UNSTABLE)\b/i.test(txt) ? false : null;
  return { valor, unidad: unidad || "?", gramos, estable, crudo: txt };
}

const STX = String.fromCharCode(2);

/**
 * Parser del protocolo Kretz NOVEL / AURA (AUN EB30P) — manual, ítem 15.4.
 *
 * Trama de PESO:                STX(0x02) + "XX.XXX" (kg) + CR(0x0D)
 * Trama de PESO-PRECIO-IMPORTE: STX + "XX.XXX" + CR + "XXXX.XX" + CR + "XXXXX.XX" + CR
 *
 * En modo continuo la balanza emite 2 veces por segundo, sólo cuando el peso
 * neto está estable — así que toda trama recibida ya viene estabilizada.
 *
 * Devuelve [tramas, resto] para poder ir consumiendo un buffer que crece.
 */
export function extraerTramasKretz(buffer) {
  const tramas = [];
  let resto = buffer;
  for (;;) {
    const ini = resto.indexOf(STX);
    if (ini === -1) break;
    const fin = resto.indexOf("\r", ini + 1);
    if (fin === -1) break; // trama incompleta: esperamos más bytes
    const cuerpo = resto.slice(ini + 1, fin).trim();
    const kg = Number(cuerpo.replace(",", "."));
    if (Number.isFinite(kg)) {
      tramas.push({ kg, gramos: Math.round(kg * 1000), crudo: cuerpo });
    }
    resto = resto.slice(fin + 1);
  }
  // Si quedó basura sin STX, no la arrastro para siempre.
  const ultimoStx = resto.lastIndexOf(STX);
  if (ultimoStx === -1 && resto.length > 256) resto = "";
  return [tramas, resto];
}

const ETX = String.fromCharCode(3);

/** Corta un buffer acumulado en líneas por CR/LF/ETX. Devuelve [lineas, resto]. */
export function partirLineas(buffer) {
  // El ETX se normaliza a salto antes de cortar (no se puede meter en el regex: es carácter de control).
  const partes = buffer.split(ETX).join("\n").split(/\r\n|\r|\n/);
  const resto = partes.pop() ?? "";
  return [partes.map((p) => p.trim()).filter(Boolean), resto];
}
