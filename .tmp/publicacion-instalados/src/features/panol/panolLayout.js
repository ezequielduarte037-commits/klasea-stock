export const PANOL_ROOM_W = 1965;
export const PANOL_ROOM_H = 950;

export const PANOL_REFERENCE_LAYOUT = {
  J3: { x_cm: 1828, y_cm: 38, w_cm: 90, h_cm: 292 },
  J2: { x_cm: 1828, y_cm: 330, w_cm: 90, h_cm: 292 },
  J1: { x_cm: 1828, y_cm: 622, w_cm: 90, h_cm: 292 },
  K1: { x_cm: 1334, y_cm: 38, w_cm: 494, h_cm: 44 },
  P1: { x_cm: 95, y_cm: 40, w_cm: 307, h_cm: 52 },
  A3: { x_cm: 22, y_cm: 40, w_cm: 73, h_cm: 289 },
  A2: { x_cm: 22, y_cm: 329, w_cm: 73, h_cm: 334 },
  A1: { x_cm: 22, y_cm: 663, w_cm: 73, h_cm: 252 },
  B2: { x_cm: 255, y_cm: 146, w_cm: 72, h_cm: 536 },
  B1: { x_cm: 184, y_cm: 146, w_cm: 72, h_cm: 476 },
  C4: { x_cm: 473, y_cm: 94, w_cm: 75, h_cm: 49 },
  C2: { x_cm: 473, y_cm: 146, w_cm: 75, h_cm: 536 },
  C1: { x_cm: 402, y_cm: 146, w_cm: 72, h_cm: 536 },
  C3: { x_cm: 473, y_cm: 683, w_cm: 75, h_cm: 56 },
  D4: { x_cm: 694, y_cm: 94, w_cm: 73, h_cm: 49 },
  D2: { x_cm: 694, y_cm: 146, w_cm: 73, h_cm: 536 },
  D1: { x_cm: 621, y_cm: 146, w_cm: 73, h_cm: 536 },
  D3: { x_cm: 694, y_cm: 683, w_cm: 73, h_cm: 56 },
  F2: { x_cm: 990, y_cm: 146, w_cm: 76, h_cm: 536 },
  F1: { x_cm: 841, y_cm: 146, w_cm: 78, h_cm: 536 },
  G1: { x_cm: 1141, y_cm: 146, w_cm: 154, h_cm: 340 },
  G3: { x_cm: 1219, y_cm: 486, w_cm: 76, h_cm: 100 },
  G5: { x_cm: 1219, y_cm: 585, w_cm: 76, h_cm: 96 },
  G2: { x_cm: 1141, y_cm: 486, w_cm: 78, h_cm: 100 },
  G4: { x_cm: 1141, y_cm: 585, w_cm: 78, h_cm: 96 },
  G6: { x_cm: 1141, y_cm: 683, w_cm: 154, h_cm: 56 },
  H2: { x_cm: 1450, y_cm: 146, w_cm: 78, h_cm: 159 },
  H4: { x_cm: 1450, y_cm: 305, w_cm: 78, h_cm: 116 },
  H6: { x_cm: 1450, y_cm: 422, w_cm: 78, h_cm: 127 },
  H8: { x_cm: 1450, y_cm: 549, w_cm: 78, h_cm: 133 },
  H1: { x_cm: 1370, y_cm: 146, w_cm: 79, h_cm: 159 },
  H3: { x_cm: 1370, y_cm: 305, w_cm: 79, h_cm: 116 },
  H5: { x_cm: 1370, y_cm: 422, w_cm: 79, h_cm: 127 },
  H7: { x_cm: 1370, y_cm: 549, w_cm: 79, h_cm: 133 },
  H9: { x_cm: 1370, y_cm: 683, w_cm: 157, h_cm: 56 },
  I2: { x_cm: 1604, y_cm: 95, w_cm: 83, h_cm: 44 },
  I1: { x_cm: 1604, y_cm: 146, w_cm: 83, h_cm: 536 },
  E2: { x_cm: 1683, y_cm: 576, w_cm: 53, h_cm: 106 },
  E1: { x_cm: 1679, y_cm: 874, w_cm: 148, h_cm: 40 },
  V3: { x_cm: 645, y_cm: 768, w_cm: 123, h_cm: 44 },
  V2: { x_cm: 645, y_cm: 812, w_cm: 123, h_cm: 44 },
  V5: { x_cm: 520, y_cm: 768, w_cm: 125, h_cm: 44 },
  V4: { x_cm: 520, y_cm: 812, w_cm: 125, h_cm: 44 },
  V7: { x_cm: 402, y_cm: 768, w_cm: 118, h_cm: 44 },
  V6: { x_cm: 402, y_cm: 812, w_cm: 118, h_cm: 44 },
  V8: { x_cm: 333, y_cm: 775, w_cm: 61, h_cm: 78 },
  V1: { x_cm: 768, y_cm: 873, w_cm: 151, h_cm: 40 },
};

export function panolLayoutForCode(codigo) {
  return PANOL_REFERENCE_LAYOUT[String(codigo || "").trim().toUpperCase()] || null;
}

export function applyPanolReferenceLayout(rows = []) {
  return rows.map((row) => {
    const code = String(row.codigo || "").trim().toUpperCase();
    const layout = panolLayoutForCode(code);
    return layout ? { ...row, ...layout, codigo: code } : row;
  });
}
