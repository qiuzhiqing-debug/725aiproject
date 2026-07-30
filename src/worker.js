// 满分男酒桌局 — Cloudflare Worker + Durable Object
// Worker 路由 + RoomDO（房间状态机 + WebSocket 广播）

import { buildIdealProfile } from "../public/ideal-profile.js";

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // 用户档案（KV: USERS）
    if (url.pathname === "/api/user" && req.method === "POST") {
      return handleUserUpsert(req, env);
    }
    const um = url.pathname.match(/^\/api\/user\/([A-Za-z0-9-]{4,40})$/);
    if (um && req.method === "GET") {
      // ?token=xxx 且 token 正确 → 本人视角：返回含 hidden 记录的完整展示柜
      return handleUserGet(um[1], env, url.searchParams.get("token"));
    }
    const urm = url.pathname.match(/^\/api\/user\/([A-Za-z0-9-]{4,40})\/records$/);
    if (urm && req.method === "POST") {
      return handleUserRecord(req, urm[1], env);
    }
    // 展示柜记录可见性：POST /api/user/:id/records/:idx/visibility  body {token, hidden}
    const uvm = url.pathname.match(/^\/api\/user\/([A-Za-z0-9-]{4,40})\/records\/(\d{1,3})\/visibility$/);
    if (uvm && req.method === "POST") {
      return handleRecordVisibility(req, uvm[1], Number(uvm[2]), env);
    }

    // 展示柜点赞：POST /api/showcase/like { recordId }
    if (url.pathname === "/api/showcase/like" && req.method === "POST") {
      return handleShowcaseLike(req, env);
    }
    // 展示柜评论：POST /api/showcase/comment { recordId, text, name? }
    if (url.pathname === "/api/showcase/comment" && req.method === "POST") {
      return handleShowcaseComment(req, env);
    }

    // 酒保老K：LLM 锐评 / 画像文案
    if (url.pathname === "/api/bartender" && req.method === "POST") {
      return handleBartender(req, env);
    }

    // 用户注册（R2 契约）：昵称全局查重 + 4-6 位数字口令 + 性别/取向
    if (url.pathname === "/api/register" && req.method === "POST") {
      return handleRegister(req, env);
    }
    // 身份找回：昵称 + 口令 → userId/token
    if (url.pathname === "/api/recover" && req.method === "POST") {
      return handleRecover(req, env);
    }
    // 老K LLM 代理：永不 5xx，失败降级预写池
    if (url.pathname === "/api/laok" && req.method === "GET") {
      return handleLaok(url);
    }

    // 建房：POST /api/room  -> { code, deck }
    // body（可选）：{ visibility: "public"|"private"（默认 private）, solo: true（1 人可开局）,
    //               deck: "man"|"woman"|"agent"（卡组，默认 "man"） }
    if (url.pathname === "/api/room" && req.method === "POST") {
      let body = {};
      try { body = await readJson(req); } catch {}
      const visibility = body.visibility === "public" ? "public" : "private";
      const solo = body.solo === true;
      const deck = ROOM_DECK_IDS.includes(body.deck) ? body.deck : "man";
      for (let i = 0; i < 15; i++) {
        const code = String(Math.floor(1000 + Math.random() * 9000));
        const stub = env.ROOM.get(env.ROOM.idFromName(code));
        const res = await stub.fetch(
          `https://do/create?code=${code}&visibility=${visibility}&deck=${deck}${solo ? "&solo=1" : ""}`
        );
        if (res.ok) {
          return jsonRes({ code, deck });
        }
      }
      return jsonRes({ error: "房间码分配失败，请重试" }, 503);
    }

    // 桌子=固定房间：POST /api/table/:n/join -> { code, table }
    // 仲裁人 = ROOM namespace 里名为 table-N 的 DO 实例（单实例串行，天然防并发双开）
    // body（可选）：{ visibility }，桌子开的房默认 public
    const tm = url.pathname.match(/^\/api\/table\/([1-9])\/join$/);
    if (tm && req.method === "POST") {
      let body = {};
      try { body = await readJson(req); } catch {}
      const visibility = body.visibility === "private" ? "private" : "public";
      const deck = ROOM_DECK_IDS.includes(body.deck) ? body.deck : "man";
      const stub = env.ROOM.get(env.ROOM.idFromName("table-" + tm[1]));
      return stub.fetch(`https://do/table/join?table=${tm[1]}&visibility=${visibility}&deck=${deck}`);
    }

    // 桌子占用状态：GET /api/tables -> { tables: [{table, code, players, phase}] }
    if (url.pathname === "/api/tables" && req.method === "GET") {
      const tables = await Promise.all(
        [1, 2, 3, 4, 5, 6].map(async (n) => {
          try {
            const stub = env.ROOM.get(env.ROOM.idFromName("table-" + n));
            const res = await stub.fetch("https://do/table/info?table=" + n);
            return await res.json();
          } catch {
            return { table: n, code: null, players: 0, phase: null, deck: null, active: false };
          }
        })
      );
      return jsonRes({ tables });
    }

    // WebSocket：GET /api/room/:code/ws
    const m = url.pathname.match(/^\/api\/room\/(\d{4})\/ws$/);
    if (m) {
      const stub = env.ROOM.get(env.ROOM.idFromName(m[1]));
      return stub.fetch(req);
    }

    // 房间存在性检查：GET /api/room/:code
    const m2 = url.pathname.match(/^\/api\/room\/(\d{4})$/);
    if (m2) {
      const stub = env.ROOM.get(env.ROOM.idFromName(m2[1]));
      return stub.fetch("https://do/info");
    }

    const asset = await env.ASSETS.fetch(req);
    if (req.method !== "GET" || !asset.ok) return asset;
    const headers = new Headers(asset.headers);
    if (/\.(?:jpg|jpeg|png|webp|svg|woff2)$/i.test(url.pathname)) {
      headers.set("cache-control", "public, max-age=86400, stale-while-revalidate=604800");
    } else if (/\.(?:js|css)$/i.test(url.pathname)) {
      headers.set("cache-control", "public, max-age=0, must-revalidate");
    } else if ((headers.get("content-type") || "").includes("text/html")) {
      headers.set("cache-control", "public, max-age=0, must-revalidate");
    }
    return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
  },
};

