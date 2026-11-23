import { formatSigned, formatDate } from './format.js';
import { el } from './dom.js';

export function txRow(tx, trailing) {
  const meta = [formatDate(tx.createdAt), tx.by, tx.cancelled && '취소됨', tx.pending && '저장 대기']
    .filter(Boolean)
    .join(' · ');
  return el(
    'div',
    { class: `tx${tx.cancelled ? ' cancelled' : ''}${tx.pending ? ' pending' : ''}` },
    el('div', {}, el('div', { class: 'reason', text: tx.reason }), el('div', { class: 'meta', text: meta })),
    el('div', { style: 'display:flex;align-items:center' }, el('div', { class: `money ${tx.amount < 0 ? 'out' : 'in'}`, text: formatSigned(tx.amount) }), trailing),
  );
}
