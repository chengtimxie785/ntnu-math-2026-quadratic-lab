// 互動專區③：對摺（學習單第三部分 3-(3)(4)、第四部分的對摺題）
// 拖曳或輸入摺線 x = c / y = c，選點看對摺後落在哪裡，播放對摺動畫並判斷是否重合

import { withDesmos, makeCalc, baseExpressions, fitSquare, watch, lifecycle, renderEq, slidersHTML, bindSliders, isPhone, COLORS, L } from './desmos-core.js';
import { foldPanelHTML } from './fold.js';
import { eqText, fmt, fmtPoint, parseNum, approxEq } from './format.js';
import { mountSlider } from './slider.js';

export function mountFold(root) {
  return withDesmos(root, build, mountSlider);
}

function build(root) {
  const phone = isPhone();
  root.innerHTML = `
    <div class="lab">
      <div class="stage desmos-stage"><div id="fd-calc" class="desmos-box"></div></div>
      <div class="panel">
        <div class="card" id="fd-fold"></div>
        <div class="card">
          <h3>要對摺的圖形</h3>
          <div class="eq" id="fd-eq"></div>
          ${phone ? slidersHTML('fd') : '<p class="hint">用左側 Desmos 的 a、k 拉桿改變圖形。</p>'}
          <div class="msg" id="fd-msg" aria-live="polite"></div>
        </div>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const D = window.Desmos;
  const calc = makeCalc($('#fd-calc'));
  calc.setExpressions([
    ...baseExpressions(D).filter((e) => e.id !== 'ref'),
    // 對摺工具用的隱藏變數（c：摺線位置，p：選取點的 x，q、w、v：選取點與對稱點坐標，g：動畫參數）
    { id: 'c', latex: 'c=0', secret: true, sliderBounds: { min: '-20', max: '20', step: '0.5' } },
    { id: 'p', latex: 'p=2', secret: true, sliderBounds: { min: '-20', max: '20', step: '0.5' } },
    { id: 'q', latex: 'q=ap^{2}+k', secret: true },
    { id: 'w', latex: 'w=2c-p', secret: true },
    { id: 'v', latex: 'v=2c-q', secret: true },
    { id: 'g', latex: 'g=0', secret: true },
  ]);

  const st = {
    a: 1, k: 0, orient: null, c: 0, sel: false, p: 2, top: 8,
    ghost: null, foldMsg: { text: '', cls: '' }, animating: false,
  };
  st.top = fitSquare(calc);
  lifecycle(root, calc, () => { st.top = fitSquare(calc); drawFold(); });

  const setMsg = (t) => { const m = $('#fd-msg'); m.textContent = t; m.className = 'msg bad'; };
  const sync = phone ? bindSliders(root, 'fd', calc, setMsg) : () => {};

  // ---------- 對摺面板 ----------
  const fp = $('#fd-fold');
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

  function mirrorPoint() {
    if (st.orient === 'v') return { x: 2 * st.c - st.p, y: f(st.p) };
    if (st.orient === 'h') return { x: st.p, y: 2 * st.c - f(st.p) };
    return null;
  }
  function mirrorHit() { const M = mirrorPoint(); return !!M && approxEq(f(M.x), M.y, 1e-6); }

  // 摺線、把手、選取點、對稱點、連線
  function drawFold() {
    for (const id of ['fl', 'fh', 'M', 'lk']) calc.removeExpression({ id });
    if (st.orient === 'v') {
      calc.setExpressions([
        { id: 'fl', latex: 'x=c', color: COLORS.mirror, lineStyle: D.Styles.DASHED, lineWidth: 3, secret: true },
        { id: 'fh', latex: `\\left(c,${L(st.top * 0.88)}\\right)`, color: COLORS.mirror, dragMode: D.DragModes.X, pointSize: 22, showLabel: true, label: 'x = ${c}', secret: true },
      ]);
    } else if (st.orient === 'h') {
      const right = calc.graphpaperBounds.mathCoordinates.right;
      calc.setExpressions([
        { id: 'fl', latex: 'y=c', color: COLORS.mirror, lineStyle: D.Styles.DASHED, lineWidth: 3, secret: true },
        { id: 'fh', latex: `\\left(${L(right * 0.85)},c\\right)`, color: COLORS.mirror, dragMode: D.DragModes.Y, pointSize: 22, showLabel: true, label: 'y = ${c}', secret: true },
      ]);
    }
    // 未選點時整個移除（Desmos 隱藏點時標籤仍會留在圖上）
    if (st.sel) {
      calc.setExpression({
        id: 'P', latex: '\\left(p,q\\right)', color: COLORS.point, dragMode: D.DragModes.X,
        showLabel: true, label: 'P(${p}, ${q})', pointSize: 16, secret: true,
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
        { id: 'M', latex: M, color: COLORS.mirror, pointStyle: hit ? D.Styles.POINT : D.Styles.OPEN, pointSize: 16, showLabel: true, label: lab, dragMode: D.DragModes.NONE, secret: true },
      ]);
    }
  }

  function ghostFn(g) {
    return g.orient === 'v' ? (x) => g.a * (2 * g.c - x) ** 2 + g.k : (x) => 2 * g.c - (g.a * x * x + g.k);
  }
  function ghostSame() {
    if (!st.ghost) return false;
    const gf = ghostFn(st.ghost);
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

  function refresh() {
    renderEq($('#fd-eq'), $('#fd-msg'), st.a, st.k);
    sync(st.a, st.k);
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
  const onVar = (key) => (v) => {
    if (key === 'c' && v !== st.c && !st.animating) { st.ghost = null; st.foldMsg = { text: '', cls: '' }; drawGhost(); }
    st[key] = v;
    const hit = st.sel && st.orient ? mirrorHit() : null;
    if (hit !== lastHit) { lastHit = hit; drawFold(); }   // 對稱點實心／空心切換
    refresh();
  };
  for (const k of ['a', 'k', 'c', 'p']) watch(calc, k, onVar(k));

  // ---------- 事件 ----------
  oBtns.forEach((b) => b.addEventListener('click', () => {
    st.orient = st.orient === b.dataset.o ? null : b.dataset.o;
    st.c = 0; st.ghost = null; st.foldMsg = { text: '', cls: '' };
    calc.setExpression({ id: 'c', latex: 'c=0' });
    drawGhost(); lastHit = null; drawFold(); refresh();
  }));
  f$('.fold-c').addEventListener('change', (e) => {
    const v = parseNum(e.target.value);
    if (!Number.isFinite(v)) { e.target.value = fmt(st.c); return; }
    calc.setExpression({ id: 'c', latex: `c=${L(Math.max(-15, Math.min(15, Math.round(v * 2) / 2)))}` });
  });
  const pick = () => {
    const v = parseNum(f$('.fold-px').value);
    if (!Number.isFinite(v)) { setSelMsg('請先輸入 x 的值，例如 2。', 'bad'); return; }
    st.sel = true; st.p = v;
    calc.setExpression({ id: 'p', latex: `p=${L(v)}` });
    lastHit = null; drawFold(); refresh();
  };
  f$('.fold-pick').addEventListener('click', pick);
  f$('.fold-px').addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(); });
  f$('.fold-clear').addEventListener('click', () => {
    st.sel = false; st.ghost = null; st.foldMsg = { text: '', cls: '' };
    drawGhost(); drawFold(); refresh();
  });

  // 對摺動畫：參數 g 從 0 到 1，把圖形「翻」到摺線另一側
  f$('.fold-go').addEventListener('click', () => {
    if (!st.orient || st.animating) return;
    const g0 = { orient: st.orient, c: st.c, a: st.a, k: st.k };
    st.animating = true; st.ghost = null; st.foldMsg = { text: '', cls: '' };
    drawGhost(); refresh();
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
      if (g0.orient === 'v') {
        st.foldMsg = ghostSame()
          ? { text: `✓ 對摺後完全重合！${lineSp()}是這個圖形的對稱軸。`, cls: 'ok' }
          : { text: `✗ 對摺後沒有完全重合，${lineSp()}不是對稱軸。換個位置試試看。`, cls: 'bad' };
      } else {
        st.foldMsg = { text: '對摺後的圖形畫成橘色虛線。調整 a、k，讓實線和虛線完全重合，看看那是哪一個函數。', cls: 'mirror' };
      }
      refresh();
    };
    requestAnimationFrame(step);
  });

  drawFold();
  refresh();
  window.__fold = { calc, st };   // 測試用
}
