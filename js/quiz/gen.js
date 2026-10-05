// 測驗題目產生器：五個關卡，每關 5 題
// 題目全部由程式隨機產生，正確答案由程式計算；每個錯誤選項都標上對應的迷思代碼（見 mis.js）
//
// 題目物件：
//   { sig, level, type, prompt (HTML), promptText (純文字，存進作答紀錄), graph ({a,k,mark} 或 null),
//     choices: [{ html, text, mis }], answer (正確選項索引), explain (解釋) }

import { numHTML, eqHTML, eqText, fmt, toFraction } from '../format.js';

const M = '−';
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const ri = (lo, hi, nonzero = false) => {
  let v;
  do { v = lo + Math.floor(Math.random() * (hi - lo + 1)); } while (nonzero && v === 0);
  return v;
};
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const A_SET = [-3, -2, -1, -0.5, 0.5, 1, 2, 3];

// ---------- 多項式顯示（HTML 與純文字） ----------
// 係數的純文字：分數寫成 (1/2)，避免被看成 1/(2x²)
function numT(v, withVar) {
  const f = toFraction(Math.abs(v));
  if (f && f.d !== 1) return withVar ? `(${f.n}/${f.d})` : `${f.n}/${f.d}`;
  return fmt(Math.abs(v));
}
// 含正負號的數字純文字（解釋文字用）
const numS = (v) => (v < 0 ? M : '') + numT(v);

// terms：[[係數, 變數HTML, 變數文字], ...]，依序串成多項式；係數 0 的項略過（除非 keepZero）
function poly(terms, keepZero = false) {
  let h = '', t = '', first = true;
  for (const [c, vh, vt] of terms) {
    if (c === 0 && !keepZero) continue;
    const neg = c < 0, abs = Math.abs(c);
    const one = abs === 1 && vh;
    const bh = (one ? '' : numHTML(abs)) + vh;
    const bt = (one ? '' : numT(abs, !!vh)) + vt;
    if (first) { h += (neg ? M : '') + bh; t += (neg ? M : '') + bt; }
    else { h += neg ? ` ${M} ${bh}` : ` + ${bh}`; t += neg ? ` ${M} ${bt}` : ` + ${bt}`; }
    first = false;
  }
  return first ? { h: '0', t: '0' } : { h, t };
}
const X2 = ['x<sup>2</sup>', 'x²'], X1 = ['x', 'x'], X3 = ['x<sup>3</sup>', 'x³'], C = ['', ''];
const T = (c, v) => [c, v[0], v[1]];
// (x ± p) 的寫法
const xp = (p) => (p >= 0 ? `x + ${p}` : `x ${M} ${-p}`);

// 加上「y = 」
const Y = (p) => ({ h: `y = ${p.h}`, t: `y = ${p.t}` });

