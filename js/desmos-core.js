// Desmos 共用工具：載入、建立計算機、等比例視窗、手機版自製拉桿

import { DESMOS_API_KEY, DESMOS_VERSION } from './config.js';
import { eqHTML, fmt, parseNum, approxEq } from './format.js';

export const COLORS = {
  curve: '#2d70b3',
  ref: '#9aa3b2',
  mirror: '#d9480f',
  point: '#1d2433',
  pins: ['#7c3aed', '#0f8a7a', '#b7791f', '#c2255c'],
};

// 數字放進 LaTeX 時一律加括號，避免負號出錯
export const L = (v) => `\\left(${+(+v).toFixed(10)}\\right)`;

export const isPhone = () => document.documentElement.dataset.layout === 'phone';

let loader = null;
export function loadDesmos() {
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

// 載入 Desmos；失敗時改呼叫 fallback（內建 SVG 版）
export async function withDesmos(root, build, fallback) {
  root.innerHTML = '<div class="placeholder">正在載入 Desmos…</div>';
  try {
    await loadDesmos();
  } catch (err) {
    if (!root.isConnected) return;
    fallback(root);
    root.insertAdjacentHTML('afterbegin', '<div class="msg bad" style="margin:0 0 12px">Desmos 目前無法載入，先改用內建版本。</div>');
    return;
  }
  if (root.isConnected) build(root);
}

// 手機版只顯示圖形（拉桿自製）；電腦版顯示 Desmos 原生的運算式列表
export function makeCalc(el) {
  const phone = isPhone();
  return window.Desmos.GraphingCalculator(el, {
    expressions: !phone,
    keypad: false,
    settingsMenu: false,
    expressionsTopbar: false,
    zoomButtons: true,
    border: false,
    links: false,
    language: 'zh-TW',
    invertedColors: false,   // 深色模式也維持淺色畫布，避免反色後「橘色＝對摺」的顏色意義跑掉
    projectorMode: !phone,   // 電腦版多半在大螢幕上用，線條與字放大
  });
}

// y = ax² + k 與參考線；a、k、式子都鎖定，學生只能拉、不能刪改
export function baseExpressions(D) {
  return [
    { id: 'a', latex: 'a=1', sliderBounds: { min: '-5', max: '5', step: '0.5' }, readonly: true },
    { id: 'k', latex: 'k=0', sliderBounds: { min: '-10', max: '10', step: '1' }, readonly: true },
    { id: 'f', latex: 'y=ax^{2}+k', color: COLORS.curve, lineWidth: 3.5, readonly: true },
    { id: 'ref', latex: 'y=x^{2}', color: COLORS.ref, lineStyle: D.Styles.DASHED, secret: true },
  ];
}

// 讓 x、y 單位長相同，且至少看得到指定範圍；回傳上緣 y 值
export function fitSquare(calc, wx = 11, hy = 17) {
  const pc = calc.graphpaperBounds.pixelCoordinates;
  if (!pc.width || !pc.height) return hy / 2;
  const s = Math.max(wx / pc.width, hy / pc.height);
  const hw = pc.width * s / 2, hh = pc.height * s / 2;
  calc.setMathBounds({ left: -hw, right: hw, bottom: -hh, top: hh });
  return hh;
}

// k 很大時圖形會跑出畫面：依 k 決定至少要看到的 y 範圍（上下各留 3 單位）
export const neededHeight = (k) => Math.max(17, 2 * Math.ceil(Math.abs(k)) + 6);

// 觀察 Desmos 內的變數
export function watch(calc, name, cb) {
  const h = calc.HelperExpression({ latex: name });
  h.observe('numericValue', () => { if (Number.isFinite(h.numericValue)) cb(h.numericValue); });
  return h;
}

// 視窗大小改變時重新調整；離開頁面時釋放 Desmos
export function lifecycle(root, calc, onResize) {
  let rt = null;
  const resize = () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (root.isConnected) { calc.resize(); onResize(); } }, 200);
  };
  window.addEventListener('resize', resize);
  setTimeout(() => { if (root.isConnected) onResize(); }, 400);   // 版面穩定後再對一次
  const obs = new MutationObserver(() => {
    if (!root.isConnected) {
      window.removeEventListener('resize', resize);
      calc.destroy();
      obs.disconnect();
    }
  });
  obs.observe(document.getElementById('view'), { childList: true });
}

