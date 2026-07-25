// 轻量 QR Code 生成器（byte mode, EC level M, version 1-5, mask 0）
// 无外部依赖。参考 ISO/IEC 18004 标准实现。

// GF(256) 表
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function rsGenPoly(deg) {
  let poly = [1];
  for (let i = 0; i < deg; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= poly[j] ? EXP[(LOG[poly[j]] + i) % 255] : 0;
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, deg) {
  const gen = rsGenPoly(deg);
  const res = data.concat(new Array(deg).fill(0));
  for (let i = 0; i < data.length; i++) {
    const coef = res[i];
    if (coef === 0) continue;
    const lc = LOG[coef];
    for (let j = 1; j < gen.length; j++) {
      res[i + j] ^= gen[j] ? EXP[(LOG[gen[j]] + lc) % 255] : 0;
    }
  }
  return res.slice(data.length);
}

// version 1-5, level M: [totalCodewords, ecPerBlock, numBlocks]
const VER = [
  null,
  [26, 10, 1],
  [44, 16, 1],
  [70, 26, 1],
  [100, 18, 2],
  [134, 24, 2],
];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30]];

function bchFormat(data5) {
  let d = data5 << 10;
  const g = 0x537;
  for (let i = 14; i >= 10; i--) {
    if ((d >> i) & 1) d ^= g << (i - 10);
  }
  return ((data5 << 10) | d) ^ 0x5412;
}

export function makeQR(text) {
  const bytes = new TextEncoder().encode(text);
  let version = 0;
  for (let v = 1; v <= 5; v++) {
    const [total, ec, blocks] = VER[v];
    const dataCap = total - ec * blocks;
    if (bytes.length + 2 <= dataCap) {
      version = v;
      break;
    }
  }
  if (!version) throw new Error("QR content too long");
  const [total, ecLen, numBlocks] = VER[version];
  const dataCap = total - ecLen * numBlocks;

  // bit stream: mode(0100) + len(8) + data + terminator + pad
  const bits = [];
  const push = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, 8);
  for (const b of bytes) push(b, 8);
  const capBits = dataCap * 8;
  for (let i = 0; i < 4 && bits.length < capBits; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const dataBytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    dataBytes.push(b);
  }
  const pads = [0xec, 0x11];
  let pi = 0;
  while (dataBytes.length < dataCap) dataBytes.push(pads[pi++ % 2]);

  // 分块 + RS + 交织
  const per = Math.floor(dataCap / numBlocks);
  const dBlocks = [];
  const eBlocks = [];
  for (let b = 0; b < numBlocks; b++) {
    const d = dataBytes.slice(b * per, (b + 1) * per);
    dBlocks.push(d);
    eBlocks.push(rsEncode(d, ecLen));
  }
  const codewords = [];
  for (let i = 0; i < per; i++)
    for (const d of dBlocks) codewords.push(d[i]);
  for (let i = 0; i < ecLen; i++)
    for (const e of eBlocks) codewords.push(e[i]);

  // 矩阵
  const size = 17 + 4 * version;
  const M = Array.from({ length: size }, () => new Array(size).fill(null));

  const setFinder = (r, c) => {
    for (let dr = -1; dr <= 7; dr++)
      for (let dc = -1; dc <= 7; dc++) {
        const rr = r + dr,
          cc = c + dc;
        if (rr < 0 || rr >= size || cc < 0 || cc >= size) continue;
        const on =
          (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
          (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6)) ||
          (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);
        M[rr][cc] = on;
      }
  };
  setFinder(0, 0);
  setFinder(0, size - 7);
  setFinder(size - 7, 0);

  // alignment
  const ap = ALIGN[version];
  for (const r of ap)
    for (const c of ap) {
      if (M[r][c] !== null) continue; // 与定位图形重叠则跳过
      for (let dr = -2; dr <= 2; dr++)
        for (let dc = -2; dc <= 2; dc++) {
          M[r + dr][c + dc] =
            Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
        }
    }

  // timing
  for (let i = 8; i < size - 8; i++) {
    if (M[6][i] === null) M[6][i] = i % 2 === 0;
    if (M[i][6] === null) M[i][6] = i % 2 === 0;
  }
  // dark module
  M[size - 8][8] = true;

  // format info（level M=00, mask 0）
  const fmt = bchFormat((0b00 << 3) | 0);
  for (let i = 0; i < 15; i++) {
    const mod = ((fmt >> i) & 1) === 1;
    // 竖排（左上）
    if (i < 6) M[i][8] = mod;
    else if (i < 8) M[i + 1][8] = mod;
    else M[size - 15 + i][8] = mod;
    // 横排
    if (i < 8) M[8][size - i - 1] = mod;
    else if (i < 9) M[8][15 - i - 1 + 1] = mod;
    else M[8][15 - i - 1] = mod;
  }

  // 数据填充（zigzag，mask 0: (r+c)%2==0 翻转）
  let inc = -1,
    row = size - 1,
    bitIndex = 7,
    byteIndex = 0;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (;;) {
      for (let c = 0; c < 2; c++) {
        if (M[row][col - c] === null) {
          let dark =
            byteIndex < codewords.length
              ? ((codewords[byteIndex] >>> bitIndex) & 1) === 1
              : false;
          if ((row + (col - c)) % 2 === 0) dark = !dark;
          M[row][col - c] = dark;
          bitIndex--;
          if (bitIndex === -1) {
            byteIndex++;
            bitIndex = 7;
          }
        }
      }
      row += inc;
      if (row < 0 || row >= size) {
        row -= inc;
        inc = -inc;
        break;
      }
    }
  }

  return { size, get: (r, c) => !!M[r][c] };
}

// 把二维码画到 canvas 2d 上下文
export function drawQR(ctx, text, x, y, sizePx, { dark = "#12080a", light = "#ffffff" } = {}) {
  const qr = makeQR(text);
  const quiet = 2;
  const n = qr.size + quiet * 2;
  const cell = sizePx / n;
  ctx.fillStyle = light;
  ctx.fillRect(x, y, sizePx, sizePx);
  ctx.fillStyle = dark;
  for (let r = 0; r < qr.size; r++)
    for (let c = 0; c < qr.size; c++)
      if (qr.get(r, c))
        ctx.fillRect(
          x + (c + quiet) * cell,
          y + (r + quiet) * cell,
          Math.ceil(cell),
          Math.ceil(cell)
        );
}