// ---------- 第 1 關：是不是二次函數？ ----------
const L1_OK = {
  std() {
    const a = pick(A_SET), b = ri(-5, 5), c = ri(-6, 6);
    const e = Y(poly([T(a, X2), T(b, X1), T(c, C)]));
    return { type: 'std', sig: `std:${a},${b},${c}`, e, quad: true, mis: 'not_recognize',
      explain: `最高次數是 2，而且 x² 的係數是 ${numS(a)}（不是 0），所以是二次函數。` };
  },
  product() {
    if (Math.random() < 0.5) {
      const k = ri(-6, 6, true);
      const e = { h: `y = x(${xp(-k)})`, t: `y = x(${xp(-k)})` };
      const ex = poly([T(1, X2), T(-k, X1)]).t;
      return { type: 'product', sig: `prodA:${k}`, e, quad: true, mis: 'product_form',
        explain: `展開後 y = ${ex}，最高次數是 2，所以是二次函數。` };
    }
    const p = ri(-5, 5, true), q = ri(-5, 5, true);
    const e = { h: `y = (${xp(p)})(${xp(q)})`, t: `y = (${xp(p)})(${xp(q)})` };
    const ex = poly([T(1, X2), T(p + q, X1), T(p * q, C)]).t;
    return { type: 'product', sig: `prodB:${p},${q}`, e, quad: true, mis: 'product_form',
      explain: `展開後 y = ${ex}，最高次數是 2，所以是二次函數。` };
  },
  negsq() {
    const h = ri(-4, 4, true), k = ri(-5, 5);
    const ks = k === 0 ? '' : (k > 0 ? ` + ${k}` : ` ${M} ${-k}`);
    const e = { h: `y = ${M}(${xp(-h)})<sup>2</sup>${ks}`, t: `y = ${M}(${xp(-h)})²${ks}` };
    const ex = poly([T(-1, X2), T(2 * h, X1), T(-h * h + k, C)]).t;
    return { type: 'negsq', sig: `negsq:${h},${k}`, e, quad: true, mis: 'paren_neg',
      explain: `展開後 y = ${ex}，x² 的係數是 −1（不是 0），所以是二次函數。` };
  },
};
const L1_TRAP = {
  cancel() {
    const p = ri(-5, 5, true);
    const e = { h: `y = (${xp(p)})<sup>2</sup> ${M} x<sup>2</sup>`, t: `y = (${xp(p)})² ${M} x²` };
    const ex = poly([T(2 * p, X1), T(p * p, C)]).t;
    return { type: 'cancel', sig: `cancel:${p}`, e, quad: false, mis: 'no_simplify',
      explain: `展開後 x² 會被消掉：y = ${ex}，最高次數是 1，是一次函數，不是二次函數。` };
  },
  constsq() {
    const m = ri(2, 9), n = ri(-6, 6, true);
    const nx = poly([T(n, X1)]);
    const e = { h: `y = ${m}<sup>2</sup> ${n < 0 ? M : '+'} ${poly([T(Math.abs(n), X1)]).h}`, t: `y = ${m}² ${n < 0 ? M : '+'} ${poly([T(Math.abs(n), X1)]).t}` };
    return { type: 'constsq', sig: `constsq:${m},${n}`, e, quad: false, mis: 'const_square',
      explain: `${m}² = ${m * m} 只是常數，化簡後 y = ${nx.t} + ${m * m}，最高次數是 1，不是二次函數。` };
  },
  azero() {
    const b = ri(-6, 6, true), c = ri(-6, 6);
    const rest = poly([T(b, X1), T(c, C)]);
    const sign = rest.h.startsWith(M) ? '' : '+ ';
    const e = { h: `y = 0x<sup>2</sup> ${sign}${rest.h.replace(new RegExp(`^${M}`), `${M} `)}`, t: `y = 0x² ${sign}${rest.t.replace(new RegExp(`^${M}`), `${M} `)}` };
    return { type: 'azero', sig: `azero:${b},${c}`, e, quad: false, mis: 'a_zero',
      explain: `x² 的係數是 0，化簡後 y = ${rest.t}，不是二次函數（二次函數規定 a ≠ 0）。` };
  },
  cubic() {
    const a = ri(-3, 3, true), b = ri(-4, 4, true), c = ri(-5, 5);
    const e = Y(poly([T(a, X3), T(b, X2), T(c, C)]));
    return { type: 'cubic', sig: `cubic:${a},${b},${c}`, e, quad: false, mis: 'cubic',
      explain: '最高次數是 3（有 x³ 項），不是二次函數。' };
  },
};

