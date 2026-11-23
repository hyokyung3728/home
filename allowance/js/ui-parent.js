import { computeBalance } from './logic.js';
import { formatWon } from './format.js';
import { el } from './dom.js';
import { txRow } from './tx-row.js';

let refs = null;
let latest = null;
let ctl = null;
let ui = { type: 'deposit', editing: false };

function currentChild() {
  return latest?.children.find((c) => c.id === latest.selectedChildId) ?? null;
}

export function mount(root, actions) {
  ctl = actions;
  ui = { type: 'deposit', editing: false };

  const cardRefs = [0, 1].map((i) => {
    const name = el('div', { class: 'name' });
    const amount = el('div', { class: 'amount' });
    const btn = el('button', { class: 'card', type: 'button', onclick: () => ctl.selectChild(latest.children[i].id) }, name, amount);
    return { btn, name, amount };
  });
  const cards = el('div', { class: 'cards' }, cardRefs.map((c) => c.btn));

  const nameInputs = [0, 1].map((i) =>
    el('input', { class: 'text', maxlength: '10', placeholder: i === 0 ? '첫째 이름' : '둘째 이름', 'aria-label': i === 0 ? '첫째 이름' : '둘째 이름' }),
  );
  const setupError = el('div', { class: 'error' });
  const setupBox = el(
    'div',
    { class: 'panel' },
    el('h2', { text: '아이 이름을 정해 주세요' }),
    nameInputs,
    setupError,
    el('button', {
      class: 'submit',
      type: 'button',
      style: 'background:var(--accent)',
      text: '저장하기',
      onclick: async () => {
        const result = await ctl.saveChildren(nameInputs.map((input) => input.value));
        setupError.textContent = result.ok ? '' : result.message;
      },
    }),
  );

  const switchButtons = [
    el('button', { type: 'button', class: 'in', text: '입금', onclick: () => setType('deposit') }),
    el('button', { type: 'button', class: 'out', text: '출금', onclick: () => setType('withdraw') }),
  ];
  const amountInput = el('input', { class: 'text amount-input', inputmode: 'numeric', placeholder: '0', autocomplete: 'off', 'aria-label': '금액(원)' });
  const quick = el(
    'div',
    { class: 'chips' },
    [100, 500, 1000].map((n) =>
      el('button', {
        class: 'chip',
        type: 'button',
        text: `+${n.toLocaleString('en-US')}`,
        onclick: () => {
          amountInput.value = String((Number(amountInput.value) || 0) + n);
        },
      }),
    ),
  );
  const reasonInput = el('input', { class: 'text', maxlength: '50', placeholder: '예: 동생에게 책 읽어주기', autocomplete: 'off', 'aria-label': '사유' });
  const chips = el('div', { class: 'chips' });
  const error = el('div', { class: 'error' });
  const notice = el('div', { class: 'notice' });
  const submit = el('button', { class: 'submit', type: 'button' });
  submit.addEventListener('click', async () => {
    submit.disabled = true;
    error.textContent = '';
    notice.textContent = '';
    try {
      const result = await ctl.submit({ type: ui.type, amount: amountInput.value, reason: reasonInput.value });
      if (result.ok) {
        amountInput.value = '';
        reasonInput.value = '';
        notice.textContent = result.notice || '';
      } else {
        error.textContent = result.message || '';
      }
    } finally {
      submit.disabled = false;
    }
  });
  const formBox = el(
    'div',
    { class: 'panel' },
    el('div', { class: 'switch' }, switchButtons),
    el('label', { class: 'field', text: '금액' }),
    amountInput,
    quick,
    el('label', { class: 'field', text: '사유' }),
    reasonInput,
    chips,
    error,
    notice,
    submit,
  );

  const historyTitle = el('h2');
  const historyError = el('div', { class: 'error' });
  const historyList = el('div', { class: 'list' });
  const historyBox = el('div', { class: 'history' }, historyTitle, historyError, historyList);

  function setType(type) {
    ui.type = type;
    error.textContent = '';
    update(latest);
  }

  root.replaceChildren(cards, setupBox, formBox, historyBox);
  refs = { cardRefs, cards, setupBox, formBox, historyBox, switchButtons, chips, submit, historyTitle, historyError, historyList, reasonInput, error };
  refs.reasonChips = { chips, reasonInput, error };
}

function renderChips() {
  const { chips, reasonInput, error } = refs.reasonChips;
  const saved = latest.reasons.map((reason) =>
    el('button', {
      class: `chip${ui.editing ? ' remove' : ''}`,
      type: 'button',
      text: reason.text,
      onclick: async () => {
        if (ui.editing) {
          const result = await ctl.removeReason(reason.id);
          error.textContent = result.ok ? '' : result.message;
        } else {
          reasonInput.value = reason.text;
        }
      },
    }),
  );
  const saveCurrent = el('button', {
    class: 'chip ghost',
    type: 'button',
    text: '+ 지금 사유 저장',
    onclick: async () => {
      const result = await ctl.addReason(reasonInput.value);
      error.textContent = result.ok ? '' : result.message;
    },
  });
  const toggle = el('button', {
    class: 'chip ghost',
    type: 'button',
    text: ui.editing ? '편집 끝' : '편집',
    onclick: () => {
      ui.editing = !ui.editing;
      renderChips();
    },
  });
  chips.replaceChildren(...saved, saveCurrent, ...(saved.length ? [toggle] : []));
}

export function update(state) {
  latest = state;
  const ready = state.children.length >= 2;
  refs.cards.hidden = !ready;
  refs.formBox.hidden = !ready;
  refs.historyBox.hidden = !ready;
  refs.setupBox.hidden = ready;
  if (!ready) return;

  state.children.slice(0, 2).forEach((child, i) => {
    const card = refs.cardRefs[i];
    card.name.textContent = child.name;
    card.amount.textContent = formatWon(computeBalance(state.txs[child.id] || []));
    card.btn.classList.toggle('selected', child.id === state.selectedChildId);
    card.btn.setAttribute('aria-pressed', String(child.id === state.selectedChildId));
  });

  const child = currentChild();
  if (!child) return;
  const deposit = ui.type === 'deposit';
  refs.switchButtons[0].classList.toggle('on', deposit);
  refs.switchButtons[1].classList.toggle('on', !deposit);
  refs.submit.classList.toggle('out', !deposit);
  refs.submit.textContent = `${child.name}${deposit ? '에게 입금하기' : '에게서 출금하기'}`;
  renderChips();

  const list = state.txs[child.id] || [];
  refs.historyTitle.textContent = `${child.name}의 최근 내역`;
  refs.historyList.replaceChildren(
    ...(list.length
      ? list.map((tx) =>
          txRow(
            tx,
            tx.cancelled || tx.pending
              ? null
              : el('button', {
                  class: 'cancel-btn',
                  type: 'button',
                  text: '취소',
                  onclick: async () => {
                    if (!window.confirm('이 내역을 취소할까요? 잔액이 되돌아가요.')) return;
                    const result = await ctl.cancel(tx.id);
                    refs.historyError.textContent = result.ok ? result.notice || '' : result.message;
                  },
                }),
          ),
        )
      : [el('div', { class: 'empty', text: '아직 내역이 없어요' })]),
  );
}
