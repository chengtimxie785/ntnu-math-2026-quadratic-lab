// 坐標平面（SVG）：x、y 等比例，比例尺固定，讓圖形大小對應真實數值

const NS = 'http://www.w3.org/2000/svg';

export function svgEl(tag, attrs = {}, parent = null) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

export class Plane {
  constructor(container, { xmin, xmax, ymin, ymax, unit = 50, label = '坐標平面' }) {
    Object.assign(this, { xmin, xmax, ymin, ymax, unit });
    this.W = (xmax - xmin) * unit;
    this.H = (ymax - ymin) * unit;
    this.svg = svgEl('svg', {
      viewBox: `0 0 ${this.W} ${this.H}`, class: 'plane', role: 'img', 'aria-label': label,
    }, container);
    this.layers = {};
    for (const name of ['grid', 'ref', 'pins', 'ghost', 'curve', 'points', 'moving', 'fold', 'marks']) {
      this.layers[name] = svgEl('g', { class: name }, this.svg);
    }
    this.drawGrid();
  }

  X(x) { return (x - this.xmin) * this.unit; }
  Y(y) { return (this.ymax - y) * this.unit; }

  // 螢幕座標轉數學座標
  toMath(evt) {
    const pt = this.svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    const p = pt.matrixTransform(this.svg.getScreenCTM().inverse());
    return { x: p.x / this.unit + this.xmin, y: this.ymax - p.y / this.unit };
  }

  // 以數學單位計的距離換算：一個「像素單位」約等於多少數學單位
  get fontSize() { return Math.max(12, this.unit * 0.3); }

  drawGrid() {
    const g = this.layers.grid;
    g.innerHTML = '';
    const grid = svgEl('g', { class: 'grid' }, g);
    for (let x = Math.ceil(this.xmin); x <= this.xmax; x++) {
      svgEl('line', { x1: this.X(x), y1: 0, x2: this.X(x), y2: this.H }, grid);
    }
    for (let y = Math.ceil(this.ymin); y <= this.ymax; y++) {
      svgEl('line', { x1: 0, y1: this.Y(y), x2: this.W, y2: this.Y(y) }, grid);
    }
    svgEl('line', { class: 'axis', x1: 0, y1: this.Y(0), x2: this.W, y2: this.Y(0) }, g);
    svgEl('line', { class: 'axis', x1: this.X(0), y1: 0, x2: this.X(0), y2: this.H }, g);
    const fs = this.fontSize;
    const lab = (x, y, s, anchor = 'middle') => {
      const t = svgEl('text', { x, y, class: 'tick', 'font-size': fs, 'text-anchor': anchor }, g);
      t.textContent = s;
    };
    for (let x = Math.ceil(this.xmin); x <= this.xmax; x++) {
      if (x === 0 || x === this.xmin || x === this.xmax) continue;
      lab(this.X(x), this.Y(0) + fs * 1.15, String(x).replace('-', '−'));
    }
    for (let y = Math.ceil(this.ymin); y <= this.ymax; y++) {
      if (y === 0 || y === this.ymin || y === this.ymax) continue;
      lab(this.X(0) - fs * 0.45, this.Y(y) + fs * 0.35, String(y).replace('-', '−'), 'end');
    }
    lab(this.X(0) - fs * 0.45, this.Y(0) + fs * 1.15, 'O', 'end');
    g.lastChild.setAttribute('style', 'font-family: serif; font-style: italic');
    lab(this.W - fs * 0.5, this.Y(0) - fs * 0.5, 'x');
    lab(this.X(0) + fs * 0.7, fs * 1.1, 'y');
  }

  // 依函數取樣成 path；超出畫面時斷開
  pathForFn(f, n = 480) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const x = this.xmin + (this.xmax - this.xmin) * i / n;
      pts.push({ x, y: f(x) });
    }
    return this.pathForPoints(pts);
  }

  pathForPoints(pts) {
    const lo = this.ymin - 2, hi = this.ymax + 2, lx = this.xmin - 2, hx = this.xmax + 2;
    let d = '', pen = false;
    for (const p of pts) {
      const inside = p.y >= lo && p.y <= hi && p.x >= lx && p.x <= hx && Number.isFinite(p.y);
      if (!inside) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${this.X(p.x).toFixed(2)},${this.Y(p.y).toFixed(2)}`;
      pen = true;
    }
    return d;
  }

  clear(name) { this.layers[name].innerHTML = ''; }
}
