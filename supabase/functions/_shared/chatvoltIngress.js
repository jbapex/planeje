/**
 * Leitura do JSON que o Chatvolt manda no webhook de saída do agente.
 * Sem telefone ou sem fala do lead, o evento só fica no log.
 */

const CHATVOLT_EVENTS = new Set([
  "USER_MESSAGE_RECEIVED",
  "AGENT_MESSAGE_SENDED",
  "AGENT_USER_MESSAGE",
  "AGENT_MESSAGE_FOLLOW_UP",
  "AGENT_MESSAGE_BLOCKED",
  "AGENT_MESSAGE_NOTED",
  "GROUP_MESSAGE_RECEIVED",
  "STEP_ENTERED",
  "NPS_INTERACTION",
]);

const LEAD_MESSAGE_EVENTS = new Set([
  "USER_MESSAGE_RECEIVED",
  "AGENT_USER_MESSAGE",
  "GROUP_MESSAGE_RECEIVED",
]);

const AGENT_EVENTS = new Set([
  "AGENT_MESSAGE_SENDED",
  "AGENT_MESSAGE_FOLLOW_UP",
  "AGENT_MESSAGE_BLOCKED",
  "AGENT_MESSAGE_NOTED",
]);

function labelsOf(body) {
  const tags = Array.isArray(body.tags) ? body.tags : [];
  return tags
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") return text(item.name || item.label);
      return "";
    })
    .filter(Boolean);
}

function text(value) {
  if (value == null) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim();
  return "";
}

export function isChatvoltPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  return CHATVOLT_EVENTS.has(text(body.eventType));
}

export function readChatvoltPayload(body) {
  if (!isChatvoltPayload(body)) return null;
  const event = text(body.eventType);
  const phone = text(body.userPhoneNumber).replace(/\D/g, "");
  const list = Array.isArray(body.ctwaAttributions) ? body.ctwaAttributions : [];
  const ad = list.find((item) => item && typeof item === "object" && !Array.isArray(item)) || null;
  const messageText = LEAD_MESSAGE_EVENTS.has(event) ? text(body.userMessage) : "";
  const fromMe = AGENT_EVENTS.has(event) || (event === "AGENT_USER_MESSAGE" && !messageText);
  return {
    event,
    phone,
    name: text(body.userName),
    messageText,
    fromMe,
    labels: labelsOf(body),
    messageId: text(body.messageId),
    createdAt: body.createdAt ?? null,
    channel: text(body.channel),
    isGroup: event === "GROUP_MESSAGE_RECEIVED",
    groupName: text(body.groupName),
    ctwaClid: ad ? text(ad.ctwaClid || ad.ctwa_clid) : "",
    sourceId: ad ? text(ad.sourceId || ad.source_id) : "",
    sourceType: ad ? text(ad.sourceType || ad.source_type) : "",
    sourceUrl: ad ? text(ad.sourceUrl || ad.source_url) : "",
    thumbnailUrl: ad ? text(ad.thumbnailUrl || ad.imageUrl || ad.thumbnail_url) : "",
  };
}
