// 任務② 找對稱軸（學習單第三部分 3-(3)(4)）
// 步驟 1：拖曳垂直摺線、按對摺，找出讓 y = x² 左右完全重合的直線
// 步驟 2（找到後出現）：點選圖形上的點，看它對摺後跑到哪裡

import { withDesmos, makeCalc, baseExpressions, fitSquare, lifecycle, taskHeader } from './desmos-core.js';
import { DesmosFold } from './desmos-fold.js';
import { mountSlider } from './slider.js';

export function mountAxis(root) {
  return withDesmos(root, build, mountSlider);
}

function build(root) {
  root.innerHTML = `
    ${taskHeader('任務② 找對稱軸', 'y = x² 要沿著哪一條直線對摺，左右兩邊才會完全重合？', '三 3-(3)(4)')}
    <div class="lab">
      <div class="stage desmos-stage"><div id="ax-calc" class="desmos-box"></div></div>
      <div class="panel">
        <div class="card" id="ax-step1">
          <h3>步驟 1　找出對稱軸</h3>
          <p class="hint" style="margin-bottom:.4rem">拖曳橘色的摺線，放到你覺得對的位置，再按「對摺！」。不對就換個位置再試。</p>
        </div>
        <div class="card" id="ax-step2" hidden>
          <h3>步驟 2　看看對稱點</h3>
          <p class="hint" style="margin-bottom:.4rem">點下面的點，看看它沿著對稱軸對摺後，會跑到哪裡。</p>
        </div>
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const D = window.Desmos;
  const calc = makeCalc($('#ax-calc'));
  calc.setExpressions(baseExpressions(D, { hideA: true, hideK: true }).filter((e) => e.id !== 'ref'));

  const fold = new DesmosFold(calc, {
    panel: $('#ax-step1'),
    pointsPanel: $('#ax-step2'),
    orients: ['v'],
    presets: [{ x: 2, label: '(2, 4)' }, { x: -3, label: '(−3, 9)' }, { x: 1, label: '(1, 1)' }, { x: -1.5, label: '(−1.5, 2.25)' }],
    onResult: ({ same }) => {
      if (!same) return null;
      $('#ax-step2').hidden = false;
      return { text: '✓ 找到了！沿著直線 x = 0（y 軸）對摺，左右兩邊完全重合，所以 y = x² 的對稱軸就是 y 軸。接著做步驟 2。', cls: 'ok' };
    },
  });
  // 一開始把摺線放在 x = 2，讓學生自己拖到正確位置
  calc.setExpression({ id: 'c', latex: 'c=2' });
  fold.setTop(fitSquare(calc));
  lifecycle(root, calc, () => fold.setTop(fitSquare(calc)));
  fold.refresh();
  window.__fold = fold;   // 測試用
}
