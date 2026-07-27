// 非诚勿扰式全场互动协议 helper。
// 本文件不操作 DOM，可被任意 UI 层直接 import，也方便独立测试。

export const MESSAGE_REACTIONS = Object.freeze(["😂", "🔥", "🍺", "💔", "👏", "🤯", "❤️", "👀"]);
export const QUICK_REACTIONS = Object.freeze([
  "🍺", "😂", "💔", "🔥", "👏", "🤯", "❤️", "👀",
  "😍", "🥹", "😭", "😅", "😏", "🙄", "🤡", "💀",
  "🫠", "🫣", "🤨", "🥳", "🫡", "😈", "🤝", "👍",
  "👎", "✨", "💅", "🍿", "🚨", "💯", "🥂", "🧊",
]);
export const SOCIAL_LIMITS = Object.freeze({
  chat: 120,
  danmaku: 30,
});

function cleanText(value, maxLength) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();
  return Array.from(text).slice(0, maxLength).join("").trim();
}

export function chatPayload(text) {
  const value = cleanText(text, SOCIAL_LIMITS.chat);
  return value ? { type: "chat", text: value } : null;
}

export function danmakuPayload(text) {
  const value = cleanText(text, SOCIAL_LIMITS.danmaku);
  return value ? { type: "danmaku", text: value } : null;
}

export function messageReactionPayload(msgId, emoji) {
  const id = Number(msgId);
  if (!Number.isInteger(id) || id < 1 || !MESSAGE_REACTIONS.includes(emoji)) return null;
  return { type: "react", msgId: id, emoji };
}

export function quickReactionPayload(emoji) {
  return QUICK_REACTIONS.includes(emoji) ? { type: "quick_reaction", emoji } : null;
}

export function lightVotePayload(vote) {
  if (vote !== "burst" && vote !== "off") return null;
  return { type: "light", vote, on: vote === "burst" };
}

export function normalizeReactionMap(reactions) {
  const normalized = {};
  for (const emoji of MESSAGE_REACTIONS) {
    const value = reactions?.[emoji];
    if (Array.isArray(value)) {
      // 兼容早期服务端的数组格式。
      if (value.length) normalized[emoji] = { count: value.length, mine: false };
      continue;
    }
    const count = Math.max(0, Math.floor(Number(value?.count) || 0));
    if (count) normalized[emoji] = { count, mine: !!value.mine };
  }
  return normalized;
}

export function normalizeChat(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map((message) => ({
    id: Number(message.id),
    name: String(message.name || ""),
    emoji: String(message.emoji || ""),
    text: String(message.text || ""),
    ts: Number(message.ts) || 0,
    reactions: normalizeReactionMap(message.reactions),
  }));
}

export function socialModel(state) {
  const light = state?.aha?.light || null;
  return {
    chat: normalizeChat(state?.chat),
    recent: Array.isArray(state?.social?.recent) ? state.social.recent : [],
    messageReactions: state?.social?.messageReactions || MESSAGE_REACTIONS,
    quickReactions: state?.social?.quickReactions || QUICK_REACTIONS,
    light: light
      ? {
          burst: Number(light.burst) || 0,
          off: Number(light.off) || 0,
          voted: Number(light.voted) || 0,
          total: Number(light.total) || 0,
          mine: light.mine ?? light.yours ?? null,
          canVote: !!light.canVote,
          burstNames: Array.isArray(light.burstNames) ? light.burstNames : [],
          offNames: Array.isArray(light.offNames) ? light.offNames : [],
        }
      : null,
  };
}

export function isRateLimitError(message) {
  return message?.type === "error" && message.code === "rate_limited";
}
