// 互動專區②：拉桿實驗室（Desmos 版，學習單第四、五部分）
// 圖形與 a、k 拉桿由 Desmos 提供；右側面板提供即時函數式、保留曲線、對摺工具。
// Desmos 載入失敗時（例如網路不穩），自動改用內建的 SVG 版本（slider.js）。

import { DESMOS_API_KEY, DESMOS_VERSION } from './config.js';
import { foldPanelHTML } from './fold.js';
import { eqHTML, eqText, fmt, fmtPoint, parseNum, approxEq } from './format.js';
import { mountSlider } from './slider.js';

const COLORS = {
  curve: '#2d70b3',
  ref: '#9aa3b2',
  mirror: '#d9480f',
  point: '#1d2433',
  pins: ['#7c3aed', '#0f8a7a', '#b7791f', '#c2255c'],
};
const PIN_CSS = ['var(--pin1)', 'var(--pin2)', 'var(--pin3)', 'var(--pin4)'];

let loader = null;
function loadDesmos() {
  if (window.Desmos) return Promise.resolve();
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://www.desmos.com/api/v${DESMOS_VERSION}/calculator.js?apiKey=${DESMOS_API_KEY}`;
      s.onload = () => resolve();
      s.onerror = () => { loader = null; reject(new Error('Desmos 載入失敗')); };
      document.head.appendChild(s);
      setTimeout(() => { if (!window.Desmos) { loader = null; reject(new Error('Desmos 載入逾時')); } }, 20000);
    });
  }
  return loader;
}

// 數字放進 LaTeX 時一律加括號，避免負號出錯
const L = (v) => `\\left(${+v.toFixed(10)}\\right)`;

export async function mountDesmosLab(root) {
  root.innerHTML = '<div class="placeholder">正在載入 Desmos…</div>';
  try {
    await loadDesmos();
  } catch (err) {
    if (!root.isConnected) return;
    mountSlider(root);
    root.insertAdjacentHTML('afterbegin', '<div class="msg bad" style="margin:0 0 12px">Desmos 目前無法載入，先改用內建版本。</div>');
    return;
  }
  if (!root.isConnected) return;   // 載入期間已切換到別頁
  build(root);
}

