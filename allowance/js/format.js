const withCommas = (n) => String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function formatWon(n) {
  return `${n < 0 ? '-' : ''}${withCommas(n)}원`;
}

export function formatSigned(n) {
  return `${n < 0 ? '-' : '+'}${withCommas(n)}원`;
}

export function formatDate(date) {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${mm}.${dd}`;
}
