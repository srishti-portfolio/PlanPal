import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';

// No 0/O or 1/I so codes are easy to read aloud and type.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Cryptographically random, human-friendly event join code (32^8 ≈ 1.1 trillion combinations). */
export function generateEventCode(length = 8) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export function generateOtp() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** OTPs are stored as keyed hashes so a database leak does not reveal live codes. */
export function hashOtp(code) {
  return crypto.createHmac('sha256', config.JWT_SECRET).update(String(code)).digest('hex');
}

export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function hashPassword(password) {
  return bcrypt.hash(password, config.BCRYPT_ROUNDS);
}

// Compared against when the email is unknown so login timing does not reveal registered emails.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-password', 4);

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash ?? DUMMY_HASH);
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
