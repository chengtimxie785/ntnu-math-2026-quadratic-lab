// Desmos 版對摺工具（任務二「找對稱軸」、任務四「上下翻」、自由探索共用）
//
// 選項：
//   panel        放摺線控制、對摺按鈕、結果訊息的容器
//   pointsPanel  放選點介面的容器（預設同 panel）
//   orients      可用的摺線方向：['v']、['h'] 或 ['v','h']
//   lockC        摺線固定位置（例如任務四固定在 x 軸 y = 0）；null 表示可拖曳、可輸入
//   presets      預設可選的點，例如 [{ x: 2, label: '(2, 4)' }]；null 表示用輸入框選點；false 表示不提供選點
//   goLabel      對摺按鈕文字
//   onResult(r)  對摺動畫結束時呼叫，r = {orient, c, same}；可回傳 {text, cls} 取代預設訊息
//   onMatch()    水平對摺後，目前圖形和虛線重合時呼叫；可回傳 {text, cls} 當作重合訊息
//   onClear()    按「清除」後呼叫
//   onChange()   每次狀態更新（選點、移動摺線、對摺完成）後呼叫
//   ghostEq()    回傳 true 時，水平對摺後在訊息中顯示虛線的函數式（由老師端開關控制）

import { COLORS, L, watch } from './desmos-core.js';
import { fmt, fmtPoint, parseNum, approxEq, eqText } from './format.js';

export class DesmosFold {
  constructor(calc, opts) {
    this.calc = calc;
    this.D = window.Desmos;
    this.o = { orients: ['v', 'h'], lockC: null, presets: null, goLabel: '對摺！', onResult: null, onMatch: null, ghostEq: () => false, ...opts };
    this.o.pointsPanel = this.o.pointsPanel || this.o.panel;
    this.st = {
      a: 1, k: 0,
      orient: this.o.orients.length === 1 ? this.o.orients[0] : null,
      c: this.o.lockC ?? 0, sel: false, p: 2, top: 8,
      ghost: null, foldMsg: { text: '', cls: '' }, animating: false, matched: false,
    };
    calc.setExpressions([
      // c：摺線位置，p：選取點的 x，q、w、v：選取點與對稱點坐標，g：動畫參數
      { id: 'c', latex: `c=${L(this.st.c)}`, secret: true, sliderBounds: { min: '-30', max: '30', step: '0.5' } },
      { id: 'p', latex: 'p=2', secret: true, sliderBounds: { min: '-30', max: '30', step: '0.5' } },
      { id: 'q', latex: 'q=ap^{2}+k', secret: true },
      { id: 'w', latex: 'w=2c-p', secret: true },
      { id: 'v', latex: 'v=2c-q', secret: true },
      { id: 'g', latex: 'g=0', secret: true },
    ]);
    this.buildUI();
    this.lastHit = null;
    for (const key of ['a', 'k', 'c', 'p']) watch(calc, key, (val) => this.onVar(key, val));
  }

