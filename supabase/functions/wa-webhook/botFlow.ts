export type DraftReplyKind = "confirm" | "reject" | "other";

function normalizeBotText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[¡!¿?.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyDraftReply(value: string): DraftReplyKind {
  const text = normalizeBotText(value);
  if (!text) return "other";

  if (/^(no|nop|cancelar|cancela|descartar|descarta|borrar|borra)(\b|$)/.test(text)) {
    return "reject";
  }

  if (/^(si|sip|dale|confirmo|confirmamos|confirma|confirmalo|confirmar|ok|okey|yes|y|listo|crealo|crear|mandalo|envialo)(\b|$)/.test(text)) {
    return "confirm";
  }

  if (["👍", "✅"].includes(String(value || "").trim())) return "confirm";
  return "other";
}

export function isRetryCommand(value: string): boolean {
  const text = normalizeBotText(value);
  return /^(reintentar|reintenta|reintento|probar de nuevo|otra vez)$/.test(text);
}

export function assistantFailureMessage(
  status: number | null,
  code: string | null,
  hadImages = false,
): string {
  const retryHint = hadImages
    ? "Reenviá el mensaje y la foto cuando vuelva a estar disponible."
    : "Escribí *reintentar* y retomo el último mensaje sin que tengas que copiarlo de nuevo.";

  if (status === 429) {
    return `El asistente está recibiendo demasiadas consultas en este momento. *No se creó ningún pedido.*\n\n${retryHint}`;
  }

  if (status === 401 || status === 402 || status === 403 || code === "missing_api_key") {
    return `El asistente de pedidos está temporalmente fuera de servicio. *No se creó ningún pedido.*\n\n${retryHint}`;
  }

  if (status !== null && status >= 500) {
    return `El servicio de IA está temporalmente caído. *No se creó ningún pedido.*\n\n${retryHint}`;
  }

  return `No pude procesar el pedido por un problema temporal. *No se creó ningún pedido.*\n\n${retryHint}`;
}
