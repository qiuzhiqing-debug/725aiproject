// 满分男 · 最小埋点存储层（PRD-R9-PHASE1 §五）
// ─────────────────────────────────────────────────────────────────────────────
// 为什么是 DO+SQLite 而不是 KV：H1 要算「完局率」，分子分母都是并发累加的计数器，
// KV 的 read-modify-write 会丢写；单例 Durable Object 天然串行，SQLite 的
// `ON CONFLICT DO UPDATE SET n = n + 1` 是一条语句内的原子累加。
//
// 只埋六个事件，够 H1（完局率 ≥75% / 复开率）用，不多埋：
//   room_created / player_joined / game_started / game_finished / poster_shared / register_done
//
// 隐私：房间码只存 SHA-256 截断哈希（16 hex），明文 4 位码永不落库。
// ─────────────────────────────────────────────────────────────────────────────

/** 事件白名单。白名单外的 event → /api/track 返回 400（防止埋点表被脏数据撑爆）。 */
export const TRACK_EVENTS = Object.freeze([
  "room_created",
  "player_joined",
  "game_started",
  "game_finished",
  "poster_shared",
  "register_done",
]);

const TRACK_EVENT_SET = new Set(TRACK_EVENTS);
export function isTrackEvent(event) {
  return TRACK_EVENT_SET.has(event);
}

const DAY_MS = 86400000;
// 中国无夏令时，Asia/Shanghai 恒为 UTC+8 → 直接偏移比 Intl 更快也更可测。
const SHANGHAI_OFFSET_MS = 8 * 3600 * 1000;

/** 时间戳 → Asia/Shanghai 的 YYYY-MM-DD（酒桌是晚上的生意，日界必须按本地算）。 */
export function shanghaiDay(ts = Date.now()) {
  return new Date(ts + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

/** YYYY-MM-DD 加减天数。按 UTC 正午做算术，避开任何时区/闰秒边界抖动。 */
export function shiftDay(day, delta) {
  return new Date(Date.parse(day + "T12:00:00Z") + delta * DAY_MS).toISOString().slice(0, 10);
}

/** 返回 [最早 … 今天] 共 n 天的升序日期数组。 */
export function dayRange(n, today = shanghaiDay()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(shiftDay(today, -i));
  return out;
}

/** 房间码 → SHA-256 前 16 位十六进制（只为去重，不为还原；明文不落库）。 */
export async function hashRoomCode(code) {
  const raw = String(code ?? "").trim();
  if (!raw) return null;
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("room:" + raw));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

/** 单例 StatsDO stub（全站一个实例，串行写，够用且最省钱）。 */
export function statsStub(env) {
  if (!env || !env.STATS) return null; // 未绑定 STATS（如老 wrangler.jsonc）→ 埋点整体静默降级
  return env.STATS.get(env.STATS.idFromName("global"));
}

/**
 * 写一条埋点。绝不 throw：任何失败都在这里被吞掉，调用方不需要 try/catch。
 * @returns {Promise<{counted:boolean}>} counted=false 表示被去重或写失败。
 */
export async function trackEvent(env, event, opts = {}) {
  try {
    if (!isTrackEvent(event)) return { counted: false };
    const stub = statsStub(env);
    if (!stub) return { counted: false };
    const codeHash = opts.codeHash || (await hashRoomCode(opts.roomCode));
    const res = await stub.fetch("https://stats/hit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event,
        codeHash,
        players: Number.isFinite(Number(opts.players)) ? Math.max(0, Math.round(Number(opts.players))) : null,
        solo: opts.solo === true,
      }),
    });
    if (!res.ok) return { counted: false };
    return await res.json();
  } catch {
    return { counted: false };
  }
}

/* ---- R10 §4.1 用户反馈 ---- */
export const FEEDBACK_TEXT_MAX = 500; // 正文上限（字）
export const FEEDBACK_CONTACT_MAX = 100; // 联系方式上限（字）
export const FEEDBACK_COOLDOWN_MS = 60 * 1000; // 同 IP / 同房 1 分钟 1 条
export const FEEDBACK_RECENT_LIMIT = 20; // /api/stats 回带最近 N 条

/**
 * 写一条反馈。返回 {ok} / {ok:false, limited:true, retryAfterMs} / {ok:false, reason}。
 * 与 trackEvent 一样绝不 throw：反馈写不进去也不该炸接口。
 */
export async function submitFeedback(env, { text, contact = "", senderHash = null } = {}) {
  try {
    const stub = statsStub(env);
    if (!stub) return { ok: false, reason: "unavailable" };
    const res = await stub.fetch("https://stats/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, contact, senderHash }),
    });
    if (!res.ok) return { ok: false, reason: "write_failed" };
    return await res.json();
  } catch {
    return { ok: false, reason: "write_failed" };
  }
}