  // ---------- 介面 ----------
  buildUI() {
    const o = this.o;
    const orientBtns = o.orients.length > 1 ? `
      <div class="row" role="group" aria-label="選擇摺線方向">
        <button type="button" class="btn" data-o="v">垂直摺線</button>
        <button type="button" class="btn" data-o="h">水平摺線</button>
      </div>` : '';
    const cCtrl = o.lockC === null ? `
      <div class="row" style="margin-top:.5rem">
        <label class="row" style="gap:.3rem">摺線：<span class="mono fold-var">x</span> =
          <input class="numbox small fold-c" inputmode="decimal" value="0" aria-label="摺線的位置">
        </label>
      </div>
      <p class="hint fold-chint">拖曳圖上的橘色圓點來移動摺線，或直接在上面輸入數字。</p>` : '';
    o.panel.insertAdjacentHTML('beforeend', `
      ${orientBtns}${cCtrl}
      <div class="row" style="margin-top:.6rem">
        <button type="button" class="btn primary fold-go">${o.goLabel}</button>
        <button type="button" class="btn fold-clear">清除</button>
      </div>
      <div class="msg fold-msg" aria-live="polite"></div>`);
    const pointsUI = o.presets === false ? '' : o.presets
      ? `<div class="row fold-presets">${o.presets.map((p) => `<button type="button" class="btn mono" data-px="${p.x}">${p.label}</button>`).join('')}</div>`
      : `<div class="row fold-quick" style="margin-top:.6rem">
           <span>快速選點：</span>
           ${[-2, -1, 1, 2].map((x) => `<button type="button" class="btn small mono" data-px="${x}">x = ${fmt(x)}</button>`).join('')}
         </div>
         <div class="row" style="margin-top:.4rem">
           <label class="row" style="gap:.3rem">或輸入 x =
             <input class="numbox small fold-px" inputmode="decimal" placeholder="例 2" aria-label="依 x 值選點">
           </label>
           <button type="button" class="btn fold-pick">選這個點</button>
         </div>
         <p class="hint">選好點之後，可以直接拖曳圖上的 P 點，它會沿著圖形移動。</p>`;
    if (o.presets !== false) o.pointsPanel.insertAdjacentHTML('beforeend', `${pointsUI}<div class="msg fold-selmsg" aria-live="polite"></div>`);

    const q = (s) => o.panel.querySelector(s) || o.pointsPanel.querySelector(s);
    this.q = q;
    this.oBtns = [...o.panel.querySelectorAll('[data-o]')];
    this.oBtns.forEach((b) => b.addEventListener('click', () => this.setOrient(this.st.orient === b.dataset.o ? null : b.dataset.o)));
    const cIn = q('.fold-c');
    if (cIn) {
      cIn.addEventListener('change', () => {
        const v = parseNum(cIn.value);
        if (!Number.isFinite(v)) { cIn.value = fmt(this.st.c); return; }
        this.calc.setExpression({ id: 'c', latex: `c=${L(Math.max(-25, Math.min(25, Math.round(v * 2) / 2)))}` });
      });
    }
    if (o.presets !== false) {
      // 預設點按鈕（任務②）與快速選點按鈕（自由探索）
      o.pointsPanel.querySelectorAll('[data-px]').forEach((b) => b.addEventListener('click', () => this.selectX(+b.dataset.px)));
    }
    if (o.presets === null) {
      const pick = () => {
        const v = parseNum(q('.fold-px').value);
        if (!Number.isFinite(v)) { this.setSelMsg('請先輸入 x 的值，例如 2。', 'bad'); return; }
        this.selectX(v);
      };
      q('.fold-pick').addEventListener('click', pick);
      q('.fold-px').addEventListener('keydown', (e) => { if (e.key === 'Enter') pick(); });
    }
    q('.fold-go').addEventListener('click', () => this.fold());
    q('.fold-clear').addEventListener('click', () => this.clear());
  }

  setOrient(o) {
    const st = this.st;
    st.orient = o;
    st.c = this.o.lockC ?? 0;
    st.ghost = null; st.foldMsg = { text: '', cls: '' }; st.matched = false;
    this.calc.setExpression({ id: 'c', latex: `c=${L(st.c)}` });
    this.drawGhost(); this.lastHit = null; this.draw(); this.refresh();
  }

  selectX(x) {
    this.st.sel = true; this.st.p = x;
    this.calc.setExpression({ id: 'p', latex: `p=${L(x)}` });
    this.lastHit = null; this.draw(); this.refresh();
  }

  clear() {
    const st = this.st;
    st.sel = false; st.ghost = null; st.foldMsg = { text: '', cls: '' }; st.matched = false;
    this.drawGhost(); this.draw(); this.refresh();
    this.o.onClear?.();
  }

  // 由頁面在視窗範圍改變時呼叫
  setTop(top) { this.st.top = top; this.draw(); }

  // ---------- 幾何 ----------
  f(x) { return this.st.a * x * x + this.st.k; }

  lineName() {
    const { orient, c } = this.st;
    if (orient === 'v') return c === 0 ? '直線 x = 0（y 軸）' : `直線 x = ${fmt(c)}`;
    if (orient === 'h') return c === 0 ? '直線 y = 0（x 軸）' : `直線 y = ${fmt(c)}`;
    return '';
  }
  lineSp() { const n = this.lineName(); return n.endsWith('）') ? n : `${n} `; }

  mirrorPoint() {
    const { orient, c, p } = this.st;
    if (orient === 'v') return { x: 2 * c - p, y: this.f(p) };
    if (orient === 'h') return { x: p, y: 2 * c - this.f(p) };
    return null;
  }
  mirrorHit() { const M = this.mirrorPoint(); return !!M && approxEq(this.f(M.x), M.y, 1e-6); }

  ghostFn(g) {
    return g.orient === 'v' ? (x) => g.a * (2 * g.c - x) ** 2 + g.k : (x) => 2 * g.c - (g.a * x * x + g.k);
  }
  ghostSame() {
    if (!this.st.ghost) return false;
    const gf = this.ghostFn(this.st.ghost);
    for (let i = 0; i <= 40; i++) { const x = -8 + i * 0.4; if (!approxEq(this.f(x), gf(x), 1e-6)) return false; }
    return true;
  }