function level1() {
  const nTrap = Math.random() < 0.5 ? 2 : 3;
  const traps = shuffle(Object.values(L1_TRAP)).slice(0, nTrap);
  const oks = shuffle(Object.values(L1_OK));
  const gens = [...traps];
  for (let i = 0; gens.length < 5; i++) gens.push(oks[i % oks.length]);
  return shuffle(gens).map((g) => () => {
    const q = g();
    return {
      level: 1, type: q.type, sig: `1:${q.sig}`,
      prompt: `<span class="eq-inline">${q.e.h}</span><br>這是 x 的二次函數嗎？`,
      promptText: `${q.e.t}　這是 x 的二次函數嗎？`,
      graph: null,
      choices: [
        { html: '○ 是二次函數', text: '是', mis: q.quad ? null : q.mis },
        { html: '× 不是', text: '不是', mis: q.quad ? q.mis : null },
      ],
      answer: q.quad ? 0 : 1,
      explain: q.explain,
    };
  });
}

// ---------- 共用：y = ax² + k 的選項 ----------
const fn = (a, k) => ({ html: eqHTML(a, k), text: eqText(a, k) });
const pt = (x, y) => `(${fmt(x)}, ${fmt(y)})`;
const updown = (a) => (a > 0 ? '上' : '下');
const lowhigh = (a) => (a > 0 ? '最低點' : '最高點');

// 選項去重：同樣文字的選項只留第一個
function uniq(choices) {
  const seen = new Set();
  return choices.filter((c) => (seen.has(c.text) ? false : (seen.add(c.text), true)));
}
// 把選項打亂並記住正確答案的位置（choices[0] 必須是正確答案）
function finalize(q, choices) {
  const order = shuffle(choices.map((c, i) => i));
  return { ...q, choices: order.map((i) => choices[i]), answer: order.indexOf(0) };
}

// ---------- 第 2 關：看式子想圖形 ----------
function level2() {
  const kinds = shuffle(['open', 'open', 'ext', 'ext', 'ext']);
  return kinds.map((kind) => () => {
    const a = pick(A_SET), k = ri(-6, 6);
    const e = fn(a, k);
    if (kind === 'open') {
      const ok = updown(a), bad = a > 0 ? '下' : '上';
      return finalize({
        level: 2, type: 'open', sig: `2:open:${a},${k}`,
        prompt: `<span class="eq-inline">${e.html}</span><br>這個圖形的開口向哪裡？`,
        promptText: `${e.text}　這個圖形的開口向哪裡？`, graph: null,
        explain: `a = ${numS(a)} ${a > 0 ? '> 0' : '< 0'}，所以開口向${ok}。`,
      }, [
        { html: `開口向${ok}`, text: `開口向${ok}`, mis: null },
        { html: `開口向${bad}`, text: `開口向${bad}`, mis: 'sign_open' },
      ]);
    }
    const lh = lowhigh(a), other = a > 0 ? '最高點' : '最低點';
    const opts = [
      { text: `${lh} ${pt(0, k)}`, mis: null },
      { text: `${other} ${pt(0, k)}`, mis: 'max_min' },
    ];
    if (k !== 0) {
      opts.push({ text: `${lh} ${pt(k, 0)}`, mis: 'vertex_swap' });
      opts.push({ text: `${lh} ${pt(0, -k)}`, mis: 'vertex_sign' });
    } else {
      opts.push({ text: `${lh} ${pt(0, a)}`, mis: 'vertex_a' });
      opts.push({ text: `${lh} ${pt(a, 0)}`, mis: 'vertex_a' });
    }
    return finalize({
      level: 2, type: 'ext', sig: `2:ext:${a},${k}`,
      prompt: `<span class="eq-inline">${e.html}</span><br>這個圖形有最高點還是最低點？坐標是多少？`,
      promptText: `${e.text}　這個圖形有最高點還是最低點？坐標是多少？`, graph: null,
      explain: `a ${a > 0 ? '> 0' : '< 0'}，開口向${updown(a)}，所以有${lh}；x = 0 時 y = ${fmt(k)}，${lh}是 ${pt(0, k)}。`,
    }, uniq(opts.map((o) => ({ ...o, html: o.text }))));
  });
}

