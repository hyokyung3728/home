import { LIMITS, computeAvailable, validateTransaction, validateCancel } from './logic.js';
import { createIdleLock } from './idle.js';
import { hashPin, newSalt, verifyPin, isValidPinFormat } from './pin.js';
import { formatWon } from './format.js';
import { el } from './dom.js';
import * as childUi from './ui-child.js';
import * as parentUi from './ui-parent.js';

const params = new URLSearchParams(location.search);
const store = await import(params.has('demo') ? './store-demo.js' : './store.js');
const LOCK_MS = Math.min(120000, Number(params.get('lock')) || 120000);

const LOCK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

const ADD_ERRORS = {
  AMOUNT_INVALID: '금액은 1원 이상의 숫자로 입력해 주세요.',
  AMOUNT_TOO_LARGE: `한 번에 ${formatWon(LIMITS.MAX_AMOUNT)}까지 입력할 수 있어요.`,
  REASON_EMPTY: '사유를 입력해 주세요.',
  REASON_TOO_LONG: `사유는 ${LIMITS.MAX_REASON}자까지 쓸 수 있어요.`,
  INSUFFICIENT: '잔액이 부족해요.',
};
const CANCEL_ERRORS = {
  ALREADY_CANCELLED: '이미 취소된 내역이에요.',
  INSUFFICIENT: '이 입금을 취소하면 잔액이 마이너스가 돼요.',
};
const TIMEOUT_NOTICE =
  '연결이 불안정해요. 인터넷에 다시 연결되면 자동으로 저장되니, 같은 내용을 다시 입력하지 마세요.';
const SAVE_FAILED = '저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.';

const state = {
  mode: 'child',
  user: null,
  role: null,
  children: [],
  txs: {},
  reasons: [],
  selectedChildId: null,
};
const txSubs = new Map();
let reasonsSub = null;
let idle = null;
let active = null;
let busy = false;

const main = document.getElementById('main');
const gate = document.getElementById('gate');
const lockButton = document.getElementById('lock');
const toastEl = document.getElementById('toast');

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => toastEl.classList.remove('show'), 3500);
}

function availableOf(childId) {
  return computeAvailable(state.txs[childId] || []);
}

function render() {
  active?.update(state);
}

function updateLockButton() {
  lockButton.innerHTML = LOCK_ICON;
  lockButton.append(state.mode === 'parent' ? '잠그기' : '부모 모드');
  lockButton.setAttribute('aria-label', state.mode === 'parent' ? '자녀 모드로 돌아가기' : '부모 모드');
}

function setMode(mode) {
  state.mode = mode;
  document.body.dataset.mode = mode;
  main.replaceChildren();
  active = mode === 'parent' ? parentUi : childUi;
  active.mount(main, actions);
  render();
  updateLockButton();
}

function lockToChild() {
  idle?.stop();
  idle = null;
  closeGate();
  if (state.mode !== 'child' || !active) setMode('child');
}

function enterParent() {
  closeGate();
  setMode('parent');
  idle?.stop();
  idle = createIdleLock(LOCK_MS, lockToChild);
}

for (const type of ['pointerdown', 'keydown', 'input', 'scroll']) {
  document.addEventListener(type, () => idle?.touch(), true);
}
for (const type of ['visibilitychange', 'pageshow', 'focus']) {
  window.addEventListener(type, () => idle?.check());
}

function closeGate() {
  gate.hidden = true;
  gate.replaceChildren();
}

function openGate(...content) {
  gate.replaceChildren(el('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' }, ...content));
  gate.hidden = false;
}