  // ---------- Desmos 繪製 ----------
  draw() {
    const { calc, D, st } = this;
    for (const id of ['fl', 'fh', 'M', 'lk']) calc.removeExpression({ id });
    const drag = this.o.lockC === null;
    if (st.orient === 'v') {
      calc.setExpression({ id: 'fl', latex: 'x=c', color: COLORS.mirror, lineStyle: D.Styles.DASHED, lineWidth: 3, secret: true });
      if (drag) calc.setExpression({ id: 'fh', latex: `\\left(c,${L(st.top * 0.86)}\\right)`, color: COLORS.mirror, dragMode: D.DragModes.X, pointSize: 24, showLabel: true, label: 'x = ${c}', secret: true });
    } else if (st.orient === 'h') {
      calc.setExpression({ id: 'fl', latex: 'y=c', color: COLORS.mirror, lineStyle: D.Styles.DASHED, lineWidth: 3, secret: true });
      if (drag) {
        const right = calc.graphpaperBounds.mathCoordinates.right;
        calc.setExpression({ id: 'fh', latex: `\\left(${L(right * 0.82)},c\\right)`, color: COLORS.mirror, dragMode: D.DragModes.Y, pointSize: 24, showLabel: true, label: 'y = ${c}', secret: true });
      }
    }
    // 未選點時整個移除（Desmos 隱藏點時標籤仍會留在圖上）
    if (st.sel) {
      calc.setExpression({
        id: 'P', latex: '\\left(p,q\\right)', color: COLORS.point, pointSize: 16, secret: true,
        dragMode: this.o.presets ? D.DragModes.NONE : D.DragModes.X, showLabel: true, label: '(${p}, ${q})',
      });
    } else calc.removeExpression({ id: 'P' });
    if (st.sel && st.orient) {
      const hit = this.mirrorHit();
      const v = st.orient === 'v';
      calc.setExpressions([
        {
          id: 'lk', color: COLORS.mirror, lineStyle: D.Styles.DOTTED, lineWidth: 2, secret: true,
          latex: v ? 'y=q\\left\\{\\min\\left(p,w\\right)\\le x\\le\\max\\left(p,w\\right)\\right\\}'
            : 'x=p\\left\\{\\min\\left(q,v\\right)\\le y\\le\\max\\left(q,v\\right)\\right\\}',
        },
        {
          id: 'M', latex: v ? '\\left(w,q\\right)' : '\\left(p,v\\right)', color: COLORS.mirror,
          pointStyle: hit ? D.Styles.POINT : D.Styles.OPEN, pointSize: 16, showLabel: true,
          label: v ? '(${w}, ${q})' : '(${p}, ${v})', dragMode: D.DragModes.NONE, secret: true,
        },
      ]);
    }
  }

  drawGhost() {
    const { calc, D, st } = this;
    calc.removeExpression({ id: 'gh' });
    const g = st.ghost;
    if (!g) return;
    const latex = g.orient === 'v'
      ? `y=${L(g.a)}\\left(${L(2 * g.c)}-x\\right)^{2}+${L(g.k)}`
      : `y=${L(2 * g.c)}-\\left(${L(g.a)}x^{2}+${L(g.k)}\\right)`;
    calc.setExpression({ id: 'gh', latex, color: COLORS.mirror, lineStyle: D.Styles.DASHED, lineWidth: 3, secret: true });
  }

  // ---------- 文字 ----------
  setSelMsg(text, cls = '') {
    const el = this.q('.fold-selmsg');
    if (!el) return;
    el.textContent = text;
    el.className = `msg fold-selmsg ${cls}`;
  }

