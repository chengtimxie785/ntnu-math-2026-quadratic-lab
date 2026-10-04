// 自由探索：完整的對摺工具（任意摺線、任意點、任意 a、k），給老師示範或學有餘力的學生

import { withDesmos, makeCalc, baseExpressions, fitSquare, neededHeight, watch, lifecycle, renderEq, slidersHTML, bindSliders, taskHeader, isPhone } from './desmos-core.js';
import { DesmosFold } from './desmos-fold.js';
import { eqText } from './format.js';
import { mountSlider } from './slider.js';

export function mountFold(root) {
  return withDesmos(root, build, mountSlider);
}

function build(root) {
  const phone = isPhone();
  root.innerHTML = `
    ${taskHeader('自由探索', '任意選摺線、選點、改變圖形，自己找找看還有什麼發現。', '')}
    <div class="lab">
      <div class="stage desmos-stage"><div id="fd-calc" class="desmos-box"></div></div>
      <div class="panel">
        <div class="card" id="fd-fold"><h3>對摺工具</h3></div>
        <div class="card">
          <h3>要對摺的圖形</h3>
          <div class="eq" id="fd-eq"></div>
          ${phone ? slidersHTML('fd') : '<p class="hint">用左側 Desmos 的 a、k 拉桿改變圖形。</p>'}
          <div class="msg" id="fd-msg" aria-live="polite"></div>
          <div class="row" style="margin-top:.6rem">
            <button type="button" class="btn" id="fd-reset">全部重設</button>
          </div>
        </div>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const D = window.Desmos;
  const calc = makeCalc($('#fd-calc'));
  calc.setExpressions(baseExpressions(D).filter((e) => e.id !== 'ref'));

  const st = { a: 1, k: 0, hy: 17 };
  const fold = new DesmosFold(calc, {
    panel: $('#fd-fold'),
    onMatch: () => ({ text: `✓ 實線和虛線完全重合了！現在的圖形是 ${eqText(fold.st.a, fold.st.k)}。`, cls: 'ok' }),
  });
  fold.setTop(fitSquare(calc));
  lifecycle(root, calc, () => fold.setTop(fitSquare(calc, 11, st.hy)));

  const setMsg = (m) => { const el = $('#fd-msg'); el.textContent = m; el.className = 'msg bad'; };
  const sync = phone ? bindSliders(root, 'fd', calc, setMsg) : () => {};
  const refresh = () => { renderEq($('#fd-eq'), $('#fd-msg'), st.a, st.k); sync(st.a, st.k); };
  watch(calc, 'a', (v) => { st.a = v; refresh(); });
  watch(calc, 'k', (v) => {
    st.k = v;
    const h = neededHeight(v);
    if (h !== st.hy) { st.hy = h; fold.setTop(fitSquare(calc, 11, h)); }
    refresh();
  });
  // 全部重設：圖形回到 y = x²，清掉摺線、選點、虛線
  $('#fd-reset').addEventListener('click', () => {
    fold.clear();
    fold.setOrient(null);
    calc.setExpressions([{ id: 'a', latex: 'a=1' }, { id: 'k', latex: 'k=0' }]);
    st.hy = 17; fold.setTop(fitSquare(calc));
  });
  refresh();
  fold.refresh();
  window.__fold = fold;   // 測試用
}