// ---------- 第 3 關：開口誰比較大 ----------
const ABS_SET = [1 / 3, 0.5, 1, 2, 3, 4];
function level3() {
  return Array.from({ length: 5 }, () => () => {
    // 三個選項各有固定角色，讓「選了哪個錯誤選項」能對應到唯一的迷思：
    //   問「開口最大」（正解 = |a| 最小）
    //     a_not_abs：用 a（含正負號）比，會選 a 最小的 → 安排成負數、|a| 居中
    //     size_reverse：|a| 大小關係弄反，會選 |a| 最大的 → 安排成正數
    //   問「開口最小」（正解 = |a| 最大）→ 正負對調
    const [sm, md, lg] = shuffle(ABS_SET).slice(0, 3).sort((x, y) => x - y);
    const askMax = Math.random() < 0.5;
    const sSign = Math.random() < 0.5 ? -1 : 1;
    const small = sSign * sm;
    const [correct, signedPick, reverse] = askMax ? [small, -md, lg] : [-lg, md, small];
    const choices = [
      { ...fn(correct, 0), mis: null },
      { ...fn(signedPick, 0), mis: 'a_not_abs' },
      { ...fn(reverse, 0), mis: 'size_reverse' },
    ];
    const as = [correct, signedPick, reverse];
    const byAbs = as.slice().sort((x, y) => Math.abs(x) - Math.abs(y));
    const word = askMax ? '最大' : '最小';
    const absList = byAbs.map((a) => `|${numS(a)}|`).join(' < ');
    return finalize({
      level: 3, type: askMax ? 'max' : 'min', sig: `3:${askMax ? 'max' : 'min'}:${as.join(',')}`,
      prompt: `下面哪一個函數的圖形，開口${word}？`,
      promptText: `下面哪一個函數的圖形，開口${word}？`, graph: null,
      explain: `比較 |a|：${absList}。|a| 愈小開口愈大、|a| 愈大開口愈小，所以開口${word}的是 ${eqText(correct, 0)}。`,
    }, choices);
  });
}

// ---------- 第 4 關：平移 ----------
function level4() {
  const kinds = shuffle(['fwd', 'fwd', 'rev', 'rev', 'vtx']);
  return kinds.map((kind) => () => {
    const a = pick(A_SET);
    const n = ri(1, 6), up = Math.random() < 0.5;
    const dir = up ? '上' : '下', k = up ? n : -n;
    if (kind === 'fwd') {
      const base = fn(a, 0);
      const opts = [
        { ...fn(a, k), mis: null },
        { ...fn(a, -k), mis: 'shift_dir' },
      ];
      if (a + k !== 0 && a + k !== -a) opts.push({ ...fn(a + k, 0), mis: 'k_to_a' });
      const coefT = (a < 0 ? M : '') + (Math.abs(a) === 1 ? '' : numT(a, true));
      const sh = { html: `y = ${a === 1 ? '' : a === -1 ? M : numHTML(a)}(${xp(-k)})<sup>2</sup>`, text: `y = ${coefT}(${xp(-k)})²`, mis: 'shift_axis' };
      opts.push(sh);
      return finalize({
        level: 4, type: 'fwd', sig: `4:fwd:${a},${k}`,
        prompt: `把 <span class="eq-inline">${base.html}</span> 的圖形向${dir}平移 ${n} 單位，<br>會得到哪一個函數的圖形？`,
        promptText: `把 ${base.text} 的圖形向${dir}平移 ${n} 單位，會得到哪一個函數的圖形？`, graph: null,
        explain: `向${dir}平移 ${n} 單位，每個點的 y 坐標都${up ? '加' : '減'} ${n}，所以是 ${eqText(a, k)}。`,
      }, uniq(opts));
    }
    if (kind === 'rev') {
      const e = fn(a, k);
      const opts = [
        { text: `向${dir}平移 ${n} 單位`, mis: null },
        { text: `向${up ? '下' : '上'}平移 ${n} 單位`, mis: 'shift_dir' },
        { text: `向右平移 ${n} 單位`, mis: 'shift_axis' },
        { text: `向左平移 ${n} 單位`, mis: 'shift_axis' },
      ].map((o) => ({ ...o, html: o.text }));
      return finalize({
        level: 4, type: 'rev', sig: `4:rev:${a},${k}`,
        prompt: `<span class="eq-inline">${e.html}</span> 的圖形，<br>可以由 <span class="eq-inline">${fn(a, 0).html}</span> 的圖形怎麼平移得到？`,
        promptText: `${e.text} 的圖形，可以由 ${eqText(a, 0)} 的圖形怎麼平移得到？`, graph: null,
        explain: `k = ${fmt(k)} ${k > 0 ? '> 0' : '< 0'}，所以是向${dir}平移 ${n} 單位。`,
      }, opts);
    }
    const lh = lowhigh(a);
    const opts = [
      { text: pt(0, k), mis: null },
      { text: pt(0, -k), mis: 'shift_dir' },
      { text: pt(k, 0), mis: 'vertex_swap' },
      { text: pt(0, 0), mis: 'no_shift' },
    ].map((o) => ({ ...o, html: o.text }));
    return finalize({
      level: 4, type: 'vtx', sig: `4:vtx:${a},${k}`,
      prompt: `把 <span class="eq-inline">${fn(a, 0).html}</span> 的圖形向${dir}平移 ${n} 單位後，<br>${lh}的坐標是多少？`,
      promptText: `把 ${eqText(a, 0)} 的圖形向${dir}平移 ${n} 單位後，${lh}的坐標是多少？`, graph: null,
      explain: `原本的${lh}是 (0, 0)，向${dir}平移 ${n} 單位後變成 ${pt(0, k)}。`,
    }, opts);
  });
}

