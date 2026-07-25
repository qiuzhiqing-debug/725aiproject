// fx.js — WebAudio 纯合成音效 + 摇一摇（devicemotion）检测
// 零外部音频资源。AudioContext 必须在用户手势里 resume。

/* ================= 音效 ================= */

const SOUND_KEY = "mfn_sound";
let actx = null;
let noiseBuf = null;

function ensureCtx() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    actx = new AC();
    // 预生成 0.5s 白噪声 buffer，竹签哗啦声的原料
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.5, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return actx;
}

export const sound = {
  get enabled() {
    return localStorage.getItem(SOUND_KEY) !== "0";
  },
  toggle() {
    localStorage.setItem(SOUND_KEY, this.enabled ? "0" : "1");
    return this.enabled;
  },
  // 必须在用户手势回调里调用一次
  unlock() {
    const c = ensureCtx();
    if (c && c.state === "suspended") c.resume().catch(() => {});
  },

  // 竹签哗啦声：短脆响簇（噪声 + 带通），密度随摇动强度
  _lastRattle: 0,
  rattle(intensity) {
    if (!this.enabled) return;
    const c = ensureCtx();
    if (!c || c.state !== "running") return;
    const now = performance.now();
    // 强度越大，允许的触发间隔越短（40ms ~ 180ms）
    const gap = 180 - 140 * Math.min(1, intensity);
    if (now - this._lastRattle < gap) return;
    this._lastRattle = now;
    const n = 1 + Math.floor(intensity * 3); // 每簇 1-4 声
    for (let i = 0; i < n; i++) {
      const t = c.currentTime + i * (0.018 + Math.random() * 0.03);
      const src = c.createBufferSource();
      src.buffer = noiseBuf;
      src.playbackRate.value = 0.8 + Math.random() * 0.7;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1800 + Math.random() * 2600; // 竹木脆响频段
      bp.Q.value = 6 + Math.random() * 6;
      const g = c.createGain();
      const vol = (0.12 + 0.25 * intensity) * (0.6 + Math.random() * 0.4);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
      src.connect(bp).connect(g).connect(c.destination);
      src.start(t, Math.random() * 0.3, 0.06);
    }
  },

  // 出签瞬间：清脆一声「嗒」
  tick() {
    if (!this.enabled) return;
    const c = ensureCtx();
    if (!c || c.state !== "running") return;
    const t = c.currentTime;
    // 高频木鱼质感：短噪声 click + 快衰减正弦
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 5200;
    bp.Q.value = 3;
    const g1 = c.createGain();
    g1.gain.setValueAtTime(0.5, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    src.connect(bp).connect(g1).connect(c.destination);
    src.start(t, 0.1, 0.04);
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.08);
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.35, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(g2).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.12);
  },

  // 爆灯璀璨音：上行五声音阶琶音 + 高频 shimmer 噪声尾巴（原创合成）
  burst() {
    if (!this.enabled) return;
    const c = ensureCtx();
    if (!c || c.state !== "running") return;
    const t0 = c.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5 E5 G5 C6 E6
    notes.forEach((f, i) => {
      const t = t0 + i * 0.07;
      const osc = c.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.28, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(g).connect(c.destination);
      osc.start(t);
      osc.stop(t + 0.55);
    });
    // shimmer：高通白噪扫尾
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6500;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0 + 0.2);
    g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.32);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.0);
    src.connect(hp).connect(g).connect(c.destination);
    src.start(t0 + 0.2);
    src.stop(t0 + 1.05);
  },

  // 灭灯哔：低频方波短鸣 + 下坠，节目失败音质感
  buzz() {
    if (!this.enabled) return;
    const c = ensureCtx();
    if (!c || c.state !== "running") return;
    const t = c.currentTime;
    const osc = c.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(196, t);
    osc.frequency.exponentialRampToValueAtTime(82, t + 0.3);
    const g = c.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.setValueAtTime(0.22, t + 0.18);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    osc.connect(lp).connect(g).connect(c.destination);
    osc.start(t);
    osc.stop(t + 0.36);
  },

  // 理想型入场 riff：短促合成小连复段（原创，无版权素材）
  riff() {
    if (!this.enabled) return;
    const c = ensureCtx();
    if (!c || c.state !== "running") return;
    const t0 = c.currentTime;
    // 旋律：A4 C5 E5 A5 G5（带一点点摇摆）
    const mel = [
      [440, 0, 0.14], [523.25, 0.15, 0.14], [659.25, 0.3, 0.14],
      [880, 0.46, 0.22], [783.99, 0.72, 0.3],
    ];
    for (const [f, dt, dur] of mel) {
      const t = t0 + dt;
      const osc = c.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(2600, t);
      lp.frequency.exponentialRampToValueAtTime(900, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.08);
      osc.connect(lp).connect(g).connect(c.destination);
      osc.start(t);
      osc.stop(t + dur + 0.1);
    }
    // 低音垫：A2 两拍
    const bass = c.createOscillator();
    bass.type = "triangle";
    bass.frequency.value = 110;
    const bg = c.createGain();
    bg.gain.setValueAtTime(0.0001, t0);
    bg.gain.exponentialRampToValueAtTime(0.14, t0 + 0.04);
    bg.gain.exponentialRampToValueAtTime(0.001, t0 + 1.1);
    bass.connect(bg).connect(c.destination);
    bass.start(t0);
    bass.stop(t0 + 1.15);
  },

  // 罚酒仪式三拍：低鼓 + 杯沿脆响，原创合成，不加载外部音频。
  chug() {
    if (!this.enabled) return;
    const c = ensureCtx();
    if (!c || c.state !== "running") return;
    const t0 = c.currentTime;
    [0, 0.32, 0.64].forEach((dt, index) => {
      const t = t0 + dt;
      const bass = c.createOscillator();
      bass.type = "sine";
      bass.frequency.setValueAtTime(index === 2 ? 104 : 88, t);
      bass.frequency.exponentialRampToValueAtTime(48, t + 0.18);
      const bassGain = c.createGain();
      bassGain.gain.setValueAtTime(0.34, t);
      bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      bass.connect(bassGain).connect(c.destination);
      bass.start(t);
      bass.stop(t + 0.24);

      const rim = c.createOscillator();
      rim.type = "triangle";
      rim.frequency.setValueAtTime(index === 2 ? 1568 : 1174, t + 0.02);
      const rimGain = c.createGain();
      rimGain.gain.setValueAtTime(0.16, t + 0.02);
      rimGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      rim.connect(rimGain).connect(c.destination);
      rim.start(t + 0.02);
      rim.stop(t + 0.1);
    });
  },
};

