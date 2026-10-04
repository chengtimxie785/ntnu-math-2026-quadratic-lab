// 對摺工具：使用者拖曳或輸入摺線（垂直線 x=c、水平線 y=c），
// 選一個點看對摺後落在哪裡，並可播放對摺動畫、留下對摺後的虛線圖形。
//
// scene 介面（由各模組提供）：
//   scene.fn()         目前圖形的函數（需是「凍結」當下參數的 closure）
//   scene.showCurve()  是否畫出連續曲線（描點模組在最後一步前只有點）
//   scene.points()     目前畫面上的點 [{x,y}]
//   scene.pick(m)      依點擊位置回傳最近的圖形上點，或 null
//   scene.pickByX(x)   依 x 值回傳圖形上的點，或 null
//   scene.label()      目前圖形的名稱，例如「y = 2x²」

import { svgEl } from './graph.js';
import { fmt, fmtPoint, parseNum, approxEq } from './format.js';

const STEP = 0.5;

// 對摺工具的面板（SVG 版與 Desmos 版共用）
export function foldPanelHTML(pickHint = '也可以直接點圖形上的點。') {
  return `
      <h3>對摺工具</h3>
      <div class="row" role="group" aria-label="選擇摺線方向">
        <button type="button" class="btn" data-o="v">垂直摺線 x = c</button>
        <button type="button" class="btn" data-o="h">水平摺線 y = c</button>
      </div>
      <div class="row" style="margin-top:.5rem">
        <span class="fold-eqlabel mono">摺線：未選擇</span>
        <label class="row" style="gap:.3rem">c =
          <input class="numbox small fold-c" inputmode="decimal" value="0" disabled aria-label="摺線位置 c">
        </label>
      </div>
      <p class="hint">可以直接在圖上拖曳橘色摺線，或輸入 c 的值。</p>
      <div class="row" style="margin-top:.6rem">
        <label class="row" style="gap:.3rem">選點：x =
          <input class="numbox small fold-px" inputmode="decimal" placeholder="例 2" aria-label="依 x 值選點">
        </label>
        <button type="button" class="btn fold-pick">選這個點</button>
      </div>
      <p class="hint">${pickHint}</p>
      <div class="msg fold-selmsg" aria-live="polite"></div>
      <div class="row" style="margin-top:.6rem">
        <button type="button" class="btn primary fold-go" disabled>對摺！</button>
        <button type="button" class="btn fold-clear">清除</button>
      </div>
      <div class="msg fold-msg" aria-live="polite"></div>`;
}


export class FoldTool {
  constructor(plane, panel, scene, { horizontalHint = '' } = {}) {
    this.plane = plane;
    this.scene = scene;
    this.horizontalHint = horizontalHint;
    this.orient = null;   // 'v' | 'h' | null
    this.c = 0;
    this.sel = null;      // {x, y}
    this.ghost = null;    // {fn, points, orient, c, showCurve}
    this.anim = null;
    this.foldMsg = { text: '', cls: '' };
    this.buildPanel(panel);
    this.bindPointer();
  }

  // ---------- 面板 ----------
  buildPanel(panel) {
    panel.innerHTML = foldPanelHTML();
    this.$ = (s) => panel.querySelector(s);
    this.oBtns = [...panel.querySelectorAll('[data-o]')];
    this.oBtns.forEach((b) => b.addEventListener('click', () => this.setOrient(b.dataset.o)));
    this.$('.fold-c').addEventListener('change', (e) => {
      const v = parseNum(e.target.value);
      if (Number.isFinite(v)) this.setC(v); else e.target.value = fmt(this.c);
    });
    const pickByInput = () => {
      const v = parseNum(this.$('.fold-px').value);
      if (!Number.isFinite(v)) return;
      const p = this.scene.pickByX(v);
      if (p) { this.sel = p; this.render(); }
      else this.setSelMsg(`x = ${fmt(v)} 不在目前的點上，請換一個值。`, 'bad');
    };
    this.$('.fold-pick').addEventListener('click', pickByInput);
    this.$('.fold-px').addEventListener('keydown', (e) => { if (e.key === 'Enter') pickByInput(); });
    this.$('.fold-go').addEventListener('click', () => this.fold());
    this.$('.fold-clear').addEventListener('click', () => this.clearAll());
  }

