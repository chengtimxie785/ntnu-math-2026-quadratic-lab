// 數字與式子的顯示工具

const EPS = 1e-9;
const MINUS = '−';

export function approxEq(a, b, eps = 1e-7) { return Math.abs(a - b) < eps; }

// 找出最簡分數表示（分母 2～12），找不到回傳 null
export function toFraction(v) {
  if (Number.isInteger(Math.round(v * 1e9) / 1e9) && approxEq(v, Math.round(v))) return { n: Math.round(v), d: 1 };
  for (let d = 2; d <= 12; d++) {
    const n = Math.round(v * d);
    if (approxEq(v * d, n)) return { n, d };
  }
  return null;
}

// 坐標用：整數或最多兩位小數，負號用 U+2212
export function fmt(v) {
  if (Math.abs(v) < EPS) v = 0;
  let s;
  if (approxEq(v, Math.round(v))) s = String(Math.round(v));
  else s = String(Math.round(v * 100) / 100);
  return s.replace('-', MINUS);
}

export function fmtPoint(p) { return `(${fmt(p.x)}, ${fmt(p.y)})`; }

// 係數的 HTML（分數用上下排）
export function numHTML(v) {
  const f = toFraction(Math.abs(v));
  const sign = v < 0 ? MINUS : '';
  if (f && f.d === 1) return sign + f.n;
  if (f) return `${sign}<span class="frac"><span>${f.n}</span><span>${f.d}</span></span>`;
  return sign + fmt(Math.abs(v));
}

// y = a x² + k 的 HTML
export function eqHTML(a, k) {
  let s = 'y = ';
  if (approxEq(a, 1)) s += '';
  else if (approxEq(a, -1)) s += MINUS;
  else s += numHTML(a);
  s += 'x<sup>2</sup>';
  if (!approxEq(k, 0)) s += (k > 0 ? ' + ' : ` ${MINUS} `) + numHTML(Math.abs(k));
  return s;
}

// y = a x² + k 的純文字（給 SVG、標籤用）
export function eqText(a, k) {
  const f = toFraction(Math.abs(a));
  let coef;
  if (approxEq(Math.abs(a), 1)) coef = '';
  else if (f && f.d !== 1) coef = `${f.n}/${f.d}`;
  else coef = fmt(Math.abs(a));
  let s = `y = ${a < 0 ? MINUS : ''}${coef}x²`;
  if (!approxEq(k, 0)) s += (k > 0 ? ' + ' : ` ${MINUS} `) + fmt(Math.abs(k));
  return s;
}

// 解析使用者輸入：支援 -1/2、−0.5、3
export function parseNum(str) {
  if (str == null) return NaN;
  const t = String(str).trim().replace(/−/g, '-').replace(/\s+/g, '');
  if (t === '') return NaN;
  const m = t.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (m) { const d = parseFloat(m[2]); return d === 0 ? NaN : parseFloat(m[1]) / d; }
  return /^-?\d*\.?\d+$/.test(t) ? parseFloat(t) : NaN;
}
