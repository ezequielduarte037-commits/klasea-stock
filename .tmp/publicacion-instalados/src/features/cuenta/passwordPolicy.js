export const PASSWORD_MIN_LENGTH = 10;

const WEAK_PASSWORDS = new Set([
  "1234567890",
  "123456789",
  "contraseña",
  "contrasena",
  "password",
  "password123",
  "klasea123",
  "astillero123",
]);

export function validatePasswordPolicy(password, { username = "" } = {}) {
  const value = String(password || "");
  const normalized = value.toLowerCase();
  const user = String(username || "").trim().toLowerCase();
  const issues = [];

  if (value.length < PASSWORD_MIN_LENGTH) {
    issues.push(`Mínimo ${PASSWORD_MIN_LENGTH} caracteres.`);
  }
  if (!/[a-záéíóúñ]/.test(normalized)) {
    issues.push("Debe incluir una minúscula.");
  }
  if (!/[A-ZÁÉÍÓÚÑ]/.test(value)) {
    issues.push("Debe incluir una mayúscula.");
  }
  if (!/\d/.test(value)) {
    issues.push("Debe incluir un número.");
  }
  if (user && normalized.includes(user.replace(/\s+/g, ""))) {
    issues.push("No puede contener el usuario.");
  }
  if (WEAK_PASSWORDS.has(normalized)) {
    issues.push("Es demasiado fácil de adivinar.");
  }

  return issues;
}

export function isPasswordValid(password, opts) {
  return validatePasswordPolicy(password, opts).length === 0;
}