  setOrient(o) {
    this.orient = this.orient === o ? null : o;
    this.c = 0;
    this.ghost = null;
    this.foldMsg = { text: '', cls: '' };
    this.render();
  }

  setC(v) {
    const p = this.plane;
    const [lo, hi] = this.orient === 'v' ? [p.xmin + 0.5, p.xmax - 0.5] : [p.ymin + 0.5, p.ymax - 0.5];
    const nv = Math.min(hi, Math.max(lo, Math.round(v / STEP) * STEP));
    if (nv !== this.c) { this.ghost = null; this.foldMsg = { text: '', cls: '' }; }
    this.c = nv;
    this.render();
  }

  clearAll() {
    this.sel = null;
    this.ghost = null;
    this.foldMsg = { text: '', cls: '' };
    this.render();
  }

  // ---------- 指標事件 ----------
  bindPointer() {
    const svg = this.plane.svg;
    let dragging = false;
    svg.addEventListener('pointerdown', (e) => {
      if (e.target.classList.contains('foldhit') || e.target.classList.contains('foldhandle')) {
        dragging = true;
        svg.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      const m = this.plane.toMath(e);
      const p = this.scene.pick(m);
      if (p) { this.sel = p; this.render(); }
    });
    svg.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const m = this.plane.toMath(e);
      this.setC(this.orient === 'v' ? m.x : m.y);
    });
    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      try { svg.releasePointerCapture(e.pointerId); } catch (_) { /* 已釋放 */ }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
  }

  // ---------- 幾何 ----------
  mirror(p) {
    if (this.orient === 'v') return { x: 2 * this.c - p.x, y: p.y };
    if (this.orient === 'h') return { x: p.x, y: 2 * this.c - p.y };
    return null;
  }

  onScene(p) {
    const f = this.scene.fn();
    if (this.scene.showCurve()) return approxEq(f(p.x), p.y, 1e-6);
    return this.scene.points().some((q) => approxEq(q.x, p.x, 1e-6) && approxEq(q.y, p.y, 1e-6));
  }

  // 句中用：名稱後面接中文時補空格（括號結尾則不用）
  lineSp() { const n = this.lineName(); return n.endsWith('）') ? n : `${n} `; }

  lineName() {
    if (!this.orient) return '';
    const c = fmt(this.c);
    if (this.orient === 'v') return this.c === 0 ? `直線 x = 0（y 軸）` : `直線 x = ${c}`;
    return this.c === 0 ? `直線 y = 0（x 軸）` : `直線 y = ${c}`;
  }

  // 目前圖形與對摺後的虛線是否完全重合
  sameAsGhost() {
    if (!this.ghost) return false;
    const p = this.plane;
    if (this.scene.showCurve() && this.ghost.showCurve) {
      const f = this.scene.fn(), g = this.ghost.fn;
      for (let i = 0; i <= 60; i++) {
        const x = p.xmin + (p.xmax - p.xmin) * i / 60;
        if (!approxEq(f(x), g(x), 1e-6)) return false;
      }
      return true;
    }
    const cur = this.scene.points(), gp = this.ghost.points;
    if (!cur.length || cur.length !== gp.length) return false;
    return gp.every((q) => cur.some((r) => approxEq(q.x, r.x, 1e-6) && approxEq(q.y, r.y, 1e-6)));
  }

  // ---------- 對摺動畫 ----------
  fold() {
    if (!this.orient || this.anim) return;
    const f = this.scene.fn();
    const showCurve = this.scene.showCurve();
    const pts = this.scene.points().slice();
    const { orient, c } = this;
    const p = this.plane;
    const xs = [];
    const lo = Math.min(p.xmin, 2 * c - p.xmax), hi = Math.max(p.xmax, 2 * c - p.xmin);
    for (let i = 0; i <= 480; i++) xs.push(lo + (hi - lo) * i / 480);
    const at = (q, t) => (orient === 'v'
      ? { x: c + (q.x - c) * (1 - 2 * t), y: q.y }
      : { x: q.x, y: c + (q.y - c) * (1 - 2 * t) });
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 1 : 1100;
    const t0 = performance.now();
    this.ghost = null;
    this.foldMsg = { text: '', cls: '' };
    this.render();
    const step = (now) => {
      const raw = Math.min(1, (now - t0) / dur);
      const t = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
      const g = p.layers.moving;
      g.innerHTML = '';
      if (showCurve) svgEl('path', { class: 'moving', d: p.pathForPoints(xs.map((x) => at({ x, y: f(x) }, t))) }, g);
      for (const q of pts) {
        const r = at(q, t);
        svgEl('circle', { class: 'ghost-pt', cx: p.X(r.x), cy: p.Y(r.y), r: p.unit * 0.09 }, g);
      }
      if (raw < 1) { this.anim = requestAnimationFrame(step); return; }
      this.anim = null;
      g.innerHTML = '';
      this.ghost = {
        orient, c, showCurve,
        fn: orient === 'v' ? (x) => f(2 * c - x) : (x) => 2 * c - f(x),
        points: pts.map((q) => at(q, 1)),
      };
      const same = this.sameAsGhost();
      if (orient === 'v') {
        this.foldMsg = same
          ? { text: `✓ 對摺後完全重合！${this.lineSp()}是這個圖形的對稱軸。`, cls: 'ok' }
          : { text: `✗ 對摺後沒有完全重合，${this.lineSp()}不是對稱軸。換個位置試試看。`, cls: 'bad' };
      } else {
        this.foldMsg = same
          ? { text: '✓ 對摺後完全重合！', cls: 'ok' }
          : { text: `對摺後的圖形畫成橘色虛線。${this.horizontalHint}`, cls: 'mirror' };
      }
      this.render();
    };
    this.anim = requestAnimationFrame(step);
  }

  // ---------- 繪製 ----------
  setSelMsg(text, cls = '') {
    const el = this.$('.fold-selmsg');
    el.textContent = text;
    el.className = `msg fold-selmsg ${cls}`;
  }

  // 由模組在圖形改變時呼叫
  render() {
    const p = this.plane;
    const u = p.unit, fs = p.fontSize;

    // 面板狀態
    this.oBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.o === this.orient)));
    const cIn = this.$('.fold-c');
    cIn.disabled = !this.orient;
    if (document.activeElement !== cIn) cIn.value = fmt(this.c);
    this.$('.fold-eqlabel').textContent = this.orient ? `摺線：${this.orient === 'v' ? 'x' : 'y'} = ${fmt(this.c)}` : '摺線：未選擇';
    this.$('.fold-go').disabled = !this.orient;

    // 選取點跟著圖形移動
    if (this.sel) {
      if (this.scene.showCurve()) this.sel = { x: this.sel.x, y: this.scene.fn()(this.sel.x) };
      else if (!this.onScene(this.sel)) this.sel = null;
    }

    // 摺線
    const gf = p.layers.fold;
    gf.innerHTML = '';
    if (this.orient === 'v') {
      const X = p.X(this.c);
      svgEl('line', { class: 'foldline', x1: X, y1: 0, x2: X, y2: p.H }, gf);
      svgEl('line', { class: 'foldhit', x1: X, y1: 0, x2: X, y2: p.H, 'stroke-width': u * 0.7 }, gf);
      svgEl('circle', { class: 'foldhandle', cx: X, cy: u * 0.45, r: u * 0.22 }, gf);
      const t = svgEl('text', { class: 'lbl mirror', x: X + u * 0.32, y: u * 0.55, 'font-size': fs }, gf);
      t.textContent = `x = ${fmt(this.c)}`;
    } else if (this.orient === 'h') {
      const Y = p.Y(this.c);
      svgEl('line', { class: 'foldline', x1: 0, y1: Y, x2: p.W, y2: Y }, gf);
      svgEl('line', { class: 'foldhit', x1: 0, y1: Y, x2: p.W, y2: Y, 'stroke-width': u * 0.7 }, gf);
      svgEl('circle', { class: 'foldhandle', cx: p.W - u * 0.45, cy: Y, r: u * 0.22 }, gf);
      const t = svgEl('text', { class: 'lbl mirror', x: p.W - u * 0.8, y: Y - u * 0.3, 'font-size': fs, 'text-anchor': 'end' }, gf);
      t.textContent = `y = ${fmt(this.c)}`;
    }

    // 對摺後的虛線
    const gg = p.layers.ghost;
    gg.innerHTML = '';
    if (this.ghost) {
      if (this.ghost.showCurve) svgEl('path', { class: 'ghost', d: p.pathForFn(this.ghost.fn) }, gg);
      for (const q of this.ghost.points) {
        svgEl('circle', { class: 'ghost-pt', cx: p.X(q.x), cy: p.Y(q.y), r: u * 0.07 }, gg);
      }
    }

    // 選取點與對稱點
    const gm = p.layers.marks;
    gm.innerHTML = '';
    let selText = '', selCls = '';
    if (this.sel) {
      const P = this.sel;
      const inView = (q) => q.x >= p.xmin && q.x <= p.xmax && q.y >= p.ymin && q.y <= p.ymax;
      svgEl('circle', { class: 'sel', cx: p.X(P.x), cy: p.Y(P.y), r: u * 0.2 }, gm);
      const tp = svgEl('text', { class: 'lbl', x: p.X(P.x) + u * 0.25, y: p.Y(P.y) - u * 0.25, 'font-size': fs }, gm);
      tp.textContent = `P${fmtPoint(P)}`;
      selText = `P${fmtPoint(P)}`;
      const M = this.mirror(P);
      if (M) {
        const hit = this.onScene(M);
        if (inView(M)) {
          svgEl('line', { class: 'link', x1: p.X(P.x), y1: p.Y(P.y), x2: p.X(M.x), y2: p.Y(M.y) }, gm);
          svgEl('circle', { class: `mirror-pt${hit ? '' : ' miss'}`, cx: p.X(M.x), cy: p.Y(M.y), r: u * 0.13 }, gm);
          const right = M.x >= P.x;
          const tm = svgEl('text', {
            class: 'lbl mirror', x: p.X(M.x) + (right ? u * 0.25 : -u * 0.25), y: p.Y(M.y) + (this.orient === 'h' ? u * 0.55 : -u * 0.25),
            'font-size': fs, 'text-anchor': right ? 'start' : 'end',
          }, gm);
          tm.textContent = `P′${fmtPoint(M)}`;
        }
        selText = `P${fmtPoint(P)} 沿著${this.lineSp()}對摺後，會落在 P′${fmtPoint(M)}。`;
        if (hit && !(approxEq(M.x, P.x) && approxEq(M.y, P.y))) {
          selText += ` ✓ P′ 也在圖形上，所以對摺後 P 會和 P′ 重合。`; selCls = 'ok';
        } else if (hit) {
          selText += ' P 就在摺線上，對摺後位置不變。'; selCls = 'ok';
        } else {
          selText += ' ✗ P′ 不在圖形上。'; selCls = 'bad';
        }
        if (!inView(M)) selText += '（P′ 超出畫面）';
      }
    }
    this.setSelMsg(selText, selCls);

    // 對摺結果訊息；有虛線時，即時檢查目前圖形是否和虛線重合
    const fm = this.$('.fold-msg');
    let { text, cls } = this.foldMsg;
    if (this.ghost && this.ghost.orient === 'h' && this.sameAsGhost()) {
      text = `✓ 現在的圖形（${this.scene.label()}）和對摺後的虛線完全重合！`;
      cls = 'ok';
    }
    fm.textContent = text;
    fm.className = `msg fold-msg ${cls}`;
  }
}
