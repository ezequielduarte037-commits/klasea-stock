import { useEffect, useRef } from "react";

export function normalizeScanCode(value) {
  return String(value ?? "").trim();
}

function isEditableTarget(target) {
  if (!target) return false;
  const tag = String(target.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

export default function useKeyboardWedge({
  enabled = true,
  onScan,
  minLength = 3,
  timeoutMs = 90,
  ignoreEditable = true,
} = {}) {
  const onScanRef = useRef(onScan);
  const bufferRef = useRef("");
  const lastKeyAtRef = useRef(0);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return undefined;

    function onKeyDown(event) {
      if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
      if (ignoreEditable && isEditableTarget(event.target)) return;

      const key = event.key;
      if (key === "Escape") {
        bufferRef.current = "";
        return;
      }

      if (key === "Enter" || key === "Tab") {
        const code = normalizeScanCode(bufferRef.current);
        bufferRef.current = "";
        if (code.length >= minLength) {
          event.preventDefault();
          onScanRef.current?.(code);
        }
        return;
      }

      if (key.length !== 1) return;

      const now = Date.now();
      if (now - lastKeyAtRef.current > timeoutMs) bufferRef.current = "";
      lastKeyAtRef.current = now;
      bufferRef.current = `${bufferRef.current}${key}`.slice(-128);
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, ignoreEditable, minLength, timeoutMs]);
}
