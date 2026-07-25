// 满分男酒桌局 — Cloudflare Worker + Durable Object
// Worker 路由 + RoomDO（房间状态机 + WebSocket 广播）

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // 建房：POST /api/room  -> { code }
    if (url.pathname === "/api/room" && req.method === "POST") {
      for (let i = 0; i < 15; i++) {
        const code = String(Math.floor(1000 + Math.random() * 9000));
        const stub = env.ROOM.get(env.ROOM.idFromName(code));
        const res = await stub.fetch("https://do/create?code=" + code);
        if (res.ok) {
          return jsonRes({ code });
        }
      }
      return jsonRes({ error: "房间码分配失败，请重试" }, 503);
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

    return env.ASSETS.fetch(req);
  },
};

function jsonRes(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/* ============ 玩梗生成素材 ============ */

const TAG_VISUAL = {
  卫生: "slightly messy but endearing look",
  抠门: "holding a tiny coin purse",
  恋爱脑: "heart-shaped sparkles in the eyes",
  妈宝: "a phone with 99+ messages from mom",
  猎奇: "mysterious eccentric aura, odd accessories",
  网瘾: "gamer headphones around the neck",
  酒鬼: "holding a glass of amber whiskey",
  前任: "a faint nostalgic expression",
  味道: "surrounded by faint cartoon smell lines drawn cutely",
  谜之自信: "extremely confident smug smile",
  社死: "awkward but lovable smile",
  嘴臭: "sassy smirk",
};

const NAME_ADJ = {
  卫生: "五天一洗",
  抠门: "抠门界的",
  恋爱脑: "恋爱脑之光",
  妈宝: "妈宝限定版",
  猎奇: "赛百诺系",
  网瘾: "峡谷养成的",
  酒鬼: "微醺永动机",
  前任: "前任十级学者",
  味道: "自带气场的",
  谜之自信: "宇宙中心",
  社死: "大型社死现场",
  嘴臭: "嘴替本替",
  _default: "清汤锅里捞的",
};
const NAME_M = ["嘉豪", "彦祖", "阿强", "小龙虾王子", "麦当劳骑士", "赛博男友"];
const NAME_F = ["嘉欣", "貂蝉", "大女主", "小美", "霓虹女友", "酒馆之花"];

const TITLES = [
  { min: 7.5, title: "海纳百川·活菩萨", sub: "什么缺陷到你这都是可爱" },
  { min: 5.5, title: "薛定谔的心动", sub: "你的分数没人猜得透" },
  { min: 3.5, title: "铁面判官", sub: "满分男在你面前瑟瑟发抖" },
  { min: 0, title: "六亲不认·火化大队长", sub: "今晚火化名额已满" },
];

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
        if (!Array.isArray(this.room.chat)) this.room.chat = [];
        if (typeof this.room.chatSeq !== "number") this.room.chatSeq = 0;
      }
    });
  }

  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/create") {
      const active =
        this.room &&
        this.room.phase !== "finished" &&
        Date.now() - this.room.createdAt < 12 * 3600 * 1000 &&
        this.room.players.length > 0;
      if (active) return new Response("occupied", { status: 409 });
      this.room = this.freshRoom(url.searchParams.get("code"));
      await this.save();
      return new Response("ok");
    }

    if (url.pathname === "/info") {
      if (!this.room) return jsonRes({ exists: false }, 404);
      return jsonRes({
        exists: true,
        phase: this.room.phase,
        players: this.room.players.length,
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

  freshRoom(code) {
    return {
      code,
      createdAt: Date.now(),
      phase: "lobby",
      settings: { rounds: 5, deck: "qingtang", deckName: "清汤锅底" },
      players: [], // {token,name,emoji,isHost,connected,drinks,know,done}
      questions: [], // 开局时房主端下发（含 fallback 逻辑）
      usedQuestionIds: [],
      current: null, // 当前主角轮 {protagonist, gender, roundIndex, records[], question, scores, guesses, reveal}
      lastProtagonist: null, // 上一任主角 token（下一轮由 TA 摇签）
      ahaHistory: [],
      aha: null,
      chat: [], // 聊天室滚动记录（最近 100 条）{id,name,emoji,text,ts,reactions:{emoji:[names]}}
      chatSeq: 0,
    };
  }

  async save() {
    await this.ctx.storage.put("room", this.room);
  }

  /* ---- WS 生命周期（hibernation API）---- */

  async webSocketMessage(ws, raw) {
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
    if (token && this.room) {
      const p = this.room.players.find((p) => p.token === token);
      if (p && !this.liveSockets(token).length) {
        p.connected = false;
        await this.save();
        this.broadcast();
      }
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

  liveSockets(token) {
    return this.ctx
      .getWebSockets()
      .filter((s) => this.tokenOf(s) === token && s.readyState === 1);
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
      };
    }
    return {
      code: r.code,
      phase: r.phase,
      settings: r.settings,
      you: me ? { ...this.pub(me), token: me.token, isHost: me.isHost } : null,
      players: r.players.map((p) =>
        // 房主视角附带 token，用于踢人
        me?.isHost ? { ...this.pub(p), token: p.token } : this.pub(p)
      ),
      current: curView,
      aha:
        r.phase === "aha" || r.phase === "finished"
          ? this.ahaView(r.aha, token)
          : null,
      ahaHistory:
        r.phase === "finished"
          ? r.ahaHistory.map((a) => this.ahaView(a, token))
          : [],
      chat: r.chat,
    };
  }

  // aha 视图：不外泄 token→灯 的原始映射，折算成计数 + 你自己的灯
  ahaView(aha, token) {
    if (!aha) return null;
    const { lights, ...rest } = aha;
    const map = lights || {};
    const burst = Object.values(map).filter(Boolean).length;
    const off = Object.values(map).length - burst;
    return {
      ...rest,
      light: {
        burst,
        off,
        total: aha.lightTotal || 0,
        yours: map[token] === undefined ? null : map[token] ? "burst" : "off",
        burstNames: aha.lightNames ? aha.lightNames.burst : [],
        offNames: aha.lightNames ? aha.lightNames.off : [],
      },
    };
  }

  pub(p) {
    if (!p) return null;
    return {
      name: p.name,
      emoji: p.emoji,
      isHost: p.isHost,
      connected: p.connected,
      drinks: p.drinks,
      know: p.know,
      done: p.done,
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

    switch (msg.type) {
      case "set_settings": {
        if (!me.isHost || r.phase !== "lobby") return;
        const n = Math.round(Number(msg.rounds));
        if (n >= 3 && n <= 8) r.settings.rounds = n;
        if (typeof msg.deck === "string") r.settings.deck = msg.deck;
        if (typeof msg.deckName === "string") r.settings.deckName = msg.deckName;
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
        r.players.splice(idx, 1);
        break;
      }
      case "start": {
        if (!me.isHost || r.phase !== "lobby") return;
        if (r.players.length < 2)
          return this.send(ws, { type: "error", msg: "至少 2 人才能开局" });
        const qs = Array.isArray(msg.questions) ? msg.questions : [];
        if (!qs.length)
          return this.send(ws, { type: "error", msg: "题库为空，无法开局" });
        r.questions = qs
          .filter((q) => q && q.id && (q.m || q.f || q.n))
          .map((q) => ({
            id: String(q.id),
            spice: q.spice || 1,
            tags: Array.isArray(q.tags) ? q.tags : [],
            m: q.m || q.n || q.f,
            f: q.f || q.n || q.m,
            n: q.n || q.m || q.f,
          }));
        if (!r.questions.length)
          return this.send(ws, { type: "error", msg: "题库格式不合法，无法开局" });
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
          if (r.current.roundIndex >= r.settings.rounds) {
            this.buildAha();
            r.phase = "aha";
          } else {
            r.current.roundIndex++;
            this.drawQuestion();
            r.phase = "answering";
          }
        } else if (r.phase === "aha") {
          const remaining = r.players.filter((p) => !p.done);
          if (remaining.length) this.pickProtagonist();
          else r.phase = "finished";
        }
        break;
      }
      case "finish_game": {
        if (!me.isHost) return;
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
        // 聊天室：全程可用，轻限频防连点
        const text = String(msg.text || "").trim().slice(0, 120);
        if (!text) return;
        const now = Date.now();
        if (me.lastChatAt && now - me.lastChatAt < 600) return;
        me.lastChatAt = now;
        r.chat.push({
          id: ++r.chatSeq,
          name: me.name,
          emoji: me.emoji,
          text,
          ts: now,
          reactions: {},
        });
        if (r.chat.length > 100) r.chat.splice(0, r.chat.length - 100);
        break;
      }
      case "react": {
        // 飞书式贴 emoji 回应：同人同 emoji 再点一次 = 取消
        const cm = r.chat.find((c) => c.id === Number(msg.msgId));
        const em = String(msg.emoji || "").slice(0, 8).trim();
        if (!cm || !em) return;
        if (!cm.reactions) cm.reactions = {};
        const list = cm.reactions[em] || (cm.reactions[em] = []);
        const i = list.indexOf(me.name);
        if (i >= 0) {
          list.splice(i, 1);
          if (!list.length) delete cm.reactions[em];
        } else {
          list.push(me.name);
        }
        break;
      }
      case "danmaku": {
        // 弹幕：aha 主战场，答题/开牌/收局同样开放；限长 30 字、限频 3s
        if (!["aha", "answering", "reveal", "finished"].includes(r.phase))
          return;
        const text = String(msg.text || "").trim().slice(0, 30);
        if (!text) return;
        const now = Date.now();
        if (me.lastDanmakuAt && now - me.lastDanmakuAt < 3000)
          return this.send(ws, { type: "error", msg: "弹幕太密了，歇 3 秒再发" });
        me.lastDanmakuAt = now;
        for (const s of this.ctx.getWebSockets()) {
          this.send(s, { type: "danmaku", name: me.name, emoji: me.emoji, text });
        }
        await this.save(); // 落盘限频时间戳
        return; // 弹幕不落聊天记录、不全量广播 state
      }
      case "light": {
        // 爆灯/灭灯：aha 屏，主角以外每人一盏，一旦按下不可反悔（综艺规则）
        if (r.phase !== "aha" || !r.aha) return;
        if (r.current && r.current.protagonist === token) return;
        if (!r.aha.lights) {
          r.aha.lights = {};
          r.aha.lightNames = { burst: [], off: [] };
        }
        if (r.aha.lights[token] !== undefined) return;
        const on = !!msg.on;
        r.aha.lights[token] = on;
        r.aha.lightNames[on ? "burst" : "off"].push(me.name);
        // 海报数据：写入 stats
        const burst = Object.values(r.aha.lights).filter(Boolean).length;
        r.aha.stats.lights = { burst, total: r.aha.lightTotal };
        for (const s of this.ctx.getWebSockets()) {
          if (s !== ws) // 发起者本地已即时播放特效
            this.send(s, { type: "light_fx", name: me.name, emoji: me.emoji, on });
        }
        break;
      }
      default:
        return;
    }
    await this.save();
    this.broadcast();
  }

  async onJoin(ws, msg) {
    const r = this.room;
    const name = String(msg.name || "").trim().slice(0, 12);
    const emoji = String(msg.emoji || "🍺").slice(0, 4);

    // 凭 token 回收座位（断线重连）
    if (msg.token) {
      const p = r.players.find((p) => p.token === msg.token);
      if (p) {
        p.connected = true;
        ws.serializeAttachment({ token: p.token });
        this.send(ws, { type: "welcome", token: p.token, reconnected: true });
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
      name,
      emoji,
      isHost: r.players.length === 0,
      connected: true,
      drinks: 0,
      know: 0,
      done: false,
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
    const candidates = r.players.filter((p) => !p.done);
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    // 摇签人：上一任主角（还在房且未被踢）优先，否则房主
    const last = r.players.find((p) => p.token === r.lastProtagonist);
    const host = r.players.find((p) => p.isHost);
    const shaker = (last || host).token;
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
    };
    r.aha = null;
    r.phase = "picking";
  }

  drawQuestion() {
    const r = this.room;
    const cur = r.current;
    let pool = r.questions.filter((q) => !r.usedQuestionIds.includes(q.id));
    if (!pool.length) {
      // 题库抽干了就重置去重池（极端情况兜底）
      r.usedQuestionIds = [];
      pool = r.questions.slice();
    }
    const q = pool[Math.floor(Math.random() * pool.length)];
    r.usedQuestionIds.push(q.id);
    let g = cur.gender;
    if (g === "n") g = Math.random() < 0.5 ? "m" : "f";
    const variant = g === "f" ? q.f : q.m;
    const noun = g === "f" ? "满分女" : "满分男";
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
  }

  maybeReveal() {
    const r = this.room;
    const cur = r.current;
    if (cur.score == null) return;
    const guessers = r.players.filter(
      (p) => p.token !== cur.protagonist && p.connected
    );
    const allIn = guessers.every((p) => cur.guesses[p.token] != null);
    if (!allIn || guessers.length === 0) return;

    // 开牌判罚
    const results = [];
    for (const p of r.players) {
      if (p.token === cur.protagonist) continue;
      const g = cur.guesses[p.token];
      if (g == null) continue;
      const diff = Math.abs(g - cur.score);
      const drink = diff >= 3;
      const exact = diff === 0;
      if (drink) p.drinks++;
      if (exact) p.know++;
      results.push({ name: p.name, emoji: p.emoji, guess: g, diff, drink, exact });
    }
    cur.reveal = {
      score: cur.score,
      question: cur.question.text,
      results,
      comment: null,
    };
    cur.records.push({
      question: cur.question,
      score: cur.score,
      results,
      comment: null,
    });
    r.phase = "reveal";
  }

  /* ---- Aha 结算 ---- */

  buildAha() {
    const r = this.room;
    const cur = r.current;
    const hero = r.players.find((p) => p.token === cur.protagonist);
    hero.done = true;
    r.lastProtagonist = hero.token;

    const recs = cur.records;
    const tolerated = recs.filter((x) => x.score >= 7);
    const vetoed = recs.filter((x) => x.score <= 2);
    const avg =
      recs.reduce((s, x) => s + x.score, 0) / Math.max(1, recs.length);

    // tags 聚合（按打分加权：高分=容忍此 tag）
    const tagScore = {};
    for (const rec of recs) {
      for (const t of rec.question.tags || []) {
        tagScore[t] = (tagScore[t] || 0) + rec.score;
      }
    }
    const topTags = Object.entries(tagScore)
      .sort((a, b) => b[1] - a[1])
      .map(([t]) => t);

    // 立绘 prompt（英文）
    const gword =
      cur.gender === "f" ? "woman" : cur.gender === "m" ? "man" : "androgynous person";
    const visuals = topTags
      .slice(0, 3)
      .map((t) => TAG_VISUAL[t])
      .filter(Boolean);
    const prompt = [
      `beautiful detailed anime illustration, waist-up portrait of a charming ${gword}`,
      `sitting at a bright sunlit cafe terrace at golden hour, warm cream and peach tones, vivid pop-color accents, cheerful airy atmosphere`,
      ...visuals,
      `stylish, expressive face, cinematic glow, high quality, no text`,
    ].join(", ");
    const imageUrl =
      "https://image.pollinations.ai/prompt/" +
      encodeURIComponent(prompt) +
      "?width=768&height=1024&nologo=true";

    // 玩梗起名
    const adj = NAME_ADJ[topTags[0]] || NAME_ADJ._default;
    const pool =
      cur.gender === "f" ? NAME_F : cur.gender === "m" ? NAME_M : NAME_M.concat(NAME_F);
    const idolName = adj + pool[Math.floor(Math.random() * pool.length)];

    // 相处细节（3-5 条，容忍/否决驱动）
    const ta = "TA";
    const details = [];
    for (const t of tolerated.slice(0, 2)) {
      details.push(
        `${ta}${t.question.variant}。你给了 ${t.score} 分——恭喜，你们已经跳过恋爱最难的一关，直接进入互相纵容环节。`
      );
    }
    for (const v of vetoed.slice(0, 2)) {
      details.push(
        `第一次约会 ${ta} 差点暴露「${v.question.variant}」这件事，被你 ${v.score} 分当场火化。${ta} 现在提起这事还要喝三杯压惊。`
      );
    }
    if (topTags[0]) {
      details.push(
        `你们的日常：一半时间在为「${topTags[0]}」相关问题斗智斗勇，另一半时间在酒桌上跟朋友吹嘘对方多完美。`
      );
    }
    while (details.length < 3) {
      details.push(
        `${ta} 唯一的缺点是完美得不像话，朋友都劝你先干为敬，冷静一下。`
      );
    }

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
      lights: {}, // token -> true(爆灯)/false(灭灯)，视图层折算不外泄
      lightNames: { burst: [], off: [] },
      lightTotal: r.players.length - 1,
      protagonist: this.pub(hero),
      gender: cur.gender,
      prompt,
      imageUrl,
      idolName,
      details: details.slice(0, 5),
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
        lights: { burst: 0, total: r.players.length - 1 },
      },
    };
    r.ahaHistory.push(r.aha);
  }
}

function clamp010(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0 || n > 10) return null;
  return n;
}
