// 步驟卡片：任務頁面共用的「步驟 1 → 步驟 2」引導
//   active：目前要做的步驟（外框亮起）
//   waiting：還沒輪到（變暗，但仍可操作）
//   done：完成（打勾）
// 打勾清單：學習單表格要填的值，拉到時自動打勾

export function stepHTML(id, no, title, body) {
  return `
    <div class="card step" id="${id}">
      <h3><span class="step-no">${no}</span>${title}<span class="step-done">✓ 完成</span></h3>
      ${body}
      <div class="msg step-hint" aria-live="polite"></div>
    </div>`;
}

export function setStep(el, state, hint = '', hintCls = '') {
  el.className = `card step ${state}`;
  const h = el.querySelector(':scope > .step-hint');
  if (h) { h.textContent = hint; h.className = `msg step-hint ${hintCls}`; }
}

// items：[{ key, label(HTML) }]
export function checklistHTML(items) {
  return `<div class="checks">${items.map((i) => `<span class="check" data-k="${i.key}">${i.label}</span>`).join('')}</div>`;
}

export function markChecks(el, doneKeys) {
  el.querySelectorAll('.check').forEach((c) => c.classList.toggle('on', doneKeys.has(c.dataset.k)));
}

// 依序決定每個步驟的狀態：第一個未完成的是 active，之後的是 waiting
export function stepStates(doneFlags) {
  const first = doneFlags.indexOf(false);
  return doneFlags.map((d, i) => (d ? 'done' : i === first ? 'active' : 'waiting'));
}
