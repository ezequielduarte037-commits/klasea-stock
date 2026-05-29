import { useEffect, useRef, useState } from "react";
import { Phone, Copy, Check, X, RefreshCw, Unlink } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";

// Modal para vincular el WhatsApp del usuario actual con su cuenta del sistema.
// Genera un código de 6 dígitos vía RPC `generate_phone_verification_code`,
// lo muestra al usuario para que lo mande al bot, y hace polling cada 4s
// hasta detectar que verified_at quedó seteado.

export default function VincularWhatsAppModal({ open, onClose, profile }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [linked, setLinked] = useState(null); // { phone, verified_at } | null
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("user_phones")
        .select("phone, verified_at, pending_code, pending_code_expires_at")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (cancelled) return;
      if (data?.verified_at && data?.phone) {
        setLinked({ phone: data.phone, verified_at: data.verified_at });
      } else if (data?.pending_code && data?.pending_code_expires_at) {
        // Hay un código pendiente todavía válido — lo reusamos
        const exp = new Date(data.pending_code_expires_at).getTime();
        if (exp > Date.now()) {
          setCode(data.pending_code);
          setExpiresAt(exp);
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, profile?.id]);

  // Ticker de countdown
  useEffect(() => {
    if (!expiresAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  // Polling para detectar cuándo se confirma
  useEffect(() => {
    if (!open || linked || !code) return undefined;
    pollRef.current = setInterval(async () => {
      const { data } = await supabase
        .from("user_phones")
        .select("phone, verified_at")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (data?.verified_at && data?.phone) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setLinked({ phone: data.phone, verified_at: data.verified_at });
        setCode("");
        setExpiresAt(null);
        toast.success("WhatsApp vinculado correctamente.");
      }
    }, 4000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [open, linked, code, profile?.id, toast]);

  async function generarCodigo() {
    setGenerating(true);
    try {
      const { data, error } = await supabase.rpc("generate_phone_verification_code");
      if (error) throw error;
      setCode(data);
      setExpiresAt(Date.now() + 10 * 60 * 1000); // 10 min
    } catch (err) {
      toast.error(err.message || "No se pudo generar el código.");
    } finally {
      setGenerating(false);
    }
  }

  async function desvincular() {
    const ok = await confirm({
      title: "Desvincular WhatsApp",
      message: "Vas a dejar de poder pedir desde tu WhatsApp. Podés volver a vincular después.",
      confirmLabel: "Desvincular",
      tone: "danger",
    });
    if (!ok) return;
    const { error } = await supabase.rpc("unlink_phone");
    if (error) {
      toast.error(error.message);
      return;
    }
    setLinked(null);
    setCode("");
    setExpiresAt(null);
    toast.success("WhatsApp desvinculado.");
  }

  function copiar() {
    const msg = `vincular ${code}`;
    navigator.clipboard?.writeText(msg).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (!open) return null;

  const remaining = expiresAt ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : 0;
  const mm = String(Math.floor(remaining / 60)).padStart(1, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "var(--overlay-strong)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "grid", placeItems: "center", padding: 20,
        fontFamily: C.sans,
      }}
    >
      <div style={{
        width: "min(440px, 100%)",
        background: C.panelSolid,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        boxShadow: "0 30px 80px var(--shadow-strong)",
        padding: "20px 22px 18px",
        color: C.text,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            display: "grid", placeItems: "center",
            background: "var(--green-soft)", color: C.green,
            flexShrink: 0,
          }}>
            <Phone size={16} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Vincular WhatsApp</div>
            <div style={{ fontSize: 12, color: C.dim }}>
              Pedidos a compras desde tu celular
            </div>
          </div>
          <button type="button" onClick={onClose} style={{
            border: "none", background: "transparent", color: C.dim, cursor: "pointer", padding: 4,
          }}>
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: C.dim, fontSize: 13 }}>
            Cargando…
          </div>
        ) : linked ? (
          // ── YA VINCULADO ───────────────────────────────────────────────
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{
              padding: 13,
              border: `1px solid var(--green-border)`,
              background: "var(--green-soft)",
              borderRadius: 9,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <Check size={16} color={C.green} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, color: C.dim, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>
                  Vinculado
                </div>
                <div style={{ fontSize: 14, fontFamily: C.mono, fontWeight: 700, color: C.text }}>
                  +{linked.phone}
                </div>
              </div>
            </div>

            <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
              Mandale un mensaje al bot desde tu WhatsApp y va a crear el pedido en compras automáticamente. Si querés probar, escribí "hola".
            </div>

            <button
              type="button"
              onClick={desvincular}
              style={{
                border: `1px solid var(--red-border)`,
                background: "var(--red-soft)",
                color: C.red,
                borderRadius: 8,
                padding: "9px 14px",
                cursor: "pointer",
                fontSize: 12.5,
                fontWeight: 700,
                display: "inline-flex", alignItems: "center", gap: 6,
                justifySelf: "start",
              }}
            >
              <Unlink size={13} />
              Desvincular
            </button>
          </div>
        ) : code && remaining > 0 ? (
          // ── ESPERANDO QUE EL USUARIO MANDE EL CÓDIGO AL BOT ─────────────
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
              Desde tu WhatsApp, mandale al bot este mensaje:
            </div>

            <div
              onClick={copiar}
              style={{
                cursor: "pointer",
                padding: "16px 14px",
                border: `1px solid ${C.border2}`,
                background: C.panel2,
                borderRadius: 10,
                display: "flex", alignItems: "center", gap: 10,
              }}
            >
              <div style={{ flex: 1, fontFamily: C.mono, fontSize: 18, fontWeight: 800, letterSpacing: 1 }}>
                vincular <span style={{ color: C.blue }}>{code}</span>
              </div>
              <div style={{
                color: copied ? C.green : C.dim,
                fontSize: 11,
                display: "flex", alignItems: "center", gap: 4,
              }}>
                {copied ? <><Check size={13} /> copiado</> : <><Copy size={13} /> copiar</>}
              </div>
            </div>

            <div style={{
              fontSize: 11.5, color: C.dim,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <RefreshCw size={11} className="spin-slow" style={{ animation: "spin-slow 2s linear infinite" }} />
              Esperando confirmación… {mm}:{ss}
              <style>{`@keyframes spin-slow { to { transform: rotate(360deg); } }`}</style>
            </div>

            <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
              Una vez que el bot reciba tu mensaje, esta pantalla se actualiza sola. El código vence en 10 minutos.
            </div>

            <button
              type="button"
              onClick={generarCodigo}
              disabled={generating}
              style={{
                border: `1px solid ${C.border}`,
                background: "transparent",
                color: C.dim,
                borderRadius: 8,
                padding: "7px 12px",
                cursor: "pointer",
                fontSize: 11.5,
                fontWeight: 700,
                justifySelf: "start",
              }}
            >
              Generar otro código
            </button>
          </div>
        ) : (
          // ── ESTADO INICIAL: GENERAR CÓDIGO ──────────────────────────────
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5 }}>
              Vinculá tu número de WhatsApp para crear pedidos a compras directamente desde tu celular, sin entrar al sistema web.
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, color: C.muted, fontSize: 12.5, lineHeight: 1.7 }}>
              <li>Generá un código de 6 dígitos</li>
              <li>Mandale al bot el mensaje <code style={{ background: C.panel2, padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>vincular ABCDEF</code></li>
              <li>Listo: ya podés pedir por WhatsApp</li>
            </ol>
            <button
              type="button"
              onClick={generarCodigo}
              disabled={generating}
              style={{
                border: "none",
                background: C.blue,
                color: "#fff",
                borderRadius: 8,
                padding: "11px 14px",
                cursor: generating ? "default" : "pointer",
                fontSize: 13,
                fontWeight: 800,
                opacity: generating ? 0.6 : 1,
              }}
            >
              {generating ? "Generando…" : "Generar código"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
