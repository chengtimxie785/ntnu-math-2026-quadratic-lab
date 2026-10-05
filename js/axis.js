// 任務② 找對稱軸（學習單第三部分 3-(3)(4)）
// 步驟 1：拖曳垂直摺線、按對摺，找出讓 y = x² 左右完全重合的直線
// 步驟 2：點 (2, 4)、(−3, 9)，看它們沿對稱軸對摺後跑到哪裡（兩點都看過就完成）

import { withDesmos, makeCalc, baseExpressions, fitSquare, lifecycle, taskHeader } from './desmos-core.js';
import { DesmosFold } from './desmos-fold.js';
import { stepHTML, setStep, stepStates, checklistHTML, markChecks } from './steps.js';
import { mountSlider } from './slider.js';

export function mountAxis(root) {
  return withDesmos(root, build, mountSlider);
}

function build(root) {
  const PTS = [{ x: 2, label: '(2, 4)' }, { x: -3, label: '(−3, 9)' }];   // 學習單三-(4) 的兩個點
  root.innerHTML = `
    ${taskHeader('任務② 找對稱軸', 'y = x² 要沿著哪一條直線對摺，左右兩邊才會完全重合？', '三 3-(3)(4)')}
    <div class="lab">
      <div class="stage desmos-stage"><div id="ax-calc" class="desmos-box"></div></div>
      <div class="panel">
        ${stepHTML('ax-step1', 1, '找出對稱軸', '<p class="hint" style="margin:0 0 .4rem">拖曳橘色的摺線，放到你覺得對的位置，再按「對摺！」。不對就換個位置再試。</p>')}
        ${stepHTML('ax-step2', 2, '看看對稱點', `<p class="hint" style="margin:0 0 .4rem">點下面的點，看它沿著對稱軸對摺後會跑到哪裡。</p>${checklistHTML(PTS.map((p) => ({ key: String(p.x), label: p.label })))}`)}
      </div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  const D = window.Desmos;
  const calc = makeCalc($('#ax-calc'));
  calc.setExpressions(baseExpressions(D, { hideA: true, hideK: true }).filter((e) => e.id !== 'ref'));

  const st = { found: false, seen: new Set() };
  const fold = new DesmosFold(calc, {
    panel: $('#ax-step1'),
    pointsPanel: $('#ax-step2'),
    orients: ['v'],
    presets: [...PTS, { x: 1, label: '(1, 1)' }, { x: -1.5, label: '(−1.5, 2.25)' }],
    onResult: ({ same }) => {
      if (!same) return null;
      st.found = true;
      return { text: '✓ 找到了！沿著直線 x = 0（y 軸）對摺，左右兩邊完全重合，所以 y = x² 的對稱軸就是 y 軸。', cls: 'ok' };
    },
    onChange: () => update(),
  });

  function update() {
    const f = fold.st;
    // 摺線在對稱軸上時選的點，才算「看過對稱點」
    if (f.sel && f.orient === 'v' && f.c === 0) st.seen.add(String(f.p));
    markChecks($('#ax-step2'), st.seen);
    const allSeen = PTS.every((p) => st.seen.has(String(p.x)));
    const [s1, s2] = stepStates([st.found, allSeen]);
    setStep($('#ax-step1'), s1);
    setStep($('#ax-step2'), s2,
      !st.found ? '先在步驟 1 找到對稱軸。'
        : allSeen ? '✓ 兩個點都看過了，把它們的對稱點坐標寫進學習單三-(4)。'
          : f.c !== 0 ? '先把摺線移回對稱軸 x = 0，再點點看。' : '',
      allSeen ? 'ok' : '');
  }

  // 一開始把摺線放在 x = 2，讓學生自己拖到正確位置
  calc.setExpression({ id: 'c', latex: 'c=2' });
  fold.setTop(fitSquare(calc));
  lifecycle(root, calc, () => fold.setTop(fitSquare(calc)));
  fold.refresh();
  window.__fold = fold;   // 測試用
}