function jsonRes(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function readJson(req, maxBytes = 32 * 1024) {
  const text = await req.text();
  if (text.length > maxBytes) throw new Error("payload too large");
  return JSON.parse(text || "{}");
}

/* ============ 用户档案（KV: USERS） ============ */
// value 结构：{ id, token, nick, cocktail, avatarSeed, createdAt, updatedAt, records: [{module, role, profile, ts}] }
// KV 单 value 128KB 限制 → records 超 100 条截断最旧的。

const USER_RECORDS_LIMIT = 100;

function sanitizeProfileFields(body) {
  const out = {};
  if (body.nick != null) out.nick = cleanUserText(body.nick, 12);
  if (body.cocktail != null) {
    if (typeof body.cocktail === "string") {
      out.cocktail = cleanUserText(body.cocktail, 40);
    } else if (body.cocktail && typeof body.cocktail === "object") {
      // 允许结构化鸡尾酒（名字/配色/杯型/介绍语/头像图），字段白名单 + 限长
      const c = body.cocktail;
      out.cocktail = {
        name: cleanUserText(c.name, 24),
        color: cleanUserText(c.color, 24),
        glass: cleanUserText(c.glass, 24),
        recipe: cleanUserText(c.recipe, 80),
        intro: cleanUserText(c.intro, 120),
        imageUrl: typeof c.imageUrl === "string" ? c.imageUrl.slice(0, 500) : "",
      };
    }
  }
  if (body.avatarSeed != null) out.avatarSeed = cleanUserText(body.avatarSeed, 40);
  return out;
}

async function handleUserUpsert(req, env) {
  if (!env.USERS) return jsonRes({ error: "USERS KV 未绑定" }, 500);
  let body;
  try { body = await readJson(req); } catch { return jsonRes({ error: "body 不是合法 JSON" }, 400); }
  const fields = sanitizeProfileFields(body);

  // 带 id+token → 更新已有档案
  if (body.userId && body.token) {
    const key = "user:" + String(body.userId).slice(0, 40);
    const user = await env.USERS.get(key, "json");
    if (!user || user.token !== body.token) return jsonRes({ error: "档案不存在或 token 不符" }, 403);
    Object.assign(user, fields, { updatedAt: Date.now() });
    await env.USERS.put(key, JSON.stringify(user));
    return jsonRes({ userId: user.id, token: user.token, nick: user.nick });
  }

  // 创建
  if (!fields.nick) return jsonRes({ error: "昵称不能为空" }, 400);
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const user = {
    id,
    token: crypto.randomUUID(),
    nick: fields.nick,
    cocktail: fields.cocktail || null,
    avatarSeed: fields.avatarSeed || "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    records: [],
  };
  await env.USERS.put("user:" + id, JSON.stringify(user));
  return jsonRes({ userId: id, token: user.token, nick: user.nick }, 201);
}

async function handleUserGet(id, env, token) {
  if (!env.USERS) return jsonRes({ error: "USERS KV 未绑定" }, 500);
  const user = await env.USERS.get("user:" + id, "json");
  if (!user) return jsonRes({ error: "档案不存在" }, 404);
  // 公开档案：不外泄 token；records 按 module 分组 = 理想型展示柜
  // 本人（?token= 正确）看全部并带 hidden 标注；其他人只看未隐藏的记录
  const owner = !!token && token === user.token;
  const showcase = {};
  const records = user.records || [];
  let visibleCount = 0;
  for (let idx = 0; idx < records.length; idx++) {
    const rec = records[idx];
    const hidden = rec.hidden === true;
    if (hidden && !owner) continue;
    visibleCount++;
    const mod = rec.module || "lover";
    // idx = 记录在原始数组中的下标，用于 /records/:idx/visibility 与 showcase like/comment
    // R5：随 record 下发点赞数 likes 与评论 comments（最多 20，倒序）。
    (showcase[mod] || (showcase[mod] = [])).push({
      ...rec,
      hidden,
      idx,
      likes: Number(rec.likes) || 0,
      comments: Array.isArray(rec.comments) ? rec.comments.slice(-20).reverse() : [],
    });
  }
  return jsonRes({
    userId: user.id,
    nick: user.nick,
    // 主页"想看方向"徽标（F 线）：从注册档案透出；旧档案无该字段 → null
    gender: user.gender || null,
    seeking: user.seeking || null,
    cocktail: user.cocktail,
    avatarSeed: user.avatarSeed,
    owner,
    playCount: visibleCount,
    showcase,
  });
}

async function handleUserRecord(req, id, env) {
  if (!env.USERS) return jsonRes({ error: "USERS KV 未绑定" }, 500);
  let body;
  try { body = await readJson(req); } catch { return jsonRes({ error: "body 不是合法 JSON" }, 400); }
  const key = "user:" + id;
  const user = await env.USERS.get(key, "json");
  if (!user) return jsonRes({ error: "档案不存在" }, 404);
  if (!body.token || user.token !== body.token) return jsonRes({ error: "token 不符" }, 403);
  const rec = {
    module: cleanUserText(body.module, 20) || "lover",
    role: cleanUserText(body.role, 20) || "player",
    // profile 摘要：只收有限字段，防止把整个 aha 塞进来撑爆 128KB
    profile: sanitizeRecordProfile(body.profile),
    ts: Number(body.ts) || Date.now(),
    hidden: body.hidden === true, // 默认公开；小眼睛可改 /records/:idx/visibility
  };
  if (!Array.isArray(user.records)) user.records = [];
  user.records.push(rec);
  // 超 100 条截断最旧的（KV 单 value 128KB）
  if (user.records.length > USER_RECORDS_LIMIT) {
    user.records.splice(0, user.records.length - USER_RECORDS_LIMIT);
  }
  user.updatedAt = Date.now();
  await env.USERS.put(key, JSON.stringify(user));
  return jsonRes({ ok: true, count: user.records.length });
}

function sanitizeRecordProfile(profile) {
  if (!profile || typeof profile !== "object") return null;
  return {
    archetype: cleanUserText(profile.archetype, 30),
    title: cleanUserText(profile.title, 30),
    mbti: cleanUserText(profile.mbti, 8),
    occupation: cleanUserText(profile.occupation, 30),
    avgScore: Number(profile.avgScore) || 0,
    // 立绘 URL 必须整条保留（截断即 404）；pollinations 带编码 prompt 可能超 500，放宽到 800
    imageUrl: typeof profile.imageUrl === "string" ? profile.imageUrl.slice(0, 800) : "",
    summary: cleanUserText(profile.summary, 200),
    // R3 字段契约：展示柜爆/灭灯统计（Number 兜底，防脏数据）
    burstTotal: Number(profile.burstTotal) || 0,
    offTotal: Number(profile.offTotal) || 0,
  };
}

// 展示柜记录可见性开关（小眼睛）：仅本人（token 正确）可改
async function handleRecordVisibility(req, id, idx, env) {
  if (!env.USERS) return jsonRes({ error: "USERS KV 未绑定" }, 500);
  let body;
  try { body = await readJson(req); } catch { return jsonRes({ error: "body 不是合法 JSON" }, 400); }
  const key = "user:" + id;
  const user = await env.USERS.get(key, "json");
  if (!user) return jsonRes({ error: "档案不存在" }, 404);
  if (!body.token || user.token !== body.token) return jsonRes({ error: "token 不符" }, 403);
  const records = Array.isArray(user.records) ? user.records : [];
  if (!Number.isInteger(idx) || idx < 0 || idx >= records.length) {
    return jsonRes({ error: "记录不存在" }, 404);
  }
  records[idx].hidden = body.hidden === true;
  user.updatedAt = Date.now();
  await env.USERS.put(key, JSON.stringify(user));
  return jsonRes({ ok: true, idx, hidden: records[idx].hidden });
}

/* ============ 展示柜点赞 / 评论（R5 §1.3/§2；挂 USERS KV 同一份记录，不新建 namespace） ============ */
// recordId 格式："<userId>:<idx>"，idx = 记录在 user.records 数组的下标（随 GET 展示柜下发）。
const COMMENT_MAX_LENGTH = 80;
const COMMENT_STORE_LIMIT = 20; // 每条记录最多保留 20 条评论（KV 128KB 保护）
const showcaseCommentRate = new Map(); // ip/user -> 上次评论时间（轻限频 3s）

// 服务端 HTML 转义：评论会被 u.html 渲染，先在后端把危险字符转掉，前端再 esc 一次。
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// 定位 recordId 对应的 { user, key, rec, idx }；找不到返回 { error, status }。
async function resolveShowcaseRecord(env, recordId) {
  const raw = String(recordId ?? "");
  const sep = raw.lastIndexOf(":");
  if (sep <= 0) return { error: "recordId 格式错误", status: 400 };
  const id = raw.slice(0, sep);
  const idx = Number(raw.slice(sep + 1));
  if (!/^[A-Za-z0-9-]{4,40}$/.test(id) || !Number.isInteger(idx) || idx < 0) {
    return { error: "recordId 格式错误", status: 400 };
  }
  const key = "user:" + id;
  const user = await env.USERS.get(key, "json");
  if (!user) return { error: "档案不存在", status: 404 };
  const records = Array.isArray(user.records) ? user.records : [];
  if (idx >= records.length) return { error: "记录不存在", status: 404 };
  return { user, key, rec: records[idx], idx };
}

async function handleShowcaseLike(req, env) {
  if (!env.USERS) return jsonRes({ error: "USERS KV 未绑定" }, 500);
  let body;
  try { body = await readJson(req); } catch { return jsonRes({ error: "body 不是合法 JSON" }, 400); }
  const found = await resolveShowcaseRecord(env, body.recordId);
  if (found.error) return jsonRes({ error: found.error }, found.status);
  found.rec.likes = (Number(found.rec.likes) || 0) + 1;
  found.user.updatedAt = Date.now();
  await env.USERS.put(found.key, JSON.stringify(found.user));
  return jsonRes({ likes: found.rec.likes });
}

async function handleShowcaseComment(req, env) {
  if (!env.USERS) return jsonRes({ error: "USERS KV 未绑定" }, 500);
  let body;
  try { body = await readJson(req); } catch { return jsonRes({ error: "body 不是合法 JSON" }, 400); }

  // 轻限频：同 IP/用户 3 秒 1 条
  const ip = req.headers.get("cf-connecting-ip") || "local";
  const rateKey = ip + "|" + String(body.name || "");
  const now = Date.now();
  const last = showcaseCommentRate.get(rateKey) || 0;
  if (now - last < 3000) return jsonRes({ error: "评论太快了，稍等一下" }, 429);

  const text = esc(cleanUserText(body.text, COMMENT_MAX_LENGTH));
  if (!text) return jsonRes({ error: "评论不能为空" }, 400);

  const found = await resolveShowcaseRecord(env, body.recordId);
  if (found.error) return jsonRes({ error: found.error }, found.status);

  const name = esc(cleanUserText(body.name, 12)) || "路人";
  if (!Array.isArray(found.rec.comments)) found.rec.comments = [];
  found.rec.comments.push({ name, text, ts: now });
  if (found.rec.comments.length > COMMENT_STORE_LIMIT) {
    found.rec.comments.splice(0, found.rec.comments.length - COMMENT_STORE_LIMIT);
  }
  found.user.updatedAt = now;
  await env.USERS.put(found.key, JSON.stringify(found.user));

  showcaseCommentRate.set(rateKey, now);
  if (showcaseCommentRate.size > 5000) showcaseCommentRate.clear(); // 防内存膨胀
  // 返回最新列表（≤20，倒序）
  return jsonRes({ comments: found.rec.comments.slice(-COMMENT_STORE_LIMIT).reverse() });
}

/* ============ 酒保老K（LLM）============ */

const BARTENDER_SYSTEM = `你是「老K」，一间像素赛博酒吧的浪子酒保。你见过所有人的醉态：表白失败的、装醉真哭的、嘴硬心软的。你嘴毒心软，锐评从不留情但从不伤人身份，只损具体行为。永远说中文。锐评必须 60 字以内，短平快，像酒保擦着杯子随口甩出来的那句话。句尾偶尔（不是每次）加一句过来人的漂亮话。不要用"作为AI"之类的话，你就是老K。`;

const BARTENDER_FALLBACK = {
  round_comment: [
    "这分打的，我吧台的冰都没这么冷。",
    "都散了吧，这题暴露的不是TA，是你们各自的前任。",
    "猜得这么准，你们是一起长大的还是一起摔过跤的？",
    "行，这轮谁都别装了，酒杯见底再说话。",
    "我看这不叫打分，这叫互相递刀。爱是刀口舔蜜，慢用。",
    "分差这么大，建议你们先统一一下人生观再玩。",
    "这个分数，老K只能说：懂的都懂，不懂的喝一杯就懂了。",
  ],
  profile_text: [
    "TA大概是那种，嘴上说随便、心里有满分答案的人。跟这种人过日子，你得学会读空气，也得学会关掉空气。",
    "这位理想型，优点是真实，缺点是太真实。老K的建议：爱一个人之前，先确认你笑点和TA的雷点错得开。",
    "看这画像，是个能陪你疯也能陪你怂的主。别急着满分，留一分给日子慢慢打。",
  ],
};

// 同 IP 限频：10 次/分钟（单实例内存滑动窗口，多实例下限频宽松但足够挡脚本）
const bartenderRate = new Map();
function bartenderAllow(ip) {
  const now = Date.now();
  const windowStart = now - 60 * 1000;
  let hits = bartenderRate.get(ip);
  if (!hits) { hits = []; bartenderRate.set(ip, hits); }
  while (hits.length && hits[0] < windowStart) hits.shift();
  if (hits.length >= 10) return false;
  hits.push(now);
  if (bartenderRate.size > 5000) bartenderRate.clear(); // 防内存膨胀
  return true;
}

function bartenderFallback(scene) {
  const pool = BARTENDER_FALLBACK[scene] || BARTENDER_FALLBACK.round_comment;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function handleBartender(req, env) {
  const ip = req.headers.get("cf-connecting-ip") || "local";
  if (!bartenderAllow(ip)) {
    return jsonRes({ error: "rate_limited", msg: "老K忙不过来了，一分钟后再来" }, 429);
  }
  let body;
  try { body = await readJson(req, 64 * 1024); } catch { return jsonRes({ error: "body 不是合法 JSON" }, 400); }
  const scene = body.scene === "profile_text" ? "profile_text" : "round_comment";
  const context = body.context && typeof body.context === "object" ? body.context : {};

  if (!env.LLM_API_KEY || !env.LLM_BASE_URL) {
    return jsonRes({ text: bartenderFallback(scene), source: "fallback" });
  }

  const model = scene === "profile_text" ? "claude-fable-5" : "claude-haiku-4-5-20251001";
  const userPrompt = scene === "profile_text"
    ? `根据下面这局酒桌游戏的数据，用老K的口吻给主角写一段理想型画像文案（150 字以内，不用锐评字数限制），核心画像要贴合数据，相处细节可以发散但要具体、不套模板：\n${JSON.stringify(context).slice(0, 4000)}`
    : `锐评本轮（60 字以内）。本轮数据：\n${JSON.stringify(context).slice(0, 4000)}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10 * 1000);
    const res = await fetch(`${env.LLM_BASE_URL}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.LLM_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: scene === "profile_text" ? 600 : 200,
        system: BARTENDER_SYSTEM,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error("llm status " + res.status);
    const data = await res.json();
    const text = (data.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    if (!text) throw new Error("empty completion");
    return jsonRes({ text, source: "llm", model });
  } catch {
    // LLM 挂了 / 超时 → 预置文案降级，保证酒保永远在场
    return jsonRes({ text: bartenderFallback(scene), source: "fallback" });
  }
}

/* ============ 用户注册 / 身份找回（R2 契约） ============ */
// KV：user:<id> → profile；nameindex:<normalized name> → userId（normalize = trim + 小写）
// passcode 不落明文：存 SHA-256(passcode + userId) 的 hex。

const GENDER_VALUES = Object.freeze(["m", "f", "x"]); // seeking：想看的取向 m/f/x
const VIEWER_GENDERS = Object.freeze(["m", "f"]); // viewer 自身性别（隔离铁桶用）

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeName(name) {
  return String(name || "").trim().toLowerCase();
}

async function handleRegister(req, env) {
  if (!env.USERS) return jsonRes({ error: "USERS KV 未绑定" }, 500);
  let body;
  try { body = await readJson(req); } catch { return jsonRes({ error: "body 不是合法 JSON" }, 400); }
  const name = cleanUserText(body.name, 12);
  if (!name) return jsonRes({ error: "bad_name", msg: "昵称不能为空" }, 400);
  const passcode = String(body.passcode ?? "");
  if (!/^\d{4,6}$/.test(passcode)) {
    return jsonRes({ error: "bad_passcode", msg: "口令必须是 4-6 位数字" }, 400);
  }
  if (!GENDER_VALUES.includes(body.gender)) return jsonRes({ error: "bad_gender" }, 400);
  if (!GENDER_VALUES.includes(body.seeking)) return jsonRes({ error: "bad_seeking" }, 400);

  const indexKey = "nameindex:" + normalizeName(name);
  const taken = await env.USERS.get(indexKey);
  if (taken) return jsonRes({ error: "name_taken", msg: `「${name}」已经被人叫走了，换一个` }, 409);

  // 沿用现有 user 结构（nick/cocktail/avatarSeed/records），新增 gender/seeking/passcodeHash
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const user = {
    id,
    token: crypto.randomUUID(),
    nick: name,
    name, // 注册名（与 nameindex 对应；nick 可被后续 /api/user 更新，name 不变）
    gender: body.gender,
    seeking: body.seeking,
    passcodeHash: await sha256Hex(passcode + id),
    cocktail: null,
    avatarSeed: "",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    records: [],
  };
  await env.USERS.put("user:" + id, JSON.stringify(user));
  await env.USERS.put(indexKey, id);
  return jsonRes({ userId: id, token: user.token }, 201);
}

async function handleRecover(req, env) {
  if (!env.USERS) return jsonRes({ error: "USERS KV 未绑定" }, 500);
  let body;
  try { body = await readJson(req); } catch { return jsonRes({ error: "body 不是合法 JSON" }, 400); }
  const normalized = normalizeName(body.name);
  if (!normalized) return jsonRes({ error: "not_found", msg: "没有这个名字" }, 404);
  const userId = await env.USERS.get("nameindex:" + normalized);
  if (!userId) return jsonRes({ error: "not_found", msg: "没有这个名字" }, 404);
  const key = "user:" + userId;
  const user = await env.USERS.get(key, "json");
  if (!user) return jsonRes({ error: "not_found", msg: "档案不存在" }, 404);
  const hash = await sha256Hex(String(body.passcode ?? "") + user.id);
  if (!user.passcodeHash || hash !== user.passcodeHash) {
    return jsonRes({ error: "wrong_passcode", msg: "口令不对" }, 403);
  }
  // 兼容：极老档案没有 token → 按现有生成逻辑补一个
  if (!user.token) {
    user.token = crypto.randomUUID();
    user.updatedAt = Date.now();
    await env.USERS.put(key, JSON.stringify(user));
  }
  return jsonRes({ userId: user.id, token: user.token });
}

/* ============ 老K LLM 代理（/api/laok，永不 5xx） ============ */

// 定稿于 docs/LAOK-PROMPT.md，改动需同步该文档
const LAOK_SYSTEM = `你是老K，酒吧「99%」的老板，也是酒桌游戏《理想型·加载中》里的常驻角色。客人在玩"满分男/满分女/满分Agent"打分游戏：主角给缺点打分，其他人猜分，猜偏罚酒。你在吧台看着，轮到你时搭一句。

人设：知世故而不世故。你什么人间戏码都见过，所以什么都不惊讶；跟谁都能聊两句、接得住梗，但从不越界。幽默是随口顺一句的松弛感，不是段子。你平视客人，不俯视不讨好。

输入是 JSON，含场景类型和上下文：
- reveal：某题结算，含题目梗概、主角真分、全场猜分偏差
- solo：单人局，客人刚打完一题的分，你接一句
- penalty：有人被罚酒，你补一句

输出要求：
- 只输出一句话，不超过40个字，中文口语，像随口说的
- 先接住刚发生的事（题、分数、偏差），能提题里的具体细节最好
- 只评这一局的事，不评客人的人品、长相、感情经历

禁止：
- emoji、波浪号、"亲""哦~"、连续感叹号
- 网络烂梗、口号、大道理、人生建议、装深沉的金句
- 舞台说明、引号包裹、任何解释性前后缀

直接给那句话，别的什么都不要输出。`;

// 内置兜底池：public/laok-lines.js（P 线程交付）不存在时使用
const LAOK_BUILTIN_POOL = Object.freeze({
  default: [
    "来了就坐，酒不急，话也不急。",
    "今晚的事今晚聊，明天的事交给明天的酒。",
    "我这吧台什么都听过，你这点事不算事。",
    "喝口酒，慢慢说，我不赶时间。",
    "人心这东西，猜十次能中一次就算懂了。",
  ],
});

// 卡组（R2/R4）：开桌选「今晚聊什么」——R4 删 agent、加 boss（满分老板）
const ROOM_DECK_IDS = Object.freeze(["man", "woman", "boss", "bestie"]);

// public/laok-lines.js 由 P 线程新建，可能尚不存在：
// 用「运行期拼接的动态 import + try/catch」绕开 esbuild 的构建期解析，文件缺失时降级内置池。
// TODO: laok-lines.js 落地后可改为顶部静态 import。
let laokLinesPromise = null;
function loadLaokLines() {
  if (!laokLinesPromise) {
    const spec = "../public/" + "laok-lines" + ".js";
    laokLinesPromise = import(spec).catch(() => null);
  }
  return laokLinesPromise;
}

async function laokPoolLine(scene) {
  let pool = null;
  const mod = await loadLaokLines();
  const p = mod?.LAOK_POOL?.[scene];
  if (Array.isArray(p) && p.length) pool = p;
  if (!pool) pool = LAOK_BUILTIN_POOL[scene] || LAOK_BUILTIN_POOL.default;
  return pool[Math.floor(Math.random() * pool.length)];
}

// 国王指令卡校验：只校验 id 存在；laok-lines.js / KING_ORDERS 缺失时不校验
async function kingOrderExists(orderId) {
  const mod = await loadLaokLines();
  const orders = mod?.KING_ORDERS;
  if (!orders) return true;
  if (Array.isArray(orders)) return orders.some((o) => o === orderId || o?.id === orderId);
  if (typeof orders === "object") return orderId in orders;
  return true;
}

// 60s 内存级缓存：scene+ctx 相同直接复用，防刷 pollinations
const laokCache = new Map(); // key -> { ts, body }
const LAOK_CACHE_MS = 60 * 1000;
const LAOK_MAX_CHARS = 80;

async function handleLaok(url) {
  try {
    const scene = cleanUserText(url.searchParams.get("scene"), 40) || "default";
    const ctxRaw = String(url.searchParams.get("ctx") || "").slice(0, 4000);
    let ctx = {};
    try { ctx = JSON.parse(ctxRaw || "{}"); } catch { ctx = {}; }
    if (!ctx || typeof ctx !== "object") ctx = {};

    const cacheKey = scene + "\u0000" + ctxRaw;
    const hit = laokCache.get(cacheKey);
    if (hit && Date.now() - hit.ts < LAOK_CACHE_MS) return jsonRes(hit.body);

    let body = null;
    try {
      const prompt =
        `${LAOK_SYSTEM}\n\n[场景] ${scene}\n[现场情况] ${JSON.stringify(ctx).slice(0, 2000)}\n` +
        `请以老K的身份，就现场情况说一句话（不超过40个字，只输出这句话本身）。`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5 * 1000);
      const res = await fetch(
        `https://text.pollinations.ai/${encodeURIComponent(prompt)}?referrer=idealtype`,
        { signal: controller.signal }
      );
      clearTimeout(timer);
      if (res.ok) {
        const text = (await res.text()).trim();
        if (text && Array.from(text).length <= LAOK_MAX_CHARS) {
          body = { text, source: "llm" };
        }
      }
    } catch {}
    if (!body) body = { text: await laokPoolLine(scene), source: "pool" };

    laokCache.set(cacheKey, { ts: Date.now(), body });
    if (laokCache.size > 300) laokCache.clear(); // 防内存膨胀
    return jsonRes(body);
  } catch {
    // 契约：永不 5xx
    return jsonRes({
      text: LAOK_BUILTIN_POOL.default[Math.floor(Math.random() * LAOK_BUILTIN_POOL.default.length)],
      source: "pool",
    });
  }
}

const TITLES = [
  { min: 7.5, title: "海纳百川·活菩萨", sub: "什么缺陷到你这都是可爱" },
  { min: 5.5, title: "薛定谔的心动", sub: "你的分数没人猜得透" },
  { min: 3.5, title: "铁面判官", sub: "满分男在你面前瑟瑟发抖" },
  { min: 0, title: "六亲不认·火化大队长", sub: "今晚火化名额已满" },
];

/* ============ 全场互动约束 ============ */

const SOCIAL = Object.freeze({
  chatMaxLength: 120,
  danmakuMaxLength: 30,
  chatHistoryLimit: 100,
  recentEventLimit: 30,
  chatCooldownMs: 800,
  danmakuCooldownMs: 3000,
  quickReactionCooldownMs: 700,
  messageReactionCooldownMs: 300,
  lightCooldownMs: 500,
});

// 服务端白名单是最终准绳，避免用任意长 Unicode 串刷爆状态。
const MESSAGE_REACTIONS = Object.freeze(["😂", "🔥", "🍺", "💔", "👏", "🤯", "❤️", "👀"]);
const QUICK_REACTIONS = Object.freeze([
  "🍺", "😂", "💔", "🔥", "👏", "🤯", "❤️", "👀",
  "😍", "🥹", "😭", "😅", "😏", "🙄", "🤡", "💀",
  "🫠", "🫣", "🤨", "🥳", "🫡", "😈", "🤝", "👍",
  "👎", "✨", "💅", "🍿", "🚨", "💯", "🥂", "🧊",
]);

// 局终即焚：房间数据最长保留 12 小时（PRD §2）
const ROOM_TTL_MS = 12 * 3600 * 1000;
// 断线超过 90 秒自动标记 away（等待收集时跳过，不阻塞全桌）
const AWAY_MS = 90 * 1000;
// 单个房间题库上限，避免 DO 单值 128KiB 写爆后房间彻底不可用
const MAX_QUESTIONS = 300;
const MAX_QUESTION_TEXT = 200;
const MAX_KING_QUESTIONS = 120;
const MAX_KING_TEXT = 100;

// 取向池（PRD V2 §3.4 / qa/QUESTION-SPEC.md）
const VALID_POOLS = Object.freeze(["all", "straight-f", "straight-m", "gay", "lesbian", "neutral"]);

/* ============ 隔离铁桶（R4 §1.3，P0，唯一真源）============
 * (卡组 deck × viewer.gender × viewer.seeking) → 允许的 pools 集合。
 * 铁律：任何未命中下表的组合一律只给 neutral，杜绝取向黑话串池。
 *   满分男 man + 直女(g=f,seek=m) → neutral+straight-m（排除 gay）
 *   满分男 man + 男同(g=m,seek=m) → neutral+gay
 *   满分女 woman + 直男(g=m,seek=f) → neutral+straight-f（排除 lesbian）
 *   满分女 woman + 拉拉(g=f,seek=f) → neutral+lesbian
 *   seeking=x（不限）/ boss（满分老板，职场向）/ 任何错配 → neutral only
 * 导出供 qa/isolation-proof.mjs 直接调用（纯函数、无副作用）。 */
export function allowedPoolsFor(deck, gender, seeking) {
  if (deck === "boss" || deck === "bestie") return ["neutral"]; // 满分老板/满分闺蜜：非取向向，全 neutral
  if (seeking !== "m" && seeking !== "f") return ["neutral"]; // 含 seeking=x/未知
  if (deck === "man" && seeking === "m") {
    if (gender === "f") return ["neutral", "straight-m"]; // 直女看男
    if (gender === "m") return ["neutral", "gay"]; // 男同看男
    return ["neutral"];
  }
  if (deck === "woman" && seeking === "f") {
    if (gender === "m") return ["neutral", "straight-f"]; // 直男看女
    if (gender === "f") return ["neutral", "lesbian"]; // 拉拉看女
    return ["neutral"];
  }
  return ["neutral"]; // 卡组/取向错配（如 man+seek=f）→ 安全兜底
}

// 单题是否落在允许池：legacy/boss 的 "all" 视为通吃（保证旧库/无 pools 题可玩）
export function questionInAllowedPools(q, allowedSet) {
  const pools = Array.isArray(q?.pools) && q.pools.length ? q.pools : ["all"];
  if (pools.includes("all")) return true;
  return pools.some((p) => allowedSet.has(p));
}

// 按 viewer 过滤题库；空集兜底至少 neutral（含 all 通吃），彻底空则返回原集不阻塞开局
export function filterQuestionsForViewer(questions, deck, gender, seeking) {
  const list = Array.isArray(questions) ? questions : [];
  const allowedSet = new Set(allowedPoolsFor(deck, gender, seeking));
  const filtered = list.filter((q) => questionInAllowedPools(q, allowedSet));
  if (filtered.length) return filtered;
  const neutralOnly = list.filter((q) => questionInAllowedPools(q, new Set(["neutral"])));
  return neutralOnly.length ? neutralOnly : list;
}
const DEFAULT_NOUN = Object.freeze({ m: "满分男", f: "满分女", n: "满分TA" });
const DECK_NAMES = Object.freeze({
  qingtang: "清汤锅底",
  fanqie: "番茄锅底",
  mala: "麻辣锅底",
  zhongkou: "重口锅底", // v1 兼容
});

const DRINKS = Object.freeze({
  beer: { id: "beer", label: "啤酒", emoji: "🍺" },
  wine: { id: "wine", label: "红酒", emoji: "🍷" },
  baijiu: { id: "baijiu", label: "白酒", emoji: "🥃" },
  cocktail: { id: "cocktail", label: "调酒", emoji: "🍸" },
  soft: { id: "soft", label: "无酒精", emoji: "🫧" },
});

function drinkOf(id) {
  return DRINKS[id] || DRINKS.beer;
}

/* ============ RoomDO ============ */

export class RoomDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.room = null;
    this.ctx.blockConcurrencyWhile(async () => {
      this.room = (await this.ctx.storage.get("room")) || null;
      // 旧存档兼容：补齐互动体系字段
      if (this.room) {
        if (this.room.visibility !== "public") this.room.visibility = "private";
        if (typeof this.room.solo !== "boolean") this.room.solo = false;
        if (!ROOM_DECK_IDS.includes(this.room.deck)) this.room.deck = "man";
        if (!Array.isArray(this.room.chat)) this.room.chat = [];
        if (typeof this.room.chatSeq !== "number") this.room.chatSeq = 0;
        if (!Array.isArray(this.room.socialFeed)) this.room.socialFeed = [];
        if (typeof this.room.socialSeq !== "number") this.room.socialSeq = 0;
        if (!Array.isArray(this.room.ahaHistory)) this.room.ahaHistory = [];
        if (this.room.aha && !this.room.aha.protagonistToken && this.room.current?.protagonist) {
          this.room.aha.protagonistToken = this.room.current.protagonist;
        }
        if (this.room.settings?.deck === "biantaila") {
          this.room.settings.deck = "zhongkou";
          this.room.settings.deckName = "重口锅底";
        }
        if (this.room.settings) {
          if (!this.room.settings.module) this.room.settings.module = "lover";
          if (!this.room.settings.moduleName) this.room.settings.moduleName = "满分爱人";
          if (!VALID_POOLS.includes(this.room.settings.pool)) this.room.settings.pool = "all";
          if (!this.room.settings.noun) this.room.settings.noun = { ...DEFAULT_NOUN };
        }
        if (this.room.current) {
          if (!this.room.current.penalties) this.room.current.penalties = {};
          if (!this.room.current.drinking) this.room.current.drinking = null;
        }
        for (const player of this.room.players || []) {
          if (!DRINKS[player.drink]) player.drink = "beer";
          // 旧存档没有公开 id，补一个（token 不再外发）
          if (!player.id) player.id = crypto.randomUUID();
          // V2 离场体系字段
          if (typeof player.away !== "boolean") player.away = false;
          if (typeof player.left !== "boolean") player.left = false;
          if (typeof player.joinedAt !== "number") player.joinedAt = 0;
          if (typeof player.lastSeenAt !== "number") player.lastSeenAt = Date.now();
        }
        if (!Array.isArray(this.room.kingQuestions)) this.room.kingQuestions = [];
        if (this.room.king === undefined) this.room.king = null;
      }
    });
  }

  async fetch(req) {
    const url = new URL(req.url);

    // 桌子仲裁（本实例名为 table-N 时走这两条路；仲裁 DO 只记「这张桌当前的房间码」，
    // 自己不承载任何游戏房状态，游戏房仍是按 4 位码命名的独立 RoomDO）
    if (url.pathname === "/table/join") return this.tableJoin(url);
    if (url.pathname === "/table/info") return this.tableInfo(url);

    if (url.pathname === "/create") {
      // 只按 createdAt TTL 回收：空房也是别人刚建的房，finished 房还有人在看海报
      const active = this.room && Date.now() - this.room.createdAt < ROOM_TTL_MS;
      if (active) return new Response("occupied", { status: 409 });
      this.room = this.freshRoom(url.searchParams.get("code"), {
        visibility: url.searchParams.get("visibility") === "public" ? "public" : "private",
        solo: url.searchParams.get("solo") === "1",
        deck: url.searchParams.get("deck"),
        table: Number(url.searchParams.get("table")) || null,
      });
      await this.save();
      await this.scheduleReap();
      return new Response("ok");
    }

    if (url.pathname === "/info") {
      const alive = this.room && Date.now() - this.room.createdAt < ROOM_TTL_MS;
      if (!alive) return jsonRes({ exists: false }, 404);
      return jsonRes({
        exists: true,
        phase: this.room.phase,
        players: this.room.players.filter((p) => !p.left).length,
        visibility: this.room.visibility || "private",
        deck: this.room.deck || "man",
      });
    }

    // WebSocket upgrade
    if (req.headers.get("Upgrade") === "websocket") {
      if (!this.room) return new Response("房间不存在", { status: 404 });
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    return new Response("not found", { status: 404 });
  }

  /* ---- 桌子仲裁（table-N 实例专用）---- */

  // 查游戏房现状；房不存在/查询失败一律视为 null（→ 桌上无活跃房）
  async roomSnapshot(code) {
    try {
      const stub = this.env.ROOM.get(this.env.ROOM.idFromName(code));
      const res = await stub.fetch("https://do/info");
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // 桌上房间仍可作为「这张桌的房」：存在、没打完、没坐满
  tableRoomActive(info) {
    return !!info && info.exists && info.phase !== "finished" && info.players < 12;
  }

  async tableJoin(url) {
    const table = Number(url.searchParams.get("table")) || 0;
    const visibility = url.searchParams.get("visibility") === "private" ? "private" : "public";
    const deck = ROOM_DECK_IDS.includes(url.searchParams.get("deck"))
      ? url.searchParams.get("deck")
      : "man";
    // 简易互斥：并发 join 串行化，防止同桌同时开出两个房
    this.tableLock = (this.tableLock || Promise.resolve()).then(async () => {
      const saved = (await this.ctx.storage.get("table")) || null;
      if (saved?.code && this.tableRoomActive(await this.roomSnapshot(saved.code))) {
        return { code: saved.code, table };
      }
      // 无活跃房（或已 finished/解散/满员）→ 开新房并记住
      for (let i = 0; i < 15; i++) {
        const code = String(Math.floor(1000 + Math.random() * 9000));
        const stub = this.env.ROOM.get(this.env.ROOM.idFromName(code));
        const res = await stub.fetch(
          `https://do/create?code=${code}&visibility=${visibility}&deck=${deck}&table=${table}`
        );
        if (res.ok) {
          await this.ctx.storage.put("table", { code, table, createdAt: Date.now() });
          return { code, table };
        }
      }
      return null;
    });
    const result = await this.tableLock;
    if (!result) return jsonRes({ error: "房间码分配失败，请重试" }, 503);
    return jsonRes(result);
  }

  async tableInfo(url) {
    const table = Number(url.searchParams.get("table")) || 0;
    const saved = (await this.ctx.storage.get("table")) || null;
    const idle = { table, code: null, players: 0, phase: null, deck: null, active: false };
    if (!saved?.code) return jsonRes(idle);
    const info = await this.roomSnapshot(saved.code);
    if (!this.tableRoomActive(info)) return jsonRes(idle);
    return jsonRes({
      table,
      // 大厅列表只暴露 public 房的码；private 桌只报占用状态
      code: info.visibility === "public" ? saved.code : null,
      players: info.players,
      phase: info.phase,
      deck: info.deck || "man",
      active: true,
    });
  }

  freshRoom(code, opts = {}) {
    return {
      code,
      createdAt: Date.now(),
      phase: "lobby",
      visibility: opts.visibility === "public" ? "public" : "private",
      solo: opts.solo === true, // solo 房允许 1 人开局
      deck: ROOM_DECK_IDS.includes(opts.deck) ? opts.deck : "man", // 卡组（R2/R4）：man|woman|boss
      table: opts.table || null, // 由几号桌开出（非桌房为 null）
      settings: {
        rounds: 5,
        deck: "qingtang",
        deckName: "清汤锅底",
        module: "lover",
        moduleName: "满分爱人",
        pool: "all",
        noun: { ...DEFAULT_NOUN },
      },
      players: [], // {token,name,emoji,isHost,connected,away,left,drinks,know,done}
      questions: [], // 开局时房主端下发（含 fallback 逻辑）
      kingQuestions: [], // 国王游戏题（开局随题库传上来）
      king: null, // 国王游戏进行态 {kingToken, options, picked, custom, active}
      usedQuestionIds: [],
      current: null, // 当前主角轮 {protagonist, gender, roundIndex, records[], question, scores, guesses, reveal}
      lastProtagonist: null, // 上一任主角 token（下一轮由 TA 摇签）
      ahaHistory: [],
      aha: null,
      chat: [], // 最近 100 条；reactions 内部只存玩家 token，视图层只下发 count + mine
      chatSeq: 0,
      socialFeed: [], // 最近 30 条弹幕/快捷反应，重连后仍可恢复现场气氛
      socialSeq: 0,
    };
  }

  async save() {
    await this.ctx.storage.put("room", this.room);
  }

  // 局终即焚：建房 / 收局时把删除闹钟推到 12h 后
  async scheduleReap() {
    try {
      await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS);
    } catch {}
  }

  // 闹钟复用：既做 12h 回收，也做「断线 90s → away」扫描
  async alarm() {
    const r = this.room;
    if (!r) {
      await this.ctx.storage.deleteAll();
      return;
    }
    const reapAt = (r.createdAt || 0) + ROOM_TTL_MS;
    const now = Date.now();
    if (now >= reapAt) {
      await this.ctx.storage.deleteAll();
      this.room = null;
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.close(4002, "expired"); } catch {}
      }
      return;
    }
    let changed = false;
    let nextAt = reapAt;
    for (const p of r.players) {
      if (p.left || p.connected || p.away) continue;
      const awayAt = (p.lastSeenAt || 0) + AWAY_MS;
      if (now >= awayAt) {
        p.away = true;
        changed = true;
        this.emitPresence("player_away", p);
      } else {
        nextAt = Math.min(nextAt, awayAt);
      }
    }
    if (changed) {
      this.onPresenceChanged();
      await this.save();
      this.broadcast();
    }
    try { await this.ctx.storage.setAlarm(nextAt); } catch {}
  }

  /* ---- WS 生命周期（hibernation API）---- */

  async webSocketMessage(ws, raw) {
    // 开局消息包含整副题库，因此保留 256KB 上限；具体社交文本另有严格字段限长。
    if (typeof raw !== "string" || raw.length > 256 * 1024) {
      return this.send(ws, { type: "error", code: "invalid_message", msg: "消息格式不合法" });
    }
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    try {
      await this.handle(ws, msg);
    } catch (e) {
      this.send(ws, { type: "error", msg: "服务端异常: " + e.message });
    }
  }

  async webSocketClose(ws) {
    const token = this.tokenOf(ws);
    if (!token || !this.room) return;
    const r = this.room;
    const p = r.players.find((p) => p.token === token);
    // 显式排除正在关闭的这条连接，否则 connected 永远置不回 false
    if (!p || this.liveSockets(token, ws).length) return;
    p.connected = false;
    p.lastSeenAt = Date.now();
    // 90s 后仍未回来 → alarm 扫描标记 away；房主掉线短暂等待重连，away 后再移交
    await this.armAwayAlarm();
    this.ensureRoleIntegrity();
    // 挂机/掉线者不该无限挂住收集阶段
    this.unblockCollections();
    await this.save();
    this.broadcast();
  }

  // 把 away 扫描闹钟提前（不晚于 12h 回收闹钟）
  async armAwayAlarm() {
    try {
      const wanted = Date.now() + AWAY_MS + 500;
      const current = await this.ctx.storage.getAlarm();
      if (current == null || current > wanted) await this.ctx.storage.setAlarm(wanted);
    } catch {}
  }

  // 房主移交：最早加入的在线玩家优先，其次任何未离场玩家
  transferHost(from) {
    const r = this.room;
    const online = r.players
      .filter((q) => q !== from && !q.left && q.connected)
      .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    const heir = online[0] || r.players.find((q) => q !== from && !q.left);
    if (heir) {
      from.isHost = false;
      heir.isHost = true;
      this.emitPresence("host_transfer", heir);
    }
  }

  // 是否参与本局收集（打分/喝酒/灯等）：离场与 away 均不算
  isActive(p) {
    return !!p && !p.left && !p.away;
  }

  // presence 变化（离场/away/回归）后，检查所有等待收集的阶段是否已可推进
  onPresenceChanged() {
    this.ensureRoleIntegrity();
    this.unblockCollections();
  }

  unblockCollections() {
    const r = this.room;
    if (!r.current) return;
    if (r.phase === "answering") this.maybeReveal();
    // 国王离场 → 国王游戏直接散场（无论现在处于 reveal/drinking/king 哪个阶段）
    if (r.king?.active) {
      const king = r.players.find((p) => p.token === r.king.kingToken);
      if (!this.isActive(king)) this.endKingGame(null);
    }
  }

  emitPresence(kind, player, extra = {}) {
    for (const s of this.ctx.getWebSockets()) {
      if (!this.tokenOf(s)) continue;
      this.send(s, {
        type: kind,
        name: player?.name,
        emoji: player?.emoji,
        ...extra,
      });
    }
  }

  async webSocketError(ws) {
    return this.webSocketClose(ws);
  }

  tokenOf(ws) {
    try {
      return ws.deserializeAttachment()?.token || null;
    } catch {
      return null;
    }
  }

  liveSockets(token, exclude = null) {
    return this.ctx
      .getWebSockets()
      .filter((s) => s !== exclude && this.tokenOf(s) === token && s.readyState === 1);
  }

  /* ---- 主角 / 摇签人 / 房主 的离席兜底 ---- */

  ensureRoleIntegrity() {
    const r = this.room;
    if (!r.players.length) return;
    if (!r.players.some((p) => p.isHost && !p.left)) {
      const heir =
        r.players
          .filter((p) => !p.left && p.connected)
          .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))[0] ||
        r.players.find((p) => !p.left) ||
        r.players[0];
      for (const p of r.players) p.isHost = false;
      heir.isHost = true;
      this.emitPresence("host_transfer", heir);
    }
    const cur = r.current;
    if (!cur) return;
    const host = r.players.find((p) => p.isHost);
    const shakerP = r.players.find((p) => p.token === cur.shaker);
    // 摇签人被踢/离场/掉线 → 回落到房主，避免 picking 无出口
    if (!shakerP || shakerP.left || !shakerP.connected)
      cur.shaker = host ? host.token : r.players[0].token;
    const heroP = r.players.find((p) => p.token === cur.protagonist);
    const heroAlive = !!heroP && !heroP.left;
    const liveRound = ["picking", "protagonist_setup", "answering", "reveal", "drinking", "king"].includes(r.phase);
    if (!heroAlive && liveRound) {
      // 主角中途离席：本轮作废，重新抽签；没人可抽就直接收局
      const actives = r.players.filter((p) => !p.left);
      const candidates = actives.filter((p) => !p.done);
      if (candidates.length && actives.length >= 2) this.pickProtagonist();
      else {
        r.current = null;
        r.king = null;
        r.phase = "finished";
      }
    }
  }

  send(ws, obj) {
    try {
      ws.send(JSON.stringify(obj));
    } catch {}
  }

  broadcast() {
    for (const ws of this.ctx.getWebSockets()) {
      const token = this.tokenOf(ws);
      if (!token) continue;
      this.send(ws, { type: "state", state: this.viewFor(token) });
    }
  }

  /* ---- 每个玩家视角的状态（隐藏未开牌数据）---- */

  viewFor(token) {
    const r = this.room;
    const me = r.players.find((p) => p.token === token);
    const cur = r.current;
    let curView = null;
    if (cur) {
      const inReveal = r.phase === "reveal";
      // 抽签阶段、签未弹出前隐藏主角名字（保持悬念）
      const hideHero = r.phase === "picking" && !cur.drawn;
      const shakerP = r.players.find((p) => p.token === cur.shaker);
      curView = {
        protagonist: hideHero
          ? null
          : this.pub(r.players.find((p) => p.token === cur.protagonist)),
        drawn: !!cur.drawn,
        shaker: shakerP ? shakerP.name : null,
        youAreShaker: cur.shaker === token,
        youAreProtagonist: cur.protagonist === token,
        gender: cur.gender,
        roundIndex: cur.roundIndex,
        totalRounds: r.settings.rounds,
        question: cur.question
          ? { id: cur.question.id, text: cur.question.text, spice: cur.question.spice }
          : null,
        submitted: {
          protagonist: cur.score != null,
          guessers: Object.keys(cur.guesses).map(
            (t) => r.players.find((p) => p.token === t)?.name
          ),
        },
        reveal: inReveal ? cur.reveal : null,
        // 每题国王机会（R2.5 号码轮报）：reveal 后仍可见，供断线重连恢复当前轮到谁
        kingChance: ["reveal", "drinking", "king"].includes(r.phase) && cur.kingChance
          ? {
              winners: cur.kingChance.winners,
              questionIdx: cur.kingChance.questionIdx,
              seatCount: cur.kingChance.seatCount,
              turnIdx: cur.kingChance.turnIdx,
              currentKing: cur.kingChance.winners[cur.kingChance.turnIdx] || null,
              done: cur.kingChance.turnIdx >= cur.kingChance.winners.length,
              results: cur.kingChance.results,
            }
          : null,
        drinking: r.phase === "drinking" ? this.drinkingView(cur, token) : null,
      };
    }
    const myKingChance =
      cur?.kingChance && ["reveal", "drinking", "king"].includes(r.phase)
        ? cur.kingChance
        : null;
    return {
      code: r.code,
      phase: r.phase,
      settings: r.settings,
      solo: !!r.solo,
      deck: r.deck || "man",
      // 房主视角可见当前公开/私密状态（set_visibility 可改）
      ...(me?.isHost ? { visibility: r.visibility || "private" } : {}),
      you: me ? { ...this.pub(me), token: me.token, isHost: me.isHost, seeking: me.seeking || null, seatNo: myKingChance ? (myKingChance.seat[me.id] || null) : null } : null,
      // token 是唯一身份凭证，绝不出现在 players[] 里；踢人改用公开 id
      players: r.players.map((p) => this.pub(p)),
      current: curView,
      // R2：终局大国王已移除 —— finished 阶段 king 恒为 null（保留字段兼容旧前端）
      king: r.phase === "finished" ? null : this.kingView(token),
      aha:
        r.phase === "aha" || r.phase === "finished"
          ? this.ahaView(r.aha, token)
          : null,
      ahaHistory:
        r.phase === "finished"
          ? r.ahaHistory.map((a) => this.ahaView(a, token))
          : [],
      chat: r.chat.map((message) => this.chatView(message, token, me?.name)),
      social: {
        recent: r.socialFeed || [],
        messageReactions: MESSAGE_REACTIONS,
        quickReactions: QUICK_REACTIONS,
      },
    };
  }

  chatView(message, token, name) {
    const reactions = {};
    for (const [emoji, rawVoters] of Object.entries(message.reactions || {})) {
      if (!MESSAGE_REACTIONS.includes(emoji) || !Array.isArray(rawVoters)) continue;
      // 旧存档存过玩家名，新协议存 token；两种格式都能恢复。
      const voters = [...new Set(rawVoters)];
      if (!voters.length) continue;
      reactions[emoji] = {
        count: voters.length,
        mine: voters.includes(token) || (!!name && voters.includes(name)),
      };
    }
    return { ...message, reactions };
  }

  // aha 视图：不外泄 token→灯 的原始映射，只下发统计 + 本人的当前票。
  ahaView(aha, token) {
    if (!aha) return null;
    const { lights, protagonistToken, lightNames: _legacyLightNames, ...rest } = aha;
    const map = lights || {};
    const burst = Object.values(map).filter(Boolean).length;
    const off = Object.values(map).length - burst;
    const vote = map[token] === undefined ? null : map[token] ? "burst" : "off";
    const burstNames = [];
    const offNames = [];
    for (const [playerToken, on] of Object.entries(map)) {
      const player = this.room.players.find((p) => p.token === playerToken);
      if (player) (on ? burstNames : offNames).push(player.name);
    }
    return {
      ...rest,
      light: {
        burst,
        off,
        voted: burst + off,
        total: aha.lightTotal || 0,
        mine: vote,
        yours: vote, // 兼容早期前端字段
        canVote: !!token && (this.room.solo || token !== protagonistToken),
        burstNames: burstNames.length ? burstNames : _legacyLightNames?.burst || [],
        offNames: offNames.length ? offNames : _legacyLightNames?.off || [],
      },
    };
  }

  pub(p) {
    if (!p) return null;
    return {
      id: p.id,
      name: p.name,
      emoji: p.emoji,
      isHost: p.isHost,
      connected: p.connected,
      away: !!p.away,
      left: !!p.left,
      drinks: p.drinks,
      know: p.know,
      done: p.done,
      drink: drinkOf(p.drink),
    };
  }

  // 国王游戏视图：题目选项只发给国王本人（断线重连也能恢复）
  kingView(token) {
    const r = this.room;
    const k = r.king;
    if (!k) return null;
    const kingP = r.players.find((p) => p.token === k.kingToken);
    return {
      active: !!k.active,
      king: this.pub(kingP),
      youAreKing: k.kingToken === token,
      options: k.kingToken === token && k.active ? k.options : null,
      order: k.picked ? k.picked : null, // 最终圣旨 {text, custom}
      exactGuessers: k.exactGuessers || [],
    };
  }

  drinkingView(cur, token) {
    const penalties = cur?.penalties || {};
    const done = new Set(cur?.drinking?.done || []);
    const drinkers = Object.entries(penalties)
      .filter(([, cups]) => Number(cups) > 0)
      .map(([playerToken, cups]) => {
        const player = this.room.players.find((p) => p.token === playerToken);
        return player ? {
          name: player.name,
          emoji: player.emoji,
          drink: drinkOf(player.drink),
          cups: Number(cups),
          // away/left 的欠酒者自动视为已完成，不阻塞全桌
          done: done.has(playerToken) || !this.isActive(player),
          mine: playerToken === token,
        } : null;
      })
      .filter(Boolean);
    return {
      drinkers,
      completed: drinkers.filter((item) => item.done).length,
      total: drinkers.length,
      allDone: drinkers.length === 0 || drinkers.every((item) => item.done),
      skipped: !!cur?.drinking?.skipped,
      canConfirm: Number(penalties[token]) > 0 && !done.has(token),
    };
  }

  /* ---- 消息处理 ---- */

  async handle(ws, msg) {
    const r = this.room;
    if (!r) return this.send(ws, { type: "error", msg: "房间不存在" });

    if (msg.type === "join") return this.onJoin(ws, msg);

    const token = this.tokenOf(ws);
    const me = r.players.find((p) => p.token === token);
    if (!me) return this.send(ws, { type: "error", msg: "请先入房" });
    if (me.left) return this.send(ws, { type: "error", code: "left_room", msg: "你已离开这桌" });
    // 任何消息都是活着的证据：away 玩家自动回归
    me.lastSeenAt = Date.now();
    if (me.away) {
      me.away = false;
      this.emitPresence("player_back", me);
    }

    switch (msg.type) {
      case "set_settings": {
        if (!me.isHost || r.phase !== "lobby") return;
        const n = Math.round(Number(msg.rounds));
        if (n >= 3 && n <= 8) r.settings.rounds = n;
        if (DECK_NAMES[msg.deck]) {
          r.settings.deck = msg.deck;
          r.settings.deckName = DECK_NAMES[msg.deck];
        }
        if (typeof msg.module === "string" && msg.module) {
          r.settings.module = cleanUserText(msg.module, 20);
          if (typeof msg.moduleName === "string")
            r.settings.moduleName = cleanUserText(msg.moduleName, 20);
        }
        if (VALID_POOLS.includes(msg.pool)) r.settings.pool = msg.pool;
        break;
      }
      case "set_drink": {
        if (!DRINKS[msg.drink]) return;
        me.drink = msg.drink;
        break;
      }
      case "set_visibility": {
        // 仅房主可切换公开/私密；private 桌不出现在大厅 /api/tables 的房码里
        if (!me.isHost) return;
        if (msg.visibility !== "public" && msg.visibility !== "private") return;
        r.visibility = msg.visibility;
        break;
      }
      case "kick": {
        if (!me.isHost) return;
        const idx = r.players.findIndex(
          (p) => p.token === msg.token && !p.isHost
        );
        if (idx < 0) return;
        const kicked = r.players[idx];
        for (const s of this.liveSockets(kicked.token)) {
          this.send(s, { type: "kicked" });
          try { s.close(4001, "kicked"); } catch {}
        }
        if (r.current?.penalties) delete r.current.penalties[kicked.token];
        if (Array.isArray(r.current?.drinking?.done)) {
          r.current.drinking.done = r.current.drinking.done.filter((t) => t !== kicked.token);
        }
        r.players.splice(idx, 1);
        this.onPresenceChanged();
        break;
      }
      case "start": {
        if (!me.isHost || r.phase !== "lobby") return;
        const seated = r.players.filter((p) => !p.left);
        // solo 房 1 人可开局（体验全流程）；正常房保持 2 人下限
        if (seated.length < (r.solo ? 1 : 2))
          return this.send(ws, { type: "error", msg: "至少 2 人才能开局" });
        // V2 协议：{module, pool, deck, rounds, noun, questions, kingQuestions}
        // 向后兼容：旧前端只发 {questions:[...]}，缺省 module=lover / pool=all
        if (typeof msg.module === "string" && msg.module) {
          r.settings.module = cleanUserText(msg.module, 20);
          if (typeof msg.moduleName === "string")
            r.settings.moduleName = cleanUserText(msg.moduleName, 20);
        }
        if (VALID_POOLS.includes(msg.pool)) r.settings.pool = msg.pool;
        if (DECK_NAMES[msg.deck]) {
          r.settings.deck = msg.deck;
          r.settings.deckName = DECK_NAMES[msg.deck];
        }
        {
          const n = Math.round(Number(msg.rounds));
          if (n >= 3 && n <= 8) r.settings.rounds = n;
        }
        if (msg.noun && typeof msg.noun === "object") {
          r.settings.noun = {
            m: cleanUserText(msg.noun.m, 10) || DEFAULT_NOUN.m,
            f: cleanUserText(msg.noun.f, 10) || DEFAULT_NOUN.f,
            n: cleanUserText(msg.noun.n, 10) || DEFAULT_NOUN.n,
          };
        }
        const qs = Array.isArray(msg.questions) ? msg.questions : [];
        if (!qs.length)
          return this.send(ws, { type: "error", msg: "题库为空，无法开局" });
        const roomPool = r.settings.pool || "all";
        r.questions = qs
          .slice(0, MAX_QUESTIONS)
          .filter((q) => q && q.id && (q.m || q.f || q.n))
          .map((q) => ({
            id: String(q.id).slice(0, 40),
            spice: Math.max(1, Math.min(5, Number(q.spice) || 1)),
            tags: Array.isArray(q.tags)
              ? q.tags.slice(0, 8).map((tag) => String(tag).slice(0, 20))
              : [],
            // 取向池：旧题库没有 pools 字段 → 视为 ["all"]
            pools: Array.isArray(q.pools) && q.pools.length
              ? q.pools.filter((pl) => VALID_POOLS.includes(pl)).slice(0, 5)
              : ["all"],
            m: String(q.m || q.n || q.f).slice(0, MAX_QUESTION_TEXT),
            f: String(q.f || q.n || q.m).slice(0, MAX_QUESTION_TEXT),
            n: String(q.n || q.m || q.f).slice(0, MAX_QUESTION_TEXT),
          }))
          // 池隔离：只留 pool 匹配或 all 的题，杜绝混池（房间 pool=all 则全收）
          .filter((q) =>
            roomPool === "all" || q.pools.includes("all") || q.pools.includes(roomPool)
          );
        if (!r.questions.length)
          return this.send(ws, { type: "error", msg: "题库格式不合法或该取向池无可用题，无法开局" });
        // 国王游戏题库（可选）：{id, text}
        r.kingQuestions = (Array.isArray(msg.kingQuestions) ? msg.kingQuestions : [])
          .slice(0, MAX_KING_QUESTIONS)
          .filter((q) => q && q.text)
          .map((q) => ({
            id: String(q.id || crypto.randomUUID()).slice(0, 40),
            text: String(q.text).slice(0, MAX_KING_TEXT),
          }));
        r.usedQuestionIds = [];
        this.pickProtagonist();
        break;
      }
      case "shake": {
        // 摇签强度转发（只有当前摇签人可发；节流由客户端负责，不落盘不广播全量 state）
        if (r.phase !== "picking" || r.current?.shaker !== token) return;
        const intensity = Math.max(0, Math.min(1, Number(msg.intensity) || 0));
        for (const s of this.ctx.getWebSockets()) {
          if (this.tokenOf(s) !== token)
            this.send(s, { type: "shake", intensity });
        }
        return; // 不 save 不 broadcast
      }
      case "draw_stick": {
        // 累计摇动达标（或降级点按达标）→ 弹签，亮出主角名
        if (r.phase !== "picking" || r.current?.shaker !== token) return;
        if (r.current.drawn) return;
        r.current.drawn = true;
        break;
      }
      case "stick_done": {
        // 抽签动画播完，进入主角设定（摇签人确认）
        if (r.phase !== "picking" || r.current?.shaker !== token) return;
        if (!r.current.drawn) return;
        r.phase = "protagonist_setup";
        break;
      }
      case "set_gender": {
        if (r.phase !== "protagonist_setup" || r.current?.protagonist !== token)
          return;
        if (!["m", "f", "n"].includes(msg.gender)) return;
        r.current.gender = msg.gender;
        this.drawQuestion();
        r.phase = "answering";
        break;
      }
      case "score": {
        if (r.phase !== "answering" || r.current?.protagonist !== token) return;
        const v = clamp010(msg.v);
        if (v == null) return;
        r.current.score = v;
        this.maybeReveal();
        break;
      }
      case "guess": {
        if (r.phase !== "answering" || !r.current) return;
        if (r.current.protagonist === token) return;
        const v = clamp010(msg.v);
        if (v == null) return;
        r.current.guesses[token] = v;
        this.maybeReveal();
        break;
      }
      case "assign_drink": {
        // 精确命中者指定一人喝（每次开牌每人一次）
        if (r.phase !== "reveal" || !r.current?.reveal) return;
        const myRes = r.current.reveal.results.find(
          (x) => x.name === me.name && x.exact && !x.assigned
        );
        if (!myRes) return;
        const target = r.players.find(
          (p) => p.name === msg.target && p.token !== token
        );
        if (!target) return;
        target.drinks++;
        if (!r.current.penalties) r.current.penalties = {};
        r.current.penalties[target.token] = (r.current.penalties[target.token] || 0) + 1;
        myRes.assigned = target.name;
        break;
      }
      case "comment": {
        if (r.phase !== "reveal" || r.current?.protagonist !== token) return;
        const t = String(msg.text || "").slice(0, 100);
        r.current.reveal.comment = t;
        // 补刀也记进 record
        const rec = r.current.records[r.current.records.length - 1];
        if (rec) rec.comment = t;
        break;
      }
      case "next": {
        if (!me.isHost) return;
        if (r.phase === "reveal") {
          const hasPenalty = Object.entries(r.current?.penalties || {})
            .some(([playerToken, cups]) => {
              const player = r.players.find((p) => p.token === playerToken);
              return this.isActive(player) && cups > 0;
            });
          if (hasPenalty) {
            r.current.drinking = { done: [], skipped: false };
            r.phase = "drinking";
          } else if (r.king?.active) {
            // 全员猜中触发的国王游戏：开牌页看完 → 进国王阶段
            r.phase = "king";
          } else this.advanceAfterReveal();
        } else if (r.phase === "drinking") {
          const view = this.drinkingView(r.current, token);
          if (!view.allDone && !view.skipped) {
            return this.send(ws, { type: "error", code: "drinks_pending", msg: "还有人没喝完" });
          }
          if (r.king?.active) r.phase = "king";
          else this.advanceAfterReveal();
        } else if (r.phase === "king") {
          if (r.king?.active) {
            return this.send(ws, { type: "error", code: "king_pending", msg: "国王还没下旨" });
          }
          r.king = null;
          this.advanceAfterReveal();
        } else if (r.phase === "aha") {
          const remaining = r.players.filter((p) => this.isActive(p) && !p.done);
          if (remaining.length && r.players.filter((p) => this.isActive(p)).length >= 2)
            this.pickProtagonist();
          else r.phase = "finished";
        }
        break;
      }
      case "force_next": {
        // 房主强制推进：无论卡在哪个阶段，直接推进到下一轮摇签
        // （打分未交齐的按未交处理；当前主角已有记录则先出结算快照）
        if (!me.isHost) return;
        if (r.phase === "lobby" || r.phase === "finished") return;
        r.king = null;
        if (r.phase !== "aha" && r.current?.records?.length) {
          // 已答过题的主角：结算入历史，不白玩
          this.buildAha();
        }
        const actives = r.players.filter((p) => this.isActive(p));
        const candidates = actives.filter((p) => !p.done);
        if (candidates.length && actives.length >= 2) this.pickProtagonist();
        else {
          r.current = null;
          r.phase = "finished";
        }
        this.emitPresence("force_next", me);
        break;
      }
      case "leave": {
        // 主动离场：lobby 直接撤座；局中标记 left（保留战绩），等待收集自动跳过
        if (r.phase === "lobby") {
          const idx = r.players.indexOf(me);
          if (idx >= 0) r.players.splice(idx, 1);
        } else {
          me.left = true;
          me.away = false;
        }
        me.connected = false;
        this.emitPresence("player_left", me);
        for (const s of this.liveSockets(token)) {
          this.send(s, { type: "left" });
          try { s.close(4003, "left"); } catch {}
        }
        // 房主离场 → 移交给最早加入的在线玩家
        if (me.isHost) this.transferHost(me);
        this.onPresenceChanged();
        // 局中人数不足 → 直接收局
        if (r.phase !== "lobby" && r.phase !== "finished") {
          const actives = r.players.filter((p) => this.isActive(p));
          if (actives.length < 2) {
            if (r.current?.records?.length && r.phase !== "aha") this.buildAha();
            r.current = null;
            r.king = null;
            r.phase = "finished";
          }
        }
        break;
      }
      case "king_pick": {
        // 国王游戏：国王从 3 道题里选 1
        if (r.phase !== "king" || !r.king?.active || r.king.kingToken !== token) return;
        const idx = Math.round(Number(msg.idx));
        const opt = r.king.options?.[idx];
        if (!opt) return;
        this.endKingGame({ text: opt.text, custom: false });
        break;
      }
      case "king_custom": {
        // 国王游戏：国王自己写圣旨（≤60 字）
        if (r.phase !== "king" || !r.king?.active || r.king.kingToken !== token) return;
        const text = cleanUserText(msg.text, 60);
        if (!text) return;
        this.endKingGame({ text, custom: true });
        break;
      }
      case "king_order": {
        // R2.5 每题国王：国王报号（不点人）。多国王按座次轮流，一人一组号+一张指令卡。
        const kc = r.current?.kingChance;
        if (!kc) return;
        if (!["reveal", "drinking", "king"].includes(r.phase)) return;
        if (kc.turnIdx >= kc.winners.length) return; // 全部报完
        // 必须轮到发送者（按座次轮流；发送者必须在 winners 里）
        if (me.id !== kc.winners[kc.turnIdx]) return;
        const nums = Array.isArray(msg.nums)
          ? msg.nums.map((n) => Math.round(Number(n)))
          : [];
        if (nums.length !== 2) return;
        const [a, b] = nums;
        // nums 互不相同、均在 1..N
        if (!Number.isInteger(a) || !Number.isInteger(b) || a === b) return;
        if (a < 1 || a > kc.seatCount || b < 1 || b > kc.seatCount) return;
        const orderId = cleanUserText(msg.orderId, 60);
        if (!orderId) return;
        // 指令卡校验：KING_ORDERS 来自 public/laok-lines.js（P 线交付）；文件缺失时不校验
        if (!(await kingOrderExists(orderId))) return;
        const nameOfSeat = (n) => {
          const pid = Object.keys(kc.seat).find((id) => kc.seat[id] === n);
          return r.players.find((p) => p.id === pid)?.name || null;
        };
        const result = {
          king: me.id,
          nums: [a, b],
          names: [nameOfSeat(a), nameOfSeat(b)], // 公布号背后是谁
          orderId,
          questionIdx: kc.questionIdx,
        };
        kc.results.push(result);
        kc.turnIdx += 1; // 轮到下一个 winner
        for (const s of this.ctx.getWebSockets()) {
          if (!this.tokenOf(s)) continue;
          this.send(s, { type: "king_result", ...result });
        }
        break;
      }
      case "drink_done": {
        if (r.phase !== "drinking" || !r.current?.drinking) return;
        if (!Number(r.current.penalties?.[token])) return;
        if (!r.current.drinking.done.includes(token)) r.current.drinking.done.push(token);
        break;
      }
      case "skip_drinking": {
        if (!me.isHost || r.phase !== "drinking" || !r.current?.drinking) return;
        r.current.drinking.skipped = true;
        r.current.drinking.done = Object.entries(r.current.penalties || {})
          .filter(([, cups]) => Number(cups) > 0)
          .map(([playerToken]) => playerToken);
        break;
      }
      case "finish_game": {
        if (!me.isHost) return;
        r.king = null;
        if (r.phase === "aha") r.phase = "finished";
        else if (r.phase !== "lobby" && r.phase !== "finished") {
          // 提前收局：给当前主角出结算（若已有记录），否则直接结束
          if (r.current?.records?.length) {
            this.buildAha();
            r.phase = "aha";
          } else {
            r.phase = "finished";
          }
        }
        break;
      }
      /* ---- 非诚勿扰互动体系（PRD §9）---- */
      case "chat": {
        // 聊天室：全程可用，服务端限长、去控制字符并限频。
        const text = cleanUserText(msg.text, SOCIAL.chatMaxLength);
        if (!text) return;
        const now = Date.now();
        if (!this.allowRate(ws, me, "lastChatAt", SOCIAL.chatCooldownMs, now)) return;
        me.lastChatAt = now;
        r.chat.push({
          id: ++r.chatSeq,
          name: me.name,
          emoji: me.emoji,
          text,
          ts: now,
          reactions: {},
        });
        if (r.chat.length > SOCIAL.chatHistoryLimit)
          r.chat.splice(0, r.chat.length - SOCIAL.chatHistoryLimit);
        break;
      }
      case "react": {
        // 飞书式贴 emoji：内部存 token；同人同 emoji 再点一次 = 取消。
        const cm = r.chat.find((c) => c.id === Number(msg.msgId));
        const em = String(msg.emoji || "").trim();
        if (!cm || !MESSAGE_REACTIONS.includes(em))
          return this.send(ws, { type: "error", code: "invalid_reaction", msg: "这个表情暂不支持" });
        const now = Date.now();
        if (!this.allowRate(ws, me, "lastMessageReactionAt", SOCIAL.messageReactionCooldownMs, now)) return;
        me.lastMessageReactionAt = now;
        if (!cm.reactions) cm.reactions = {};
        const list = cm.reactions[em] || (cm.reactions[em] = []);
        // 兼容旧存档中的玩家名数组；命中后迁移/取消。
        let i = list.indexOf(token);
        if (i < 0) i = list.indexOf(me.name);
        if (i >= 0) {
          list.splice(i, 1);
          if (!list.length) delete cm.reactions[em];
        } else {
          list.push(token);
        }
        break;
      }
      case "danmaku": {
        // 弹幕：aha 主战场，答题/开牌/收局同样开放；限长 30 字、限频 3s
        if (!["aha", "answering", "reveal", "drinking", "king", "finished"].includes(r.phase))
          return;
        const text = cleanUserText(msg.text, SOCIAL.danmakuMaxLength);
        if (!text) return;
        const now = Date.now();
        if (!this.allowRate(ws, me, "lastDanmakuAt", SOCIAL.danmakuCooldownMs, now)) return;
        me.lastDanmakuAt = now;
        const event = this.addSocialEvent("danmaku", me, { text }, now);
        for (const s of this.ctx.getWebSockets()) {
          if (!this.tokenOf(s)) continue; // 未入座的连接不该收到弹幕原文
          this.send(s, event);
        }
        await this.save(); // 落盘限频时间戳
        this.broadcast(); // recent 同步进每位玩家 state，重连与当前视图一致
        return; // 弹幕不落聊天记录、不全量广播 state
      }
      case "quick_reaction": {
        const reaction = String(msg.emoji || msg.reaction || "").trim();
        if (!QUICK_REACTIONS.includes(reaction))
          return this.send(ws, { type: "error", code: "invalid_reaction", msg: "这个快捷反应暂不支持" });
        const now = Date.now();
        if (!this.allowRate(ws, me, "lastQuickReactionAt", SOCIAL.quickReactionCooldownMs, now)) return;
        me.lastQuickReactionAt = now;
        const event = this.addSocialEvent("quick_reaction", me, { reaction }, now);
        for (const s of this.ctx.getWebSockets()) {
          if (!this.tokenOf(s)) continue; // 同上，匿名连接不广播
          this.send(s, event);
        }
        await this.save();
        this.broadcast();
        return;
      }
      case "light": {
        // R5：爆灯/灭灯只在 aha「理想型立绘亮相那一刻」（每题投灯已删）。
        // 每人一票、可在 aha 阶段改票，以最后一票为准。
        if (r.phase !== "aha" || !r.aha) return;
        // 多人局：主角不能给自己投；solo 局只有主角本人 → 放开自投（lightTotal 基数 1）。
        if (!r.solo && r.current && r.current.protagonist === token) return;
        const now = Date.now();
        if (!this.allowRate(ws, me, "lastLightAt", SOCIAL.lightCooldownMs, now)) return;
        me.lastLightAt = now;
        if (!r.aha.lights) r.aha.lights = {};
        const on = msg.vote === "burst" ? true : msg.vote === "off" ? false : !!msg.on;
        const previous = r.aha.lights[token];
        if (previous === on) return;
        r.aha.lights[token] = on;
        const burst = Object.values(r.aha.lights).filter(Boolean).length;
        const off = Object.values(r.aha.lights).length - burst;
        const total = r.aha.lightTotal || 0;
        r.aha.stats.lights = {
          burst,
          off,
          voted: burst + off,
          total,
          burstPct: total ? Math.round((burst / total) * 100) : 0,
        };
        this.syncCurrentAhaHistory();
        for (const s of this.ctx.getWebSockets()) {
          if (!this.tokenOf(s)) continue; // 匿名连接不该看到谁爆灯谁灭灯
          this.send(s, {
            type: "light_fx",
            name: me.name,
            emoji: me.emoji,
            on,
            vote: on ? "burst" : "off",
            changed: previous !== undefined,
          });
        }
        break;
      }
      default:
        return;
    }
    await this.save();
    this.broadcast();
  }

  allowRate(ws, player, field, cooldownMs, now = Date.now()) {
    const elapsed = now - (Number(player[field]) || 0);
    if (elapsed >= cooldownMs) return true;
    this.send(ws, {
      type: "error",
      code: "rate_limited",
      msg: "手速太快了，稍等一下",
      retryAfterMs: cooldownMs - elapsed,
    });
    return false;
  }

  addSocialEvent(type, player, payload, now = Date.now()) {
    const event = {
      type,
      id: ++this.room.socialSeq,
      name: player.name,
      emoji: player.emoji,
      ts: now,
      ...payload,
    };
    this.room.socialFeed.push(event);
    if (this.room.socialFeed.length > SOCIAL.recentEventLimit) {
      this.room.socialFeed.splice(0, this.room.socialFeed.length - SOCIAL.recentEventLimit);
    }
    return event;
  }

  syncCurrentAhaHistory() {
    const r = this.room;
    if (!r.aha || !r.ahaHistory.length) return;
    let index = r.ahaHistory.findIndex((item) => item.id && item.id === r.aha.id);
    // 旧存档没有 id 时，当前结算只可能对应最后一项。
    if (index < 0 && !r.ahaHistory[r.ahaHistory.length - 1]?.id)
      index = r.ahaHistory.length - 1;
    if (index >= 0) r.ahaHistory[index] = structuredClone(r.aha);
  }

  async onJoin(ws, msg) {
    const r = this.room;
    const name = String(msg.name || "").trim().slice(0, 12);
    const emoji = String(msg.emoji || "🍺").slice(0, 4);
    const drink = DRINKS[msg.drink] ? msg.drink : "beer";

    // 凭 token 回收座位（断线重连；主动离场者重连也允许回桌）
    if (msg.token) {
      const p = r.players.find((p) => p.token === msg.token);
      if (p) {
        p.connected = true;
        p.away = false;
        p.left = false;
        p.lastSeenAt = Date.now();
        p.drink = drink;
        if (GENDER_VALUES.includes(msg.seeking)) p.seeking = msg.seeking;
        // viewer 自身性别（隔离铁桶用：直女f vs 男同m、直男m vs 拉拉f）
        if (VIEWER_GENDERS.includes(msg.gender)) p.gender = msg.gender;
        ws.serializeAttachment({ token: p.token });
        this.send(ws, { type: "welcome", token: p.token, reconnected: true });
        this.onPresenceChanged();
        await this.save();
        this.broadcast();
        return;
      }
    }

    if (!name) return this.send(ws, { type: "error", msg: "昵称不能为空" });

    // 防占号：昵称房间内唯一
    if (r.players.some((p) => p.name === name)) {
      return this.send(ws, {
        type: "error",
        code: "name_taken",
        msg: `「${name}」已经在酒桌上了，换个昵称吧`,
      });
    }
    if (r.phase !== "lobby") {
      return this.send(ws, {
        type: "error",
        code: "game_started",
        msg: "这桌已经开喝了，下局再来",
      });
    }
    if (r.players.length >= 12) {
      return this.send(ws, { type: "error", msg: "这桌坐满了（12 人上限）" });
    }

    const token = crypto.randomUUID();
    const player = {
      token,
      id: crypto.randomUUID(), // 公开 id（踢人/每题国王/爆灯用；token 绝不外发）
      name,
      emoji,
      isHost: r.players.length === 0,
      connected: true,
      away: false,
      left: false,
      joinedAt: Date.now(),
      lastSeenAt: Date.now(),
      drinks: 0,
      know: 0,
      done: false,
      drink,
      // 想看的取向（注册档案透传）：aha 结算时传给 buildIdealProfile
      seeking: GENDER_VALUES.includes(msg.seeking) ? msg.seeking : null,
      // viewer 自身性别（隔离铁桶：直女/男同、直男/拉拉 靠此区分）
      gender: VIEWER_GENDERS.includes(msg.gender) ? msg.gender : null,
    };
    r.players.push(player);
    ws.serializeAttachment({ token });
    this.send(ws, { type: "welcome", token, reconnected: false });
    await this.save();
    this.broadcast();
  }

  /* ---- 游戏逻辑 ---- */

  pickProtagonist() {
    const r = this.room;
    const actives = r.players.filter((p) => this.isActive(p));
    const candidates = actives.filter((p) => !p.done);
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    // 摇签人：上一任主角（还在房、未离场）优先，否则房主
    const last = r.players.find((p) => p.token === r.lastProtagonist && this.isActive(p));
    const host = r.players.find((p) => p.isHost && !p.left);
    const shaker = (last || host || pick).token;
    r.current = {
      protagonist: pick.token,
      shaker,
      drawn: false,
      gender: null,
      roundIndex: 1,
      records: [],
      question: null,
      score: null,
      guesses: {},
      reveal: null,
      penalties: {},
      drinking: null,
      lights: {}, // 每题爆灯：playerId -> "burst"|"off"
      kingChance: null, // 每题国王机会 {winners, questionIdx, claimed}
    };
    r.aha = null;
    r.king = null;
    r.phase = "picking";
  }

  drawQuestion() {
    const r = this.room;
    const cur = r.current;
    const hero = r.players.find((p) => p.token === cur.protagonist);
    // 隔离铁桶（R4 §1.3）：先按主角(viewer) gender×seeking×卡组筛允许池，再池内去重抽题。
    const base = filterQuestionsForViewer(r.questions, r.deck, hero?.gender, hero?.seeking);
    const baseIds = new Set(base.map((q) => q.id));
    let pool = base.filter((q) => !r.usedQuestionIds.includes(q.id));
    if (!pool.length) {
      // 该 viewer 允许池抽干 → 只重置本池去重记录（不动其他池）
      r.usedQuestionIds = r.usedQuestionIds.filter((id) => !baseIds.has(id));
      pool = base.slice();
    }
    const q = pool[Math.floor(Math.random() * pool.length)];
    r.usedQuestionIds.push(q.id);
    // boss 卡组 gender=n → 主用 n 变体（TA），绝不默认男性；m/f 卡组用各自方向变体
    let g = cur.gender;
    let variant;
    if (g === "n") variant = q.n || q.m || q.f;
    else variant = g === "f" ? q.f : q.m;
    const noun = (r.settings.noun || DEFAULT_NOUN)[g] || DEFAULT_NOUN[g];
    cur.question = {
      id: q.id,
      spice: q.spice,
      tags: q.tags,
      variant,
      renderedGender: g,
      text: `这是一个${noun}，但是${variant}`,
    };
    cur.score = null;
    cur.guesses = {};
    cur.reveal = null;
    cur.penalties = {};
    cur.drinking = null;
    cur.lights = {};
    cur.kingChance = null;
  }

  maybeReveal() {
    const r = this.room;
    const cur = r.current;
    if (!cur.penalties) cur.penalties = {};
    if (cur.score == null) return;
    // 收集范围：在线且未离场未 away 的猜分人（离场/away 自动跳过不阻塞）
    const guessers = r.players.filter(
      (p) => p.token !== cur.protagonist && p.connected && this.isActive(p)
    );
    // solo 房：没有猜分人，主角自评即开牌（results 为空，走完整流程）
    if (guessers.length === 0 && !r.solo) return;
    if (!guessers.every((p) => cur.guesses[p.token] != null)) return;

    // 开牌判罚
    const results = [];
    for (const p of r.players) {
      if (p.token === cur.protagonist) continue;
      const g = cur.guesses[p.token];
      if (g == null) continue;
      const diff = Math.abs(g - cur.score);
      // 罚酒判定：|猜分-实际| ≥ 2 就罚（FEEDBACK-0729 #18，原阈值 3）
      const drink = diff >= 2;
      const exact = diff === 0;
      if (drink) p.drinks++;
      if (drink) cur.penalties[p.token] = (cur.penalties[p.token] || 0) + 1;
      if (exact) p.know++;
      results.push({ name: p.name, emoji: p.emoji, guess: g, diff, drink, exact });
    }
    // R2 每题国王：分毫不差者（公开 id）随 reveal 下发；非空 → 广播 king_chance
    const exactIds = results
      .filter((x) => x.exact)
      .map((x) => r.players.find((p) => p.name === x.name)?.id)
      .filter(Boolean);
    cur.reveal = {
      score: cur.score,
      question: cur.question.text,
      results,
      exact: exactIds,
      // 每题爆灯/灭灯（R2）：playerId -> "burst"|"off"，随 reveal 广播
      lights: cur.lights || {},
      comment: null,
    };
    cur.records.push({
      question: cur.question,
      score: cur.score,
      results,
      comment: null,
      // R3 字段契约：每题爆/灭灯快照 {voterId: "burst"|"off"}（reveal 阶段投票时增量同步）
      lights: { ...(cur.lights || {}) },
    });
    r.phase = "reveal";
    if (exactIds.length) {
      const questionIdx = cur.roundIndex - 1; // 0-based 题序
      // R2.5：给每个在座玩家发本轮匿名号（1..N，每题重洗）；只有本人从 state.you.seatNo 读到自己的号
      const seated = r.players.filter((p) => !p.left);
      const nums = Array.from({ length: seated.length }, (_, i) => i + 1);
      for (let i = nums.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [nums[i], nums[j]] = [nums[j], nums[i]];
      }
      const seat = {};
      seated.forEach((p, i) => { seat[p.id] = nums[i]; });
      const seatCount = seated.length;
      // winners 按座次有序（多人分毫不差 → 都当国王，按座次轮流报号）
      const winners = [...exactIds].sort((a, b) => (seat[a] || 0) - (seat[b] || 0));
      cur.kingChance = { winners, questionIdx, seat, seatCount, turnIdx: 0, results: [] };
      for (const s of this.ctx.getWebSockets()) {
        if (!this.tokenOf(s)) continue;
        this.send(s, { type: "king_chance", winners, questionIdx, seatCount });
      }
    }
    this.maybeStartKingGame(results);
  }

  /* ---- 国王游戏（全员差值 0 触发）---- */

  maybeStartKingGame(results) {
    const r = this.room;
    // 触发条件：本轮所有猜分与主角自评完全一致（差值 0），且题库带了国王题
    if (!results.length || !results.every((x) => x.exact)) return;
    if (!r.kingQuestions.length) return;
    const exactNames = results.map((x) => x.name);
    const candidates = r.players.filter(
      (p) => exactNames.includes(p.name) && this.isActive(p)
    );
    if (!candidates.length) return;
    const king = candidates[Math.floor(Math.random() * candidates.length)];
    // 服务端抽 3 道国王题发给国王
    const shuffled = [...r.kingQuestions].sort(() => Math.random() - 0.5);
    r.king = {
      active: true,
      kingToken: king.token,
      options: shuffled.slice(0, 3),
      picked: null,
      exactGuessers: exactNames,
    };
    // king_game 事件：全桌演出「酒保发牌」
    this.emitPresence("king_game", king, { exactGuessers: exactNames });
  }

  endKingGame(order) {
    const r = this.room;
    if (!r.king) return;
    if (order) {
      r.king.picked = order;
      r.king.active = false;
      const king = r.players.find((p) => p.token === r.king.kingToken);
      this.emitPresence("king_order", king, { text: order.text, custom: order.custom });
    } else {
      // 国王离场 → 游戏取消
      r.king = null;
      if (r.phase === "king") this.advanceAfterReveal();
    }
  }

  advanceAfterReveal() {
    const r = this.room;
    r.king = null;
    if (r.current.roundIndex >= r.settings.rounds) {
      this.buildAha();
      r.phase = "aha";
    } else {
      r.current.roundIndex++;
      this.drawQuestion();
      r.phase = "answering";
    }
  }

  /* ---- Aha 结算 ---- */

  buildAha() {
    const r = this.room;
    const cur = r.current;
    const hero = r.players.find((p) => p.token === cur.protagonist);
    if (!hero) return;
    hero.done = true;
    r.lastProtagonist = hero.token;
    // 多人局：票源=其他活跃玩家数；solo 局：主角本人自投，基数 1（R3）
    const lightTotal = r.solo
      ? 1
      : Math.max(0, r.players.filter((p) => this.isActive(p)).length - 1);

    const recs = cur.records;
    // R5：爆/灭灯只在 aha 一刻产生。此处初始化为空，待 aha 投票后由 light 处理器聚合。
    const tolerated = recs.filter((x) => x.score >= 7);
    const vetoed = recs.filter((x) => x.score <= 2);
    const avg =
      recs.reduce((s, x) => s + x.score, 0) / Math.max(1, recs.length);

    // 乙游理想型档案：答案只进入确定性画像模块，不把玩家昵称或自由文本送去生图。
    // seeking：主角注册档案里的「想看的取向」（join 时透传）；多传字段不破坏纯函数契约，
    // ideal-profile.js 消费该字段由 E 线程实现。
    const profile = buildIdealProfile({
      records: recs,
      genderPreference: cur.gender,
      seeking: hero.seeking || null,
      seed: `${r.code}:${r.ahaHistory.length}:${recs.map((rec) => `${rec.question.id}:${rec.score}`).join("|")}`,
    });

    // 称号 + 海报数据
    const title = TITLES.find((t) => avg >= t.min);
    const knowMap = {};
    for (const rec of recs) {
      for (const res of rec.results) {
        if (res.exact) knowMap[res.name] = (knowMap[res.name] || 0) + 1;
      }
    }
    const bestKnower =
      Object.entries(knowMap).sort((a, b) => b[1] - a[1])[0] || null;
    const drinkBoard = r.players
      .map((p) => ({ name: p.name, emoji: p.emoji, drinks: p.drinks }))
      .sort((a, b) => b.drinks - a.drinks);

    r.aha = {
      id: crypto.randomUUID(),
      protagonistToken: hero.token,
      lights: {}, // token -> true(爆灯)/false(灭灯)，视图层折算不外泄
      lightTotal,
      protagonist: this.pub(hero),
      gender: cur.gender,
      profile,
      prompt: profile.portrait.prompt,
      imageUrl: profile.portrait.imageUrl,
      details: profile.relationship.details,
      title: title.title,
      titleSub: title.sub,
      stats: {
        avgScore: Math.round(avg * 10) / 10,
        tolerancePct: Math.round((avg / 10) * 100),
        bestKnower: bestKnower ? { name: bestKnower[0], count: bestKnower[1] } : null,
        veto: vetoed[0] ? vetoed[0].question.text : null,
        tolerate: tolerated[0] ? tolerated[0].question.text : null,
        drinkBoard,
        rounds: recs.length,
        lights: {
          burst: 0,
          off: 0,
          voted: 0,
          total: lightTotal, // solo=1；多人=活跃人数-1
          burstPct: 0,
        },
      },
    };
    // 历史项必须是快照，避免下一位主角或后续灯票污染前一轮结算。
    r.ahaHistory.push(structuredClone(r.aha));
  }
}

function clamp010(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > 10) return null;
  return n;
}

function cleanUserText(value, maxLength) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim();
  return Array.from(text).slice(0, maxLength).join("").trim();
}
