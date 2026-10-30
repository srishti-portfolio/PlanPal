import { query } from '../db/pool.js';
import { HttpError } from '../middleware/errors.js';
import { generateOtp, hashOtp, safeEqual } from '../utils/security.js';

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

/** Create a fresh code for `purpose`, invalidating any earlier unused one. Returns the plain code. */
export async function issueOtp(userId, purpose, payload = null) {
  const code = generateOtp();
  await query(
    'UPDATE email_otps SET consumed_at = now() WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL',
    [userId, purpose],
  );
  await query(
    `INSERT INTO email_otps (user_id, purpose, code_hash, payload, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(mins => $5))`,
    [userId, purpose, hashOtp(code), payload, OTP_TTL_MINUTES],
  );
  return code;
}

/**
 * Verify and consume a code. Returns the payload stored with it.
 * Each wrong guess counts toward a small attempt limit.
 */
export async function consumeOtp(userId, purpose, code) {
  const invalid = new HttpError(400, 'That code is invalid or has expired. Request a new one.');

  const { rows } = await query(
    `SELECT id, code_hash, payload, attempts FROM email_otps
     WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1`,
    [userId, purpose],
  );
  const otp = rows[0];
  if (!otp || otp.attempts >= OTP_MAX_ATTEMPTS) throw invalid;

  if (!safeEqual(otp.code_hash, hashOtp(code))) {
    await query('UPDATE email_otps SET attempts = attempts + 1 WHERE id = $1', [otp.id]);
    throw invalid;
  }

  // Guard against the same code being redeemed twice concurrently.
  const consumed = await query(
    'UPDATE email_otps SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL RETURNING id',
    [otp.id],
  );
  if (consumed.rowCount === 0) throw invalid;

  return otp.payload;
}
