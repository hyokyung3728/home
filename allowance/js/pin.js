const toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export const PIN_LENGTH = 6;
const LEGACY_PIN_LENGTH = 4;

export function isValidPinFormat(pin, length = PIN_LENGTH) {
  return typeof pin === 'string' && new RegExp(`^[0-9]{${length}}$`).test(pin);
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
  if (!stored || !isValidPinFormat(pin, stored.length ?? LEGACY_PIN_LENGTH)) return false;
  return (await hashPin(pin, stored.salt)) === stored.hash;
}