/* ================= 高光粒子（纯 DOM/CSS，无外部资源） ================= */

/* 彩带配色真源：public/theme.css 的 --fx-confetti-1..5。
   样式同事改 theme.css 彩带就换色，读不到时回退到默认值。 */
const CONFETTI_FALLBACK = ["#ff4081", "#ffb84d", "#ff77a9", "#fff3e0", "#ff7a45"];
let confettiCache = null;

function confettiColors() {
  if (confettiCache) return confettiCache;
  let cs = null;
  try {
    cs = getComputedStyle(document.documentElement);
  } catch {
    cs = null;
  }
  confettiCache = CONFETTI_FALLBACK.map((def, i) => {
    const v = cs ? String(cs.getPropertyValue(`--fx-confetti-${i + 1}`) || "").trim() : "";
    return v || def;
  });
  return confettiCache;
}

// 精确命中高光：全屏彩带 + 酒杯碰撞粒子，~600ms 后自清理
export function celebrate() {
  const layer = document.createElement("div");
  layer.className = "fx-layer";
  const colors = confettiColors();
  for (let i = 0; i < 36; i++) {
    const c = document.createElement("i");
    c.className = "confetti";
    c.style.left = Math.random() * 100 + "vw";
    c.style.background = colors[i % colors.length];
    c.style.setProperty("--dx", (Math.random() - 0.5) * 120 + "px");
    c.style.setProperty("--dy", 55 + Math.random() * 40 + "vh");
    c.style.setProperty("--rot", 300 + Math.random() * 500 + "deg");
    c.style.animationDelay = Math.random() * 0.12 + "s";
    layer.appendChild(c);
  }
  // 中心酒杯碰撞：🥂 炸开
  const cx = innerWidth / 2, cy = innerHeight * 0.4;
  for (let i = 0; i < 8; i++) {
    const g = document.createElement("span");
    g.className = "cheer";
    g.textContent = i % 2 ? "🥂" : "🍻";
    g.style.left = cx - 15 + "px";
    g.style.top = cy - 15 + "px";
    const ang = (i / 8) * Math.PI * 2;
    g.style.setProperty("--dx", Math.cos(ang) * (70 + Math.random() * 50) + "px");
    g.style.setProperty("--dy", Math.sin(ang) * (60 + Math.random() * 40) + "px");
    layer.appendChild(g);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 850);
}