gate.addEventListener('pointerdown', (e) => {
  if (e.target === gate) closeGate();
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForUser() {
  for (let i = 0; i < 30 && !state.user; i++) await sleep(100);
}

function showLoginGate(message) {
  const error = el('div', { class: 'error', text: message || '' });
  const loginButton = el('button', { class: 'primary', type: 'button', text: '구글 계정으로 로그인' });
  loginButton.addEventListener('click', async () => {
    loginButton.disabled = true;
    error.textContent = '';
    try {
      await store.signInWithGoogle();
      await waitForUser();
    } catch {
      error.textContent = '로그인하지 못했어요. 다시 시도해 주세요.';
      loginButton.disabled = false;
      return;
    }
    if (state.role) {
      startPinFlow();
    } else {
      await store.signOutUser();
      showLoginGate('이 계정은 부모 계정으로 등록되어 있지 않아요.');
    }
  });
  openGate(
    el('h2', { text: '부모 로그인이 필요해요' }),
    el('p', { text: '부모 모드는 부모님 계정으로 로그인한 기기에서만 열 수 있어요.' }),
    error,
    el('div', { class: 'row' }, el('button', { type: 'button', text: '닫기', onclick: closeGate }), loginButton),
  );
}

function pinInput(label) {
  return el('input', {
    class: 'text',
    type: 'password',
    inputmode: 'numeric',
    maxlength: '4',
    autocomplete: 'off',
    'aria-label': label,
    placeholder: label,
  });
}

async function startPinFlow() {
  let stored;
  try {
    stored = await store.getPin();
  } catch {
    showLoginGate('PIN 정보를 불러오지 못했어요. 다시 로그인해 주세요.');
    return;
  }
  stored ? showPinGate(stored) : showSetPinGate();
}

function showPinGate(stored) {
  const input = pinInput('PIN 4자리');
  const error = el('div', { class: 'error' });
  const submit = async () => {
    if (await verifyPin(input.value, stored)) {
      enterParent();
    } else {
      error.textContent = 'PIN이 맞지 않아요.';
      input.value = '';
      input.focus();
    }
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
  openGate(
    el('h2', { text: 'PIN을 입력해 주세요' }),
    input,
    error,
    el('div', { class: 'row' }, el('button', { type: 'button', text: '닫기', onclick: closeGate }), el('button', { class: 'primary', type: 'button', text: '확인', onclick: submit })),
  );
  input.focus();
}

function showSetPinGate() {
  const first = pinInput('새 PIN 4자리');
  const second = pinInput('PIN 한 번 더');
  const error = el('div', { class: 'error' });
  const submit = async () => {
    if (!isValidPinFormat(first.value)) {
      error.textContent = 'PIN은 숫자 4자리로 정해 주세요.';
    } else if (first.value !== second.value) {
      error.textContent = '두 PIN이 서로 달라요.';
    } else {
      const salt = newSalt();
      try {
        await store.setPin({ salt, hash: await hashPin(first.value, salt) });
      } catch {
        error.textContent = SAVE_FAILED;
        return;
      }
      toast('PIN을 정했어요');
      enterParent();
    }
  };
  openGate(
    el('h2', { text: 'PIN을 정해 주세요' }),
    el('p', { text: '부모 모드를 열 때 쓰는 숫자 4자리예요. 두 분이 같은 PIN을 함께 써요.' }),
    first,
    second,
    error,
    el('div', { class: 'row' }, el('button', { type: 'button', text: '닫기', onclick: closeGate }), el('button', { class: 'primary', type: 'button', text: '정하기', onclick: submit })),
  );
  first.focus();
}

lockButton.addEventListener('click', () => {
  if (state.mode === 'parent') lockToChild();
  else if (!state.role) showLoginGate();
  else startPinFlow();
});

async function guarded(work) {
  if (busy) return { ok: false, message: '' };
  busy = true;
  try {
    return await work();
  } finally {
    busy = false;
  }
}

const actions = {
  selectChild(id) {
    state.selectedChildId = id;
    render();
  },
  submit: ({ type, amount, reason }) =>
    guarded(async () => {
      const childId = state.selectedChildId;
      const result = validateTransaction({ type, amount, reason }, availableOf(childId));
      if (!result.ok) return { ok: false, message: ADD_ERRORS[result.code] };
      try {
        await store.addTransaction({ childId, signedAmount: result.signedAmount, reason: result.reason });
        return { ok: true };
      } catch (err) {
        if (err.message === 'SAVE_TIMEOUT') return { ok: true, notice: TIMEOUT_NOTICE };
        return { ok: false, message: SAVE_FAILED };
      }
    }),
  cancel: (txId) =>
    guarded(async () => {
      const entry = Object.entries(state.txs).find(([, list]) => list.some((t) => t.id === txId));
      if (!entry) return { ok: false, message: '내역을 찾을 수 없어요.' };
      const [childId, list] = entry;
      const result = validateCancel(list.find((t) => t.id === txId), availableOf(childId));
      if (!result.ok) return { ok: false, message: CANCEL_ERRORS[result.code] };
      try {
        await store.cancelTransaction(txId);
        return { ok: true };
      } catch (err) {
        if (err.message === 'SAVE_TIMEOUT') return { ok: true, notice: TIMEOUT_NOTICE };
        return { ok: false, message: SAVE_FAILED };
      }
    }),
  addReason: (text) =>
    guarded(async () => {
      const value = (text || '').trim();
      if (!value) return { ok: false, message: ADD_ERRORS.REASON_EMPTY };
      if (Array.from(value).length > LIMITS.MAX_REASON) return { ok: false, message: ADD_ERRORS.REASON_TOO_LONG };
      if (state.reasons.some((r) => r.text === value)) return { ok: false, message: '이미 저장된 사유예요.' };
      try {
        await store.addReason(value);
        return { ok: true };
      } catch {
        return { ok: false, message: SAVE_FAILED };
      }
    }),
  removeReason: (id) =>
    guarded(async () => {
      try {
        await store.removeReason(id);
        return { ok: true };
      } catch {
        return { ok: false, message: SAVE_FAILED };
      }
    }),
  saveChildren: (names) =>
    guarded(async () => {
      const cleaned = names.map((n) => (n || '').trim());
      if (cleaned.some((n) => !n)) return { ok: false, message: '두 아이의 이름을 모두 입력해 주세요.' };
      try {
        await store.createChildren(cleaned);
        return { ok: true };
      } catch {
        return { ok: false, message: SAVE_FAILED };
      }
    }),
};

store.onAuth((user, role) => {
  state.user = user;
  state.role = role;
  if (role) {
    reasonsSub ??= store.subscribeReasons((reasons) => {
      state.reasons = reasons;
      render();
    });
  } else {
    reasonsSub?.();
    reasonsSub = null;
    state.reasons = [];
    if (state.mode === 'parent') lockToChild();
  }
  render();
});

store.subscribeChildren((children) => {
  state.children = children;
  if (!children.some((c) => c.id === state.selectedChildId)) state.selectedChildId = children[0]?.id ?? null;
  for (const child of children) {
    if (txSubs.has(child.id)) continue;
    txSubs.set(
      child.id,
      store.subscribeTransactions(child.id, (txs) => {
        state.txs[child.id] = txs;
        render();
      }),
    );
  }
  render();
});

setMode('child');
