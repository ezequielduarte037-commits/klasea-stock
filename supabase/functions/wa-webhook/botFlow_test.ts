import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { assistantFailureMessage, classifyDraftReply, isRetryCommand } from "./botFlow.ts";

Deno.test("reconoce confirmaciones naturales", () => {
  for (const text of ["sí", "confirmamos así", "confirmalo", "crealo", "mandalo", "✅"]) {
    assertEquals(classifyDraftReply(text), "confirm");
  }
});

Deno.test("distingue rechazo de una corrección", () => {
  assertEquals(classifyDraftReply("no, descartalo"), "reject");
  assertEquals(classifyDraftReply("cambiá la cantidad a 4"), "other");
});

Deno.test("reconoce el reintento explícito", () => {
  assertEquals(isRetryCommand("Reintentar"), true);
  assertEquals(isRetryCommand("otra vez"), true);
  assertEquals(isRetryCommand("necesito otra cosa"), false);
});

Deno.test("el error aclara que no creó el pedido", () => {
  const message = assistantFailureMessage(429, "rate_limit_exceeded");
  assertEquals(message.includes("No se creó ningún pedido"), true);
  assertEquals(message.includes("reintentar"), true);
});