// 爆灯全屏心动光效：径向光晕 + 飞心粒子，~1.1s 自清理
export function heartBurst() {
  const layer = document.createElement("div");
  layer.className = "fx-layer";
  const glow = document.createElement("div");
  glow.className = "heart-glow";
  layer.appendChild(glow);
  const hearts = ["💗", "💘", "💖", "✨", "💕"];
  const cx = innerWidth / 2, cy = innerHeight * 0.42;
  for (let i = 0; i < 14; i++) {
    const h = document.createElement("span");
    h.className = "fx-heart";
    h.textContent = hearts[i % hearts.length];
    h.style.left = cx - 16 + "px";
    h.style.top = cy - 16 + "px";
    const ang = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 90 + Math.random() * 110;
    h.style.setProperty("--dx", Math.cos(ang) * dist + "px");
    h.style.setProperty("--dy", Math.sin(ang) * dist - 40 + "px");
    h.style.animationDelay = Math.random() * 0.12 + "s";
    layer.appendChild(h);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1150);
}

// 灭灯动画：全屏一暗（幕布压下来又抬起）
export function lampOffFx() {
  const layer = document.createElement("div");
  layer.className = "fx-layer lamp-off";
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 700);
}

/* ================= 摇一摇 ================= */

// 返回 {supported, needsPermission, start(cbs), stop()}
// cbs: onIntensity(0-1 实时强度), onCharged() 累计摇动量达标
export function createShaker() {
  const hasMotion = typeof DeviceMotionEvent !== "undefined";
  // iOS ≥13：requestPermission 存在，必须在用户手势回调里调用。
  // 【本机无 iOS 真机，此分支未实测，逻辑按 Apple 文档实现：
  //   按钮 click → DeviceMotionEvent.requestPermission() → "granted" 才 addEventListener】
  const needsPermission =
    hasMotion && typeof DeviceMotionEvent.requestPermission === "function";

  let handler = null;
  let charge = 0;
  let last = null;
  let gotEvent = false;

  const api = {
    supported: hasMotion,
    needsPermission,
    charge: () => charge,

    // 在用户手势里调用；resolve(true)=进入摇动模式, resolve(false)=降级点按
    async requestAndStart(cbs) {
      if (!hasMotion) return false;
      if (needsPermission) {
        try {
          const res = await DeviceMotionEvent.requestPermission();
          if (res !== "granted") return false; // 被拒 → 降级
        } catch {
          return false;
        }
      }
      this._listen(cbs);
      // Android/桌面 Chrome 下 devicemotion 事件可能注册成功但永不触发
      // （无传感器）。1.2s 内没收到事件就报告不支持，由调用方降级。
      return await new Promise((resolve) => {
        setTimeout(() => {
          // 超时判为不支持时必须先摘掉监听：否则传感器晚到会和「点按充能」两条路径并行，
          // 进度条乱跳并重复发 draw_stick。
          if (!gotEvent) api.stop();
          resolve(gotEvent);
        }, 1200);
        const orig = cbs.onIntensity;
        cbs.onIntensity = (v) => {
          if (!gotEvent) {
            gotEvent = true;
            resolve(true);
          }
          orig(v);
        };
      });
    },

    _listen(cbs) {
      const THRESH = 4; // m/s² 变化阈值，低于视为静止
      const TARGET = 130; // 累计摇动量达标值
      handler = (e) => {
        const a = e.accelerationIncludingGravity;
        if (!a || a.x == null) return;
        gotEvent = true;
        if (last) {
          const delta =
            Math.abs(a.x - last.x) + Math.abs(a.y - last.y) + Math.abs(a.z - last.z);
          const intensity = Math.min(1, delta / 28);
          if (intensity > 0.04) cbs.onIntensity(intensity);
          if (delta > THRESH) {
            charge += delta;
            if (charge >= TARGET) {
              charge = TARGET;
              api.stop();
              cbs.onCharged();
            }
          }
        }
        last = { x: a.x, y: a.y, z: a.z };
      };
      window.addEventListener("devicemotion", handler);
    },

    stop() {
      if (handler) {
        window.removeEventListener("devicemotion", handler);
        handler = null;
      }
    },
  };
  return api;
}
