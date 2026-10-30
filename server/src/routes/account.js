import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { otpLimiter } from '../middleware/rateLimits.js';
import { validate } from '../middleware/validate.js';
import { otpEmail, securityNoticeEmail, sendEmail, sendEmailInBackground } from '../services/email.js';
import { consumeOtp, issueOtp } from '../services/otp.js';
import * as s from '../utils/schemas.js';
import { hashPassword, verifyPassword } from '../utils/security.js';

const router = Router();
router.use(requireAuth);

async function assertCurrentPassword(userId, currentPassword) {
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  if (!(await verifyPassword(currentPassword, rows[0]?.password_hash))) {
    throw new HttpError(400, 'Your current password is incorrect');
  }
}

const currentPassword = z.string({ required_error: 'Current password is required' }).min(1).max(200);

router.patch('/profile', validate({ body: z.object({ name: s.name }) }), async (req, res) => {
  const { rows } = await query(
    'UPDATE users SET name = $1, updated_at = now() WHERE id = $2 RETURNING id, name, email',
    [req.valid.body.name, req.user.id],
  );
  res.json({ user: rows[0] });
});

// --- Change email: a code is sent to the CURRENT address to prove the owner is requesting it. ---

router.post(
  '/email/request',
  otpLimiter,
  validate({ body: z.object({ newEmail: s.email, currentPassword }) }),
  async (req, res) => {
    const { newEmail } = req.valid.body;
    if (newEmail === req.user.email) throw new HttpError(400, 'That is already your email address');
    await assertCurrentPassword(req.user.id, req.valid.body.currentPassword);

    const taken = await query('SELECT 1 FROM users WHERE email = $1', [newEmail]);
    if (taken.rowCount > 0) throw new HttpError(409, 'That email is already used by another account');

    const code = await issueOtp(req.user.id, 'change_email', { newEmail });
    await sendEmail(otpEmail(req.user.email, code, 'change_email'));
    res.json({ message: `We sent a verification code to ${req.user.email}.` });
  },
);

router.post(
  '/email/confirm',
  otpLimiter,
  validate({ body: z.object({ code: s.otpCode }) }),
  async (req, res) => {
    const payload = await consumeOtp(req.user.id, 'change_email', req.valid.body.code);
    const { rows } = await query(
      `UPDATE users SET email = $1, updated_at = now() WHERE id = $2
       RETURNING id, name, email, token_version`,
      [payload.newEmail, req.user.id],
    );
    const user = rows[0];
    sendEmailInBackground(securityNoticeEmail(req.user.email, `email changed to ${user.email}`));
    sendEmailInBackground(securityNoticeEmail(user.email, 'this address is now your PlanPal login email'));
    res.json({ token: signToken(user), user: { id: user.id, name: user.name, email: user.email } });
  },
);

// --- Change password: requires the current password AND a code sent to the account email. ---

router.post(
  '/password/request',
  otpLimiter,
  validate({ body: z.object({ currentPassword }) }),
  async (req, res) => {
    await assertCurrentPassword(req.user.id, req.valid.body.currentPassword);
    const code = await issueOtp(req.user.id, 'change_password');
    await sendEmail(otpEmail(req.user.email, code, 'change_password'));
    res.json({ message: `We sent a verification code to ${req.user.email}.` });
  },
);

const confirmPasswordSchema = z
  .object({ code: s.otpCode, newPassword: s.password, confirmPassword: z.string() })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

router.post(
  '/password/confirm',
  otpLimiter,
  validate({ body: confirmPasswordSchema }),
  async (req, res) => {
    await consumeOtp(req.user.id, 'change_password', req.valid.body.code);
    const passwordHash = await hashPassword(req.valid.body.newPassword);
    // Bumping token_version signs out every other device.
    const { rows } = await query(
      `UPDATE users SET password_hash = $1, token_version = token_version + 1, updated_at = now()
       WHERE id = $2 RETURNING id, name, email, token_version`,
      [passwordHash, req.user.id],
    );
    sendEmailInBackground(securityNoticeEmail(req.user.email, 'password changed'));
    res.json({ token: signToken(rows[0]), message: 'Password changed. Other devices have been signed out.' });
  },
);

export default router;