// 函數式與 a = 0 的提醒
export function renderEq(eqEl, msgEl, a, k) {
  if (approxEq(a, 0)) {
    eqEl.innerHTML = `y = ${fmt(k)}`;
    msgEl.textContent = 'a = 0 時，x² 項不見了，y = 0·x² + k 化簡後不是二次函數！';
    msgEl.className = 'msg bad';
  } else {
    eqEl.innerHTML = eqHTML(a, k);
    msgEl.textContent = '';
    msgEl.className = 'msg';
  }
}

// ---------- 手機版自製拉桿 ----------
// a 的拉桿跳過 0（a = 0 不是二次函數）；輸入框可打分數
const A_VALUES = [];
for (let v = -5; v <= 5; v += 0.5) if (v !== 0) A_VALUES.push(v);
const K_MAX = 10;

export function slidersHTML(p) {
  return `
    <div class="slider-row">
      <label for="${p}-a">a</label>
      <input type="range" id="${p}-a" min="0" max="${A_VALUES.length - 1}" step="1">
      <input class="numbox" id="${p}-a-in" inputmode="decimal" aria-label="輸入 a 的值">
    </div>
    <div class="slider-row">
      <label for="${p}-k">k</label>
      <input type="range" id="${p}-k" min="-${K_MAX}" max="${K_MAX}" step="1">
      <input class="numbox" id="${p}-k-in" inputmode="decimal" aria-label="輸入 k 的值">
    </div>`;
}

export function fracStr(v) {
  for (let d = 1; d <= 12; d++) {
    const n = Math.round(v * d);
    if (Math.abs(v * d - n) < 1e-9) return (d === 1 ? String(n) : `${n}/${d}`).replace('-', '−');
  }
  return fmt(v);
}

// 綁定自製拉桿；回傳 sync(a, k) 讓頁面在數值改變時更新拉桿位置
export function bindSliders(root, p, calc, setMsg) {
  const $ = (s) => root.querySelector(s);
  const aR = $(`#${p}-a`), kR = $(`#${p}-k`), aIn = $(`#${p}-a-in`), kIn = $(`#${p}-k-in`);
  const setA = (v) => calc.setExpression({ id: 'a', latex: `a=${L(v)}` });
  const setK = (v) => calc.setExpression({ id: 'k', latex: `k=${L(v)}` });
  aR.addEventListener('input', () => setA(A_VALUES[+aR.value]));
  kR.addEventListener('input', () => setK(+kR.value));
  aIn.addEventListener('change', () => {
    const v = parseNum(aIn.value);
    if (!Number.isFinite(v)) { setMsg('請輸入數字，例如 2、-0.5 或 1/3。'); return; }
    if (approxEq(v, 0)) { setMsg('a = 0 時，y = 0·x² + k 化簡後沒有 x² 項，就不是二次函數了！'); return; }
    if (Math.abs(v) > 10) { setMsg('a 的絕對值請在 10 以內，圖形才看得清楚。'); return; }
    setA(v);
  });
  kIn.addEventListener('change', () => {
    const v = parseNum(kIn.value);
    if (!Number.isFinite(v) || Math.abs(v) > 20) { setMsg('k 請輸入 −20 到 20 之間的數。'); return; }
    setK(v);
  });
  for (const el of [aIn, kIn]) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); });
  return function sync(a, k) {
    let bi = 0;
    A_VALUES.forEach((v, i) => { if (Math.abs(v - a) < Math.abs(A_VALUES[bi] - a)) bi = i; });
    aR.value = bi;
    kR.value = Math.max(-K_MAX, Math.min(K_MAX, Math.round(k)));
    if (document.activeElement !== aIn) aIn.value = fracStr(a);
    if (document.activeElement !== kIn) kIn.value = fmt(k);
  };
}
