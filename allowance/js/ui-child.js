import { computeBalance } from './logic.js';
import { formatWon } from './format.js';
import { el } from './dom.js';
import { txRow } from './tx-row.js';

const SLOT_KEY = 'allowance.slot';

function readSlot() {
  try {
    return Number(localStorage.getItem(SLOT_KEY)) === 1 ? 1 : 0;
  } catch {
    return 0;
  }
}

function saveSlot(slot) {
  try {
    localStorage.setItem(SLOT_KEY, String(slot));
  } catch {
    /* 저장이 막힌 브라우저에서는 기억하지 않는다 */
  }
}

let refs = null;
let preferredSlot = 0;
let lastChildCount = 0;

function applyActive() {
  const effective = refs.slots[preferredSlot] && !refs.slots[preferredSlot].col.hidden ? preferredSlot : 0;
  refs.slots.forEach((slot, i) => {
    slot.tab.classList.toggle('active', i === effective);
    slot.col.classList.toggle('active', i === effective);
    slot.tab.setAttribute('aria-selected', String(i === effective));
  });
}

export function mount(root) {
  preferredSlot = readSlot();
  const tabs = el('div', { class: 'tabs', role: 'tablist' });
  const cols = el('div', { class: 'cols' });
  const empty = el('div', { class: 'empty', text: '아직 아이 이름이 정해지지 않았어요. 부모 모드에서 정해 주세요.', hidden: true });
  const slots = [0, 1].map((i) => {
    const tab = el('button', {
      class: 'tab',
      type: 'button',
      role: 'tab',
      onclick: () => {
        preferredSlot = i;
        saveSlot(i);
        applyActive();
      },
    });
    const name = el('h2');
    const amount = el('div', { class: 'amount' });
    const list = el('div', { class: 'list' });
    const col = el('div', { class: 'col', 'data-slot': String(i) }, name, el('div', { class: 'balance' }, el('div', { class: 'label', text: '현재 잔액' }), amount), list);
    tabs.append(tab);
    cols.append(col);
    return { tab, col, name, amount, list };
  });
  root.replaceChildren(tabs, cols, empty);
  refs = { tabs, cols, empty, slots };
  lastChildCount = 0;
}

export function update(state) {
  const { children, txs } = state;
  refs.empty.hidden = children.length > 0;
  refs.tabs.hidden = children.length === 0;
  refs.cols.hidden = children.length === 0;
  refs.slots.forEach((slot, i) => {
    const child = children[i];
    slot.tab.hidden = !child;
    slot.col.hidden = !child;
    if (!child) return;
    const list = txs[child.id] || [];
    slot.tab.textContent = child.name;
    slot.name.textContent = child.name;
    slot.amount.textContent = formatWon(computeBalance(list));
    slot.list.replaceChildren(
      ...(list.length ? list.map((tx) => txRow(tx)) : [el('div', { class: 'empty', text: '아직 내역이 없어요' })]),
    );
  });
  if (children.length !== lastChildCount) {
    lastChildCount = children.length;
    applyActive();
  }
}