  refresh() {
    const st = this.st, q = this.q;
    this.oBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.o === st.orient)));
    const cIn = q('.fold-c');
    if (cIn) {
      cIn.disabled = !st.orient;
      if (document.activeElement !== cIn) cIn.value = st.orient ? fmt(st.c) : '';
      q('.fold-var').textContent = st.orient === 'h' ? 'y' : 'x';
      q('.fold-chint').textContent = st.orient
        ? '拖曳圖上的橘色圓點來移動摺線，或直接在上面輸入數字。'
        : '先選「垂直摺線」或「水平摺線」。';
    }
    q('.fold-go').disabled = !st.orient || st.animating;

    // 選點訊息：說明對摺後跑到哪裡，以及這代表什麼
    if (st.sel) {
      const P = { x: st.p, y: this.f(st.p) };
      const M = this.mirrorPoint();
      let t = `選到的點：${fmtPoint(P)}`, cls = '';
      if (M) {
        if (approxEq(M.x, P.x) && approxEq(M.y, P.y)) {
          t = `${fmtPoint(P)} 剛好在摺線上，對摺後不會移動。`;
        } else if (this.mirrorHit()) {
          t = `${fmtPoint(P)} 對摺後會跑到 ${fmtPoint(M)}，這個點也在圖形上，所以兩點會重合。`;
          if (st.orient === 'v') t += `兩點的 y 坐標一樣，對稱地分在${this.lineSp()}的兩側。`;
          cls = 'ok';
        } else {
          t = `${fmtPoint(P)} 對摺後會跑到 ${fmtPoint(M)}，但這個點不在圖形上，所以${this.lineSp()}不是對稱軸。`;
          cls = 'bad';
        }
      }
      this.setSelMsg(t, cls);
    } else this.setSelMsg('');

    // 水平對摺後，若目前圖形和虛線重合，改顯示重合訊息（onMatch 可回傳自訂訊息）
    const matched = !!(st.ghost && st.ghost.orient === 'h' && this.ghostSame());
    if (matched && !st.matched) st.matchMsg = this.o.onMatch?.() || { text: '✓ 實線和虛線完全重合了！', cls: 'ok' };
    st.matched = matched;
    let { text, cls } = matched ? st.matchMsg : st.foldMsg;
    if (!matched && st.ghost && st.ghost.orient === 'h' && this.o.ghostEq()) {
      const g = st.ghost;
      text += `（橘色虛線是 ${eqText(-g.a, 2 * g.c - g.k)}）`;
    }
    const fm = q('.fold-msg');
    fm.textContent = text;
    fm.className = `msg fold-msg ${cls}`;
    this.o.onChange?.();
  }

  onVar(key, val) {
    const st = this.st;
    const changed = val !== st[key];
    if (changed && !st.animating && st.ghost) {
      // 摺線移動：結果失效。垂直對摺後改 a、k：虛線是舊圖形的，也一併清掉
      // （水平對摺後改 a、k 是「讓實線和虛線重合」的活動，要保留虛線）
      if (key === 'c' || ((key === 'a' || key === 'k') && st.ghost.orient === 'v')) {
        st.ghost = null; st.foldMsg = { text: '', cls: '' }; this.drawGhost();
      }
    }
    st[key] = val;
    const hit = st.sel && st.orient ? this.mirrorHit() : null;
    if (hit !== this.lastHit) { this.lastHit = hit; this.draw(); }   // 對稱點實心／空心切換
    this.refresh();
  }

  // ---------- 對摺動畫：參數 g 從 0 到 1，把圖形「翻」到摺線另一側 ----------
  fold() {
    const { calc, st } = this;
    if (!st.orient || st.animating) return;
    const g0 = { orient: st.orient, c: st.c, a: st.a, k: st.k };
    st.animating = true; st.ghost = null; st.foldMsg = { text: '', cls: '' }; st.matched = false;
    this.drawGhost(); this.refresh();
    const moving = g0.orient === 'v'
      ? `\\left(${L(g0.c)}+\\left(t-${L(g0.c)}\\right)\\left(1-2g\\right),${L(g0.a)}t^{2}+${L(g0.k)}\\right)`
      : `\\left(t,${L(g0.c)}+\\left(${L(g0.a)}t^{2}+${L(g0.k)}-${L(g0.c)}\\right)\\left(1-2g\\right)\\right)`;
    calc.setExpressions([
      { id: 'g', latex: 'g=0' },
      { id: 'mv', latex: moving, color: COLORS.mirror, lineWidth: 3.5, parametricDomain: { min: '-40', max: '40' }, secret: true },
    ]);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 1 : 1100;
    const t0 = performance.now();
    const step = (now) => {
      if (!this.o.panel.isConnected) return;
      const raw = Math.min(1, (now - t0) / dur);
      const t = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
      calc.setExpression({ id: 'g', latex: `g=${t.toFixed(4)}` });
      if (raw < 1) { requestAnimationFrame(step); return; }
      calc.removeExpression({ id: 'mv' });
      st.animating = false;
      st.ghost = g0;
      this.drawGhost();
      const same = this.ghostSame();
      let msg;
      if (g0.orient === 'v') {
        msg = same
          ? { text: `✓ 對摺後完全重合！${this.lineSp()}是這個圖形的對稱軸。`, cls: 'ok' }
          : { text: `✗ 對摺後兩邊沒有重合，${this.lineSp()}不是對稱軸。換個位置再試試看。`, cls: 'bad' };
      } else {
        msg = { text: `圖形沿著${this.lineSp()}翻過去，變成橘色虛線。試著拉動 a、k，看能不能讓實線和虛線完全重合。`, cls: 'mirror' };
      }
      const custom = this.o.onResult?.({ ...g0, same });
      st.foldMsg = custom || msg;
      this.refresh();
    };
    requestAnimationFrame(step);
  }
}
