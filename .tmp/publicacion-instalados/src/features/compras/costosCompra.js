export const importeCompraValido = (value) => value !== "" && value != null && Number.isFinite(Number(value)) && Number(value) >= 0.01;