/** 读仪表盘数据。失败返回 null，由调用方决定怎么回。 */
export async function readStats(env, days) {
  const stub = statsStub(env);
  if (!stub) return null;
  const res = await stub.fetch(`https://stats/read?days=${days}`);
  if (!res.ok) return null;
  return await res.json();
}

/* ============================================================
   StatsDO —— 单例计数器
   events(day, event, n)                    按日按事件的原子累加
   rooms(code_hash, day, players, finished)  房级去重：同房 game_finished 只记一次
   ============================================================ */
export class StatsDO {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.sql = ctx.storage.sql;
    // sql.exec 是同步的，建表放构造函数里最省事；IF NOT EXISTS 保证幂等。
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS events (day TEXT, event TEXT, n INTEGER, PRIMARY KEY(day, event))"
    );
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS rooms (code_hash TEXT PRIMARY KEY, day TEXT, players INTEGER, finished INTEGER)"
    );
    // R10 §4.1：用户反馈。sender = 限频用的 SHA-256 截断哈希（同 IP/同房），明文永不落库。
    this.sql.exec(
      "CREATE TABLE IF NOT EXISTS feedbacks (ts INTEGER, day TEXT, text TEXT, contact TEXT, sender TEXT)"
    );
    this.sql.exec("CREATE INDEX IF NOT EXISTS feedbacks_sender_ts ON feedbacks (sender, ts)");
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/hit" && req.method === "POST") {
      let body = {};
      try { body = await req.json(); } catch {}
      return jsonRes(this.hit(body));
    }
    if (url.pathname === "/feedback" && req.method === "POST") {
      let body = {};
      try { body = await req.json(); } catch {}
      return jsonRes(this.feedback(body));
    }
    if (url.pathname === "/read") {
      const days = clampDays(url.searchParams.get("days"));
      return jsonRes(this.read(days));
    }
    return new Response("not found", { status: 404 });
  }

  bump(day, event) {
    this.sql.exec(
      "INSERT INTO events (day, event, n) VALUES (?, ?, 1) ON CONFLICT(day, event) DO UPDATE SET n = n + 1",
      day,
      event
    );
  }

  /**
   * 记一条事件。返回 {counted}。
   * 去重策略（只有 game_finished 需要，其余记录点本身就唯一）：
   *  - room_created：upsert rooms 行并把 finished 重置为 0。4 位房间码 12h 后会被回收复用，
   *    重置保证「同一个码的下一局」还能正常记完局，不会被上一局的 finished=1 挡掉。
   *  - game_finished：rooms.finished 已是 1 → 直接返回 counted:false，events 不加。
   *    这样服务端 DO 多次进 aha/finished、或客户端重发，都只算一桌。
   */
  hit(body) {
    const event = body && body.event;
    if (!isTrackEvent(event)) return { counted: false, reason: "bad_event" };
    const day = shanghaiDay();
    const codeHash = typeof body.codeHash === "string" && body.codeHash ? body.codeHash.slice(0, 32) : null;
    const players = Number.isFinite(Number(body.players)) ? Math.max(0, Math.round(Number(body.players))) : 0;

    if (event === "room_created" && codeHash) {
      this.sql.exec(
        "INSERT INTO rooms (code_hash, day, players, finished) VALUES (?, ?, ?, 0) " +
          "ON CONFLICT(code_hash) DO UPDATE SET day = excluded.day, players = excluded.players, finished = 0",
        codeHash,
        day,
        players
      );
    } else if (event === "player_joined" && codeHash) {
      // 记录这桌的人数峰值（复开率/桌均人数用），不参与去重。
      this.sql.exec(
        "INSERT INTO rooms (code_hash, day, players, finished) VALUES (?, ?, ?, 0) " +
          "ON CONFLICT(code_hash) DO UPDATE SET players = MAX(COALESCE(rooms.players, 0), ?)",
        codeHash,
        day,
        players,
        players
      );
    } else if (event === "game_finished" && codeHash) {
      const prev = this.sql.exec("SELECT finished FROM rooms WHERE code_hash = ?", codeHash).toArray()[0];
      if (prev && Number(prev.finished) === 1) return { counted: false, reason: "dup_room" };
      this.sql.exec(
        "INSERT INTO rooms (code_hash, day, players, finished) VALUES (?, ?, ?, 1) " +
          "ON CONFLICT(code_hash) DO UPDATE SET finished = 1, players = MAX(COALESCE(rooms.players, 0), ?)",
        codeHash,
        day,
        players,
        players
      );
    }

    this.bump(day, event);
    return { counted: true };
  }

  /**
   * 落一条反馈（R10 §4.1）。限频从简：同一个 sender（同 IP 或同房）1 分钟 1 条。
   * 单例 DO 串行执行，读-判-写之间不会有并发穿插。
   */
  feedback(body) {
    const text = typeof body?.text === "string" ? body.text.slice(0, FEEDBACK_TEXT_MAX) : "";
    if (!text.trim()) return { ok: false, reason: "empty" };
    const contact =
      typeof body.contact === "string" ? body.contact.slice(0, FEEDBACK_CONTACT_MAX) : "";
    const sender =
      typeof body.senderHash === "string" && body.senderHash ? body.senderHash.slice(0, 32) : null;
    const now = Date.now();
    if (sender) {
      const prev = this.sql
        .exec("SELECT MAX(ts) AS ts FROM feedbacks WHERE sender = ?", sender)
        .toArray()[0];
      const last = Number(prev?.ts) || 0;
      const elapsed = now - last;
      if (last && elapsed < FEEDBACK_COOLDOWN_MS) {
        return { ok: false, limited: true, retryAfterMs: FEEDBACK_COOLDOWN_MS - elapsed };
      }
    }
    this.sql.exec(
      "INSERT INTO feedbacks (ts, day, text, contact, sender) VALUES (?, ?, ?, ?, ?)",
      now,
      shanghaiDay(now),
      text,
      contact,
      sender
    );
    return { ok: true };
  }

  /** 最近 N 条反馈（只给带 key 的 /api/stats 看；sender 哈希不外发）。 */
  recentFeedbacks(limit = FEEDBACK_RECENT_LIMIT) {
    try {
      return this.sql
        .exec("SELECT ts, day, text, contact FROM feedbacks ORDER BY ts DESC LIMIT ?", limit)
        .toArray()
        .map((row) => ({
          ts: Number(row.ts) || 0,
          day: row.day,
          text: row.text || "",
          contact: row.contact || "",
        }));
    } catch {
      return [];
    }
  }

  /** 取最近 N 天（含今天）的按日明细 + 周汇总。 */
  read(days) {
    const today = shanghaiDay();
    // 汇总永远看满 14 天（本周 7 + 上周 7），跟 days 参数无关。
    const span = Math.max(days, 14);
    const from = shiftDay(today, -(span - 1));
    const rows = this.sql.exec("SELECT day, event, n FROM events WHERE day >= ? AND day <= ?", from, today).toArray();

    const byDay = new Map();
    for (const row of rows) {
      if (!byDay.has(row.day)) byDay.set(row.day, {});
      byDay.get(row.day)[row.event] = Number(row.n) || 0;
    }
    const dayCell = (day) => {
      const c = byDay.get(day) || {};
      const started = c.game_started || 0;
      const finished = c.game_finished || 0;
      return {
        day,
        room_created: c.room_created || 0,
        game_started: started,
        game_finished: finished,
        // 完局率 = 完局桌数 / 开局桌数（开了局才谈得上完不完；开桌→开局的流失单独看 room_created）
        finish_rate: started > 0 ? finished / started : null,
        player_joined: c.player_joined || 0,
        poster_shared: c.poster_shared || 0,
        register_done: c.register_done || 0,
      };
    };

    const daily = dayRange(days, today).map(dayCell);
    const last14 = dayRange(14, today).map(dayCell);
    const sum = (list, key) => list.reduce((acc, d) => acc + d[key], 0);

    const week = last14.slice(7); // 最近 7 天（含今天）
    const prevWeek = last14.slice(0, 7); // 再往前 7 天
    const started14 = sum(last14, "game_started");
    const finished14 = sum(last14, "game_finished");

    return {
      today,
      days,
      daily,
      // R10：Kim 在看板上直接读用户反馈（/api/stats 本身已由 key 保护）
      recent_feedbacks: this.recentFeedbacks(),
      summary: {
        week_finished: sum(week, "game_finished"),
        prev_week_finished: sum(prevWeek, "game_finished"),
        // PRD §五 原文口径别名，方便别的消费方直接按中文键读
        本周完局桌数: sum(week, "game_finished"),
        上周完局桌数: sum(prevWeek, "game_finished"),
        week_started: sum(week, "game_started"),
        week_created: sum(week, "room_created"),
        room_created_14d: sum(last14, "room_created"),
        game_started_14d: started14,
        game_finished_14d: finished14,
        finish_rate_14d: started14 > 0 ? finished14 / started14 : null,
        player_joined_14d: sum(last14, "player_joined"),
        poster_shared_14d: sum(last14, "poster_shared"),
        register_done_14d: sum(last14, "register_done"),
        // H1 达标线：完局率 ≥ 75%（Kim 拍板，原 60% 作废）
        target_finish_rate: 0.75,
      },
    };
  }
}

export function clampDays(raw) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return 14;
  return Math.min(90, Math.max(1, n));
}

function jsonRes(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