// ---------- 第 5 關：看圖選式子 ----------
const A5 = [-2, -1, -0.5, 0.5, 1, 2];
function level5() {
  return Array.from({ length: 5 }, () => () => {
    const a = pick(A5), k = ri(-4, 4);
    // 標一個好讀的點：|a| = 1/2 時用 x = 2，否則用 x = 1
    const mx = Math.abs(a) === 0.5 ? 2 : 1;
    const mark = { x: mx, y: a * mx * mx + k };
    const a2 = pick(A5.filter((v) => Math.sign(v) === Math.sign(a) && v !== a));
    const k2 = k !== 0 ? -k : pick([-2, 2]);
    const opts = uniq([
      { ...fn(a, k), mis: null },
      { ...fn(-a, k), mis: 'sign_open' },
      { ...fn(a2, k), mis: 'abs_size' },
      { ...fn(a, k2), mis: 'read_k' },
    ]);
    return finalize({
      level: 5, type: 'graph', sig: `5:${a},${k}`,
      prompt: '下面是哪一個函數的圖形？',
      promptText: `下面是哪一個函數的圖形？（圖形：${eqText(a, k)}，標出 ${pt(0, k)} 與 ${pt(mark.x, mark.y)}）`,
      graph: { a, k, mark },
      explain: `開口向${updown(a)}，所以 a ${a > 0 ? '> 0' : '< 0'}；${lowhigh(a)}在 ${pt(0, k)}，所以 k = ${fmt(k)}；` +
        `再把 x = ${mx} 代入：${pt(mark.x, mark.y)} 在圖形上，得到 a = ${numS(a)}。答案是 ${eqText(a, k)}。`,
    }, opts);
  });
}

const LEVEL_GEN = { 1: level1, 2: level2, 3: level3, 4: level4, 5: level5 };

// 產生一關 5 題；seen 是這位學生看過的題目代碼，盡量避開
export function makeLevel(level, seen = new Set()) {
  const makers = LEVEL_GEN[level]();
  const out = [], used = new Set();
  for (const make of makers) {
    let q = make();
    for (let t = 0; t < 40 && (seen.has(q.sig) || used.has(q.sig)); t++) q = make();
    used.add(q.sig);
    out.push(q);
  }
  return out;
}
