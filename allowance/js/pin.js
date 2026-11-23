const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export function isValidPinFormat(pin) {
  return typeof pin === 'string' && /^[0-9]{4}$/.test(pin);
}

export function newSalt() {
  return toHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPin(pin, saltHex) {
  const data = new TextEncoder().encode(`${saltHex}:${pin}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return toHex(new Uint8Array(digest));
}

export async function verifyPin(pin, stored) {
  if (!isValidPinFormat(pin) || !stored) return false;
  return (await hashPin(pin, stored.salt)) === stored.hash;
}