function build(root) {
  root.innerHTML = `
    <div class="lab">
      <div class="stage desmos-stage"><div id="dl-calc" class="desmos-box"></div></div>
      <div class="panel">
        <div class="card">
          <div class="eq" id="dl-eq"></div>
          <p class="hint">拉動 Desmos 裡的 a、k 拉桿，觀察圖形怎麼變化。</p>
          <div class="msg" id="dl-msg" aria-live="polite"></div>
          <div class="row" style="margin-top:.6rem">
            <button type="button" class="btn" id="dl-pin">保留這條曲線</button>
            <button type="button" class="btn" id="dl-ref" aria-pressed="true">顯示 y = x² 參考線</button>
            <button type="button" class="btn" id="dl-reset">重設</button>
          </div>
          <div class="chips" id="dl-pins"></div>
        </div>
        <div class="card" id="dl-fold"></div>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const D = window.Desmos;

  const calc = D.GraphingCalculator($('#dl-calc'), {
    keypad: false,
    settingsMenu: false,
    expressionsTopbar: false,
    zoomButtons: true,
    border: false,
    links: false,
    language: 'zh-TW',
    invertedColors: false,   // 深色模式也維持淺色畫布，避免反色後「橘色＝對摺」的顏色意義跑掉
    projectorMode: document.documentElement.classList.contains('big'),
  });

  // ---------- 狀態 ----------
  const st = {
    a: 1, k: 0, ref: true, pins: [], pinSeq: 0,
    orient: null, c: 0, sel: false, p: 2,
    ghost: null,   // {orient, c, a, k}
    foldMsg: { text: '', cls: '' }, animating: false,
  };

  // ---------- 基本運算式 ----------
  calc.setExpressions([
    { id: 'a', latex: 'a=1', sliderBounds: { min: '-3', max: '3', step: '0.5' }, readonly: true },
    { id: 'k', latex: 'k=0', sliderBounds: { min: '-6', max: '6', step: '1' }, readonly: true },
    { id: 'f', latex: 'y=ax^{2}+k', color: COLORS.curve, lineWidth: 3.5, readonly: true },
    { id: 'ref', latex: 'y=x^{2}', color: COLORS.ref, lineStyle: D.Styles.DASHED, secret: true },
    // 對摺工具用的隱藏變數
    { id: 'c', latex: 'c=0', secret: true, sliderBounds: { min: '-20', max: '20', step: '0.5' } },
    { id: 'p', latex: 'p=2', secret: true, sliderBounds: { min: '-20', max: '20', step: '0.5' } },
    { id: 'q', latex: 'q=ap^{2}+k', secret: true },
    { id: 'w', latex: 'w=2c-p', secret: true },
    { id: 'v', latex: 'v=2c-q', secret: true },
    { id: 'g', latex: 'g=0', secret: true },
  ]);

  // 讓 x、y 單位長相同，至少看得到 x：−5～5、y：−8～8
  let top = 8;
  function fitBounds() {
    const pc = calc.graphpaperBounds.pixelCoordinates;
    if (!pc.width || !pc.height) return;
    const s = Math.max(11 / pc.width, 17 / pc.height);
    const hw = pc.width * s / 2, hh = pc.height * s / 2;
    calc.setMathBounds({ left: -hw, right: hw, bottom: -hh, top: hh });
    top = hh;
  }
  fitBounds();
  setTimeout(() => { if (root.isConnected) { fitBounds(); drawFold(); } }, 400);   // 版面穩定後再對一次
  let rt = null;
  const onResize = () => { clearTimeout(rt); rt = setTimeout(() => { if (root.isConnected) { calc.resize(); fitBounds(); drawFold(); } }, 200); };
  window.addEventListener('resize', onResize);

  // ---------- 對摺工具面板 ----------
  const fp = $('#dl-fold');
  fp.innerHTML = foldPanelHTML('選好點之後，可以直接拖曳圖上的 P 點，它會沿著圖形移動。');
  const f$ = (s) => fp.querySelector(s);
  const oBtns = [...fp.querySelectorAll('[data-o]')];

  const f = (x) => st.a * x * x + st.k;

  function lineName() {
    const c = fmt(st.c);
    if (st.orient === 'v') return st.c === 0 ? '直線 x = 0（y 軸）' : `直線 x = ${c}`;
    if (st.orient === 'h') return st.c === 0 ? '直線 y = 0（x 軸）' : `直線 y = ${c}`;
    return '';
  }
  const lineSp = () => { const n = lineName(); return n.endsWith('）') ? n : `${n} `; };

  // 摺線、把手、對稱點、連線
  function drawFold() {
    for (const id of ['fl', 'fh', 'M', 'lk']) calc.removeExpression({ id });
    if (st.orient === 'v') {
      calc.setExpressions([
        { id: 'fl', latex: 'x=c', color: COLORS.mirror, lineStyle: D.Styles.DASHED, lineWidth: 3, secret: true },
        { id: 'fh', latex: `\\left(c,${L(top * 0.9)}\\right)`, color: COLORS.mirror, dragMode: D.DragModes.X, pointSize: 18, showLabel: true, label: 'x = ${c}', secret: true },
      ]);
    } else if (st.orient === 'h') {
      const right = calc.graphpaperBounds.mathCoordinates.right;
      calc.setExpressions([
        { id: 'fl', latex: 'y=c', color: COLORS.mirror, lineStyle: D.Styles.DASHED, lineWidth: 3, secret: true },
        { id: 'fh', latex: `\\left(${L(right * 0.88)},c\\right)`, color: COLORS.mirror, dragMode: D.DragModes.Y, pointSize: 18, showLabel: true, label: 'y = ${c}', secret: true },
      ]);
    }
    // 未選點時整個移除（Desmos 隱藏點時標籤仍會留在圖上）
    if (st.sel) {
      calc.setExpression({
        id: 'P', latex: '\\left(p,q\\right)', color: COLORS.point, dragMode: D.DragModes.X,
        showLabel: true, label: 'P(${p}, ${q})', pointSize: 14, secret: true,
      });
    } else calc.removeExpression({ id: 'P' });
    if (st.sel && st.orient) {
      const hit = mirrorHit();
      const M = st.orient === 'v' ? '\\left(w,q\\right)' : '\\left(p,v\\right)';
      const lab = st.orient === 'v' ? 'P′(${w}, ${q})' : 'P′(${p}, ${v})';
      const link = st.orient === 'v'
        ? 'y=q\\left\\{\\min\\left(p,w\\right)\\le x\\le\\max\\left(p,w\\right)\\right\\}'
        : 'x=p\\left\\{\\min\\left(q,v\\right)\\le y\\le\\max\\left(q,v\\right)\\right\\}';
      calc.setExpressions([
        { id: 'lk', latex: link, color: COLORS.mirror, lineStyle: D.Styles.DOTTED, lineWidth: 2, secret: true },
        { id: 'M', latex: M, color: COLORS.mirror, pointStyle: hit ? D.Styles.POINT : D.Styles.OPEN, pointSize: 14, showLabel: true, label: lab, dragMode: D.DragModes.NONE, secret: true },
      ]);
    }
  }

  function mirrorPoint() {
    const P = { x: st.p, y: f(st.p) };
    if (st.orient === 'v') return { x: 2 * st.c - P.x, y: P.y };
    if (st.orient === 'h') return { x: P.x, y: 2 * st.c - P.y };
    return null;
  }
  function mirrorHit() { const M = mirrorPoint(); return !!M && approxEq(f(M.x), M.y, 1e-6); }

  function ghostSame() {
    const g = st.ghost;
    if (!g) return false;
    const gf = g.orient === 'v' ? (x) => g.a * (2 * g.c - x) ** 2 + g.k : (x) => 2 * g.c - (g.a * x * x + g.k);
    for (let i = 0; i <= 40; i++) { const x = -8 + i * 0.4; if (!approxEq(f(x), gf(x), 1e-6)) return false; }
    return true;
  }

  function drawGhost() {
    calc.removeExpression({ id: 'gh' });
    const g = st.ghost;
    if (!g) return;
    const latex = g.orient === 'v'
      ? `y=${L(g.a)}\\left(${L(2 * g.c)}-x\\right)^{2}+${L(g.k)}`
      : `y=${L(2 * g.c)}-\\left(${L(g.a)}x^{2}+${L(g.k)}\\right)`;
    calc.setExpression({ id: 'gh', latex, color: COLORS.mirror, lineStyle: D.Styles.DASHED, lineWidth: 3, secret: true });
  }

  function setSelMsg(text, cls = '') { const el = f$('.fold-selmsg'); el.textContent = text; el.className = `msg fold-selmsg ${cls}`; }

  // 依目前數值更新面板文字
  function refreshPanel() {
    // 函數式與 a = 0 提醒
    const msg = $('#dl-msg');
    if (approxEq(st.a, 0)) {
      $('#dl-eq').innerHTML = `y = ${fmt(st.k)}`;
      msg.textContent = 'a = 0 時，x² 項不見了，y = 0·x² + k 化簡後不是二次函數！';
      msg.className = 'msg bad';
    } else {
      $('#dl-eq').innerHTML = eqHTML(st.a, st.k);
      msg.textContent = '';
      msg.className = 'msg';
    }
    $('#dl-pin').disabled = approxEq(st.a, 0) || st.pins.length >= 4 || st.pins.some((p) => approxEq(p.a, st.a) && approxEq(p.k, st.k));
    $('#dl-ref').setAttribute('aria-pressed', String(st.ref));

    // 對摺面板
    oBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.o === st.orient)));
    const cIn = f$('.fold-c');
    cIn.disabled = !st.orient;
    if (document.activeElement !== cIn) cIn.value = fmt(st.c);
    f$('.fold-eqlabel').textContent = st.orient ? `摺線：${st.orient === 'v' ? 'x' : 'y'} = ${fmt(st.c)}` : '摺線：未選擇';
    f$('.fold-go').disabled = !st.orient || st.animating;

    if (st.sel) {
      const P = { x: st.p, y: f(st.p) };
      let t = `P${fmtPoint(P)}`, cls = '';
      const M = mirrorPoint();
      if (M) {
        const hit = mirrorHit();
        t = `P${fmtPoint(P)} 沿著${lineSp()}對摺後，會落在 P′${fmtPoint(M)}。`;
        if (hit && approxEq(M.x, P.x) && approxEq(M.y, P.y)) { t += ' P 就在摺線上，對摺後位置不變。'; cls = 'ok'; }
        else if (hit) { t += ' ✓ P′ 也在圖形上，所以對摺後 P 會和 P′ 重合。'; cls = 'ok'; }
        else { t += ' ✗ P′ 不在圖形上。'; cls = 'bad'; }
      }
      setSelMsg(t, cls);
    } else setSelMsg('');

    let { text, cls } = st.foldMsg;
    if (st.ghost && st.ghost.orient === 'h' && ghostSame()) {
      text = `✓ 現在的圖形（${eqText(st.a, st.k)}）和對摺後的虛線完全重合！`;
      cls = 'ok';
    }
    const fm = f$('.fold-msg');
    fm.textContent = text;
    fm.className = `msg fold-msg ${cls}`;
  }

  // ---------- 觀察 Desmos 內的數值 ----------
  let lastHit = null;
  const watch = (name, key) => {
    const h = calc.HelperExpression({ latex: name });
    h.observe('numericValue', () => {
      const v = h.numericValue;
      if (!Number.isFinite(v)) return;
      if (key === 'c' && v !== st.c && !st.animating) { st.ghost = null; st.foldMsg = { text: '', cls: '' }; drawGhost(); }
      st[key] = v;
      // 對稱點是否在圖形上改變時，換點的樣式（實心／空心）
      const hit = st.sel && st.orient ? mirrorHit() : null;
      if (hit !== lastHit) { lastHit = hit; drawFold(); }
      refreshPanel();
    });
  };
  watch('a', 'a'); watch('k', 'k'); watch('c', 'c'); watch('p', 'p');

  // ---------- 事件 ----------
  oBtns.forEach((b) => b.addEventListener('click', () => {
    st.orient = st.orient === b.dataset.o ? null : b.dataset.o;
    st.c = 0; st.ghost = null; st.foldMsg = { text: '', cls: '' };
    calc.setExpression({ id: 'c', latex: 'c=0' });
    drawGhost(); lastHit = null; drawFold(); refreshPanel();
  }));
  f$('.fold-c').addEventListener('change', (e) => {
    const v = parseNum(e.target.value);
    if (!Number.isFinite(v)) { e.target.value = fmt(st.c); return; }
    const nv = Math.max(-15, Math.min(15, Math.round(v * 2) / 2));
    calc.setExpression({ id: 'c', latex: `c=${L(nv)}` });
  });
  const pick = () => {
    const v = parseNum(f$('.fold-px').value);
    if (!Number.isFinite(v)) { setSelMsg('請先輸入 x 的值，例如 2。', 'bad'); return; }
    st.sel = true; st.p = v;
    calc.setExpression({ id: 'p', latex: `p=${L(v)}` });
    lastHit = null; drawFold(); refreshPanel();
  };
  f$('.fold-pick').addEventListener('click', pick);
  f$('.fold-px').addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(); });
  f$('.fold-clear').addEventListener('click', () => {
    st.sel = false; st.ghost = null; st.foldMsg = { text: '', cls: '' };
    drawGhost(); drawFold(); refreshPanel();
  });

  // 對摺動畫：用參數 g 從 0 到 1，把圖形「翻」到摺線另一側
  f$('.fold-go').addEventListener('click', () => {
    if (!st.orient || st.animating) return;
    const g0 = { orient: st.orient, c: st.c, a: st.a, k: st.k };
    st.animating = true; st.ghost = null; st.foldMsg = { text: '', cls: '' };
    drawGhost(); refreshPanel();
    const moving = g0.orient === 'v'
      ? `\\left(${L(g0.c)}+\\left(t-${L(g0.c)}\\right)\\left(1-2g\\right),${L(g0.a)}t^{2}+${L(g0.k)}\\right)`
      : `\\left(t,${L(g0.c)}+\\left(${L(g0.a)}t^{2}+${L(g0.k)}-${L(g0.c)}\\right)\\left(1-2g\\right)\\right)`;
    calc.setExpressions([
      { id: 'g', latex: 'g=0' },
      { id: 'mv', latex: moving, color: COLORS.mirror, lineWidth: 3.5, parametricDomain: { min: '-30', max: '30' }, secret: true },
    ]);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 1 : 1100;
    const t0 = performance.now();
    const step = (now) => {
      if (!root.isConnected) return;
      const raw = Math.min(1, (now - t0) / dur);
      const t = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
      calc.setExpression({ id: 'g', latex: `g=${t.toFixed(4)}` });
      if (raw < 1) { requestAnimationFrame(step); return; }
      calc.removeExpression({ id: 'mv' });
      st.animating = false;
      st.ghost = g0;
      drawGhost();
      const same = ghostSame();
      if (g0.orient === 'v') {
        st.foldMsg = same
          ? { text: `✓ 對摺後完全重合！${lineSp()}是這個圖形的對稱軸。`, cls: 'ok' }
          : { text: `✗ 對摺後沒有完全重合，${lineSp()}不是對稱軸。換個位置試試看。`, cls: 'bad' };
      } else {
        st.foldMsg = { text: '對摺後的圖形畫成橘色虛線。調整 a、k，讓實線和虛線完全重合，看看那是哪一個函數。', cls: 'mirror' };
      }
      refreshPanel();
    };
    requestAnimationFrame(step);
  });

  // 保留曲線、參考線、重設
  function drawPins() {
    const chips = $('#dl-pins');
    chips.innerHTML = '';
    st.pins.forEach((p, i) => {
      const c = document.createElement('span');
      c.className = 'chip';
      c.style.color = PIN_CSS[i % PIN_CSS.length];
      c.innerHTML = `${eqText(p.a, p.k)}<button type="button" aria-label="移除 ${eqText(p.a, p.k)}">×</button>`;
      c.querySelector('button').addEventListener('click', () => {
        calc.removeExpression({ id: p.id });
        st.pins.splice(i, 1);
        st.pins.forEach((q, j) => calc.setExpression({ id: q.id, color: COLORS.pins[j % 4] }));
        drawPins(); refreshPanel();
      });
      chips.appendChild(c);
    });
  }
  $('#dl-pin').addEventListener('click', () => {
    const id = `pin${st.pinSeq++}`;
    const i = st.pins.length;
    st.pins.push({ id, a: st.a, k: st.k });
    calc.setExpression({ id, latex: `y=${L(st.a)}x^{2}+${L(st.k)}`, color: COLORS.pins[i % 4], lineWidth: 2.5, secret: true });
    drawPins(); refreshPanel();
  });
  $('#dl-ref').addEventListener('click', () => {
    st.ref = !st.ref;
    calc.setExpression({ id: 'ref', hidden: !st.ref });
    refreshPanel();
  });
  $('#dl-reset').addEventListener('click', () => {
    for (const p of st.pins) calc.removeExpression({ id: p.id });
    Object.assign(st, { ref: true, pins: [], orient: null, c: 0, sel: false, ghost: null, foldMsg: { text: '', cls: '' } });
    calc.setExpressions([
      { id: 'a', latex: 'a=1' }, { id: 'k', latex: 'k=0' }, { id: 'c', latex: 'c=0' },
      { id: 'ref', hidden: false },
    ]);
    fitBounds(); drawGhost(); drawPins(); lastHit = null; drawFold(); refreshPanel();
  });

  // 離開頁面時釋放 Desmos
  const obs = new MutationObserver(() => {
    if (!root.isConnected || !root.contains($('#dl-calc'))) {
      window.removeEventListener('resize', onResize);
      calc.destroy();
      obs.disconnect();
    }
  });
  obs.observe(document.getElementById('view'), { childList: true });

  drawFold();
  refreshPanel();
  window.__dlab = { calc, st };   // 方便除錯
}
