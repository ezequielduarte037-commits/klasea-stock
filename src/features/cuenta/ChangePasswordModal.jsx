import { useState } from "react";
import { KeyRound, LogOut, X } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";
import { useToast } from "@/components/ui/Toast";
import { validatePasswordPolicy } from "@/features/cuenta/passwordPolicy";

export default function ChangePasswordModal({
  open,
  onClose,
  profile,
  forced = false,
  onChanged,
  onSignOut,
}) {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const issues = validatePasswordPolicy(password, { username: profile?.username });
  if (password && repeat && password !== repeat) issues.push("Las contraseñas no coinciden.");
  if (password && currentPassword && password === currentPassword) issues.push("La nueva contraseña debe ser distinta.");

  async function submit(e) {
    e.preventDefault();
    setError("");
    const nextIssues = validatePasswordPolicy(password, { username: profile?.username });
    if (!currentPassword) return setError("Ingresá tu contraseña actual.");
    if (!password || !repeat) return setError("Completá la nueva contraseña dos veces.");
    if (password !== repeat) return setError("Las contraseñas no coinciden.");
    if (password === currentPassword) return setError("La nueva contraseña debe ser distinta.");
    if (nextIssues.length) return setError(nextIssues[0]);

    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const email = sessionData?.session?.user?.email;
      if (!email) throw new Error("No pude validar tu sesión.");

      const { error: reauthErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (reauthErr) throw new Error("La contraseña actual no es correcta.");

      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;

      const { error: flagErr } = await supabase.rpc("mark_password_changed");
      if (flagErr) throw flagErr;
      setCurrentPassword("");
      setPassword("");
      setRepeat("");
      toast.success("Contraseña actualizada.");
      onChanged?.();
      if (!forced) onClose?.();
    } catch (err) {
      setError(err.message || "No se pudo cambiar la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={(e) => { if (!forced && e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10020,
        background: "var(--overlay-strong)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "grid",
        placeItems: "center",
        padding: 20,
        fontFamily: C.sans,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "min(460px, 100%)",
          background: C.panelSolid,
          border: `1px solid ${forced ? C.amber : C.border2}`,
          borderRadius: 14,
          boxShadow: "0 30px 80px var(--shadow-strong)",
          padding: "20px 22px 18px",
          color: C.text,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            display: "grid",
            placeItems: "center",
            background: forced ? "var(--amber-soft)" : C.panel2,
            color: forced ? C.amber : C.blue,
            flexShrink: 0,
          }}>
            <KeyRound size={17} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800 }}>
              {forced ? "Cambiá tu contraseña" : "Cambiar contraseña"}
            </div>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
              {forced
                ? "Estás usando una contraseña temporal o reseteada por administración."
                : "Esto no desvincula tu WhatsApp ni afecta tus pedidos."}
            </div>
          </div>
          {!forced && (
            <button type="button" onClick={onClose} style={{
              border: "none",
              background: "transparent",
              color: C.dim,
              cursor: "pointer",
              padding: 4,
            }}>
              <X size={16} />
            </button>
          )}
        </div>

        {[
          ["Contraseña actual", currentPassword, setCurrentPassword, "current-password"],
          ["Nueva contraseña", password, setPassword, "new-password"],
          ["Repetir nueva contraseña", repeat, setRepeat, "new-password"],
        ].map(([label, value, setter, autoComplete]) => (
          <label key={label} style={{ display: "block", marginBottom: 12 }}>
            <span style={{
              display: "block",
              marginBottom: 6,
              color: C.dim,
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              fontWeight: 800,
            }}>
              {label}
            </span>
            <input
              type="password"
              autoComplete={autoComplete}
              value={value}
              onChange={(e) => { setter(e.target.value); setError(""); }}
              style={{
                width: "100%",
                boxSizing: "border-box",
                background: C.panel,
                border: `1px solid ${C.border}`,
                color: C.text,
                borderRadius: 9,
                padding: "11px 12px",
                fontSize: 14,
                outline: "none",
                fontFamily: C.sans,
              }}
            />
          </label>
        ))}

        <div style={{
          display: "grid",
          gap: 5,
          padding: "10px 12px",
          borderRadius: 9,
          border: `1px solid ${C.border}`,
          background: C.panel,
          marginBottom: 12,
        }}>
          {[
            "Mínimo 10 caracteres",
            "Mayúscula, minúscula y número",
            "No usar el nombre de usuario",
          ].map((txt) => (
            <div key={txt} style={{ fontSize: 12, color: C.dim, fontWeight: 600 }}>
              {txt}
            </div>
          ))}
        </div>

        {(error || (password && issues.length > 0)) && (
          <div style={{
            marginBottom: 12,
            padding: "9px 11px",
            borderRadius: 9,
            background: "var(--red-soft)",
            border: "1px solid var(--red-border)",
            color: C.red,
            fontSize: 13,
            fontWeight: 700,
          }}>
            {error || issues[0]}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="submit" disabled={busy} style={{
            border: "none",
            background: "var(--inverse-bg)",
            color: "var(--inverse-text)",
            borderRadius: 9,
            padding: "10px 15px",
            fontSize: 13,
            fontWeight: 800,
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}>
            {busy ? "Guardando..." : "Guardar contraseña"}
          </button>
          {forced && (
            <button type="button" onClick={onSignOut} style={{
              border: `1px solid ${C.border}`,
              background: "transparent",
              color: C.dim,
              borderRadius: 9,
              padding: "10px 12px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}>
              <LogOut size={14} /> Cerrar sesión
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
