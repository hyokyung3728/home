export const LIMITS = { MAX_AMOUNT: 100000, MAX_REASON: 50 };

export function computeBalance(transactions) {
  return transactions.reduce((sum, tx) => (tx.cancelled || tx.pending ? sum : sum + tx.amount), 0);
}

export function computeAvailable(transactions) {
  const pendingWithdrawals = transactions
    .filter((tx) => tx.pending && !tx.cancelled && tx.amount < 0)
    .reduce((sum, tx) => sum + tx.amount, 0);
  return computeBalance(transactions) + pendingWithdrawals;
}

function parseAmount(raw) {
  if (typeof raw === 'number') return Number.isInteger(raw) && raw > 0 ? raw : null;
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    const n = Number(raw.trim());
    return n > 0 ? n : null;
  }
  return null;
}

export function validateTransaction({ type, amount, reason }, balance) {
  const value = parseAmount(amount);
  if (value === null) return { ok: false, code: 'AMOUNT_INVALID' };
  if (value > LIMITS.MAX_AMOUNT) return { ok: false, code: 'AMOUNT_TOO_LARGE' };

  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text === '') return { ok: false, code: 'REASON_EMPTY' };
  if (Array.from(text).length > LIMITS.MAX_REASON) return { ok: false, code: 'REASON_TOO_LONG' };

  if (type === 'withdraw' && value > balance) return { ok: false, code: 'INSUFFICIENT' };
  return { ok: true, signedAmount: type === 'withdraw' ? -value : value, reason: text };
}

export function validateCancel(tx, balance) {
  if (tx.cancelled) return { ok: false, code: 'ALREADY_CANCELLED' };
  if (tx.amount > 0 && balance - tx.amount < 0) return { ok: false, code: 'INSUFFICIENT' };
  return { ok: true };
}
