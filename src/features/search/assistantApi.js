import { supabase } from "@/supabaseClient";

const MAX_CONTEXT_ITEMS = 24;
const MAX_HISTORY_ITEMS = 6;

function text(value, maxLength = 220) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function buildContext(groups = []) {
  return groups
    .filter((group) => group?.key !== "personas")
    .flatMap((group) => (group?.items || []).map((item) => ({
      section: text(group.key, 40),
      title: text(item?.title),
      detail: text(item?.subtitle),
      meta: text(item?.meta, 140),
      status: text(item?.status, 60),
      path: text(item?.path, 300),
    })))
    .slice(0, MAX_CONTEXT_ITEMS);
}

function buildHistory(messages = []) {
  return messages
    .filter((message) => ["user", "assistant"].includes(message?.role) && message?.content)
    .slice(-MAX_HISTORY_ITEMS)
    .map((message) => ({
      role: message.role,
      content: text(message.content, 900),
    }));
}

export async function askKlaseaAssistant({ question, groups = [], messages = [] }) {
  const payload = {
    question: text(question, 600),
    context: buildContext(groups),
    history: buildHistory(messages),
  };

  const { data, error } = await supabase.functions.invoke("asistente-klasea", {
    body: payload,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  if (!data?.answer) throw new Error("El asistente no devolvió una respuesta.");
  return data;
}

