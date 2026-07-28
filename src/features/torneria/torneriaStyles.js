import { C } from "@/theme";

export const INPUT = {
  width: "100%",
  minHeight: 42,
  boxSizing: "border-box",
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  background: C.panel,
  color: C.text,
  padding: "9px 11px",
  fontSize: 13,
  fontFamily: C.sans,
  outline: "none",
};

export const BUTTON = {
  minHeight: 40,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  borderRadius: 10,
  border: `1px solid ${C.border}`,
  background: C.panel,
  color: C.muted,
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 800,
  fontFamily: C.sans,
  cursor: "pointer",
};

export const PRIMARY_BUTTON = {
  ...BUTTON,
  borderColor: C.blueB,
  background: C.blueL,
  color: C.blue,
};

export const DANGER_BUTTON = {
  ...BUTTON,
  borderColor: C.redB,
  background: C.redL,
  color: C.red,
};

