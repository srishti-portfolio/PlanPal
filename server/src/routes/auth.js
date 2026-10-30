import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/pool.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { authLimiter, otpLimiter } from '../middleware/rateLimits.js';
import { validate } from '../middleware/validate.js';
import { otpEmail, securityNoticeEmail, sendEmail, sendEmailInBackground, welcomeEmail } from '../services/email.js';
import { consumeOtp, issueOtp } from '../services/otp.js';
import * as s from '../utils/schemas.js';
import { hashPassword, verifyPassword } from '../utils/security.js';

const router = Router();

const publicUser = (user) => ({ id: user.id, name: user.name, email: user.email });

const signupSchema = z
  .object({
    name: s.name,
    email: s.email,
    password: s.password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

router.post('/signup', authLimiter, validate({ body: signupSchema }), async (req, res) => {
  const { name, email, password } = req.valid.body;
  const passwordHash = await hashPassword(password);

  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, name, email, token_version`,
    [name, email, passwordHash],
  );
  if (rows.length === 0) {
    throw new HttpError(409, 'An account with this email already exists. Try signing in.');
  }

  const user = rows[0];
  sendEmailInBackground(welcomeEmail(user));
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

const loginSchema = z.object({
  email: s.email,
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required').max(200),
});

router.post('/login', authLimiter, validate({ body: loginSchema }), async (req, res) => {
  const { email, password } = req.valid.body;
  const { rows } = await query(
    'SELECT id, name, email, password_hash, token_version FROM users WHERE email = $1',
    [email],
  );
  const user = rows[0];
  // Always run bcrypt so response time does not reveal whether the email exists.
  const passwordMatches = await verifyPassword(password, user?.password_hash);
  if (!user || !passwordMatches) {
    throw new HttpError(401, 'Incorrect email or password');
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.post(
  '/forgot-password',
  otpLimiter,
  validate({ body: z.object({ email: s.email }) }),
  async (req, res) => {
    const { email } = req.valid.body;
    const { rows } = await query('SELECT id, email FROM users WHERE email = $1', [email]);
    if (rows[0]) {
      const code = await issueOtp(rows[0].id, 'reset_password');
      await sendEmail(otpEmail(rows[0].email, code, 'reset_password'));
    }
    // Same answer whether or not the account exists, so emails cannot be enumerated.
    res.json({ message: 'If an account exists for that email, a verification code has been sent.' });
  },
);

const resetSchema = z
  .object({
    email: s.email,
    code: s.otpCode,
    newPassword: s.password,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

router.post('/reset-password', otpLimiter, validate({ body: resetSchema }), async (req, res) => {
  const { email, code, newPassword } = req.valid.body;
  const { rows } = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (!rows[0]) throw new HttpError(400, 'That code is invalid or has expired. Request a new one.');

  await consumeOtp(rows[0].id, 'reset_password', code);
  const passwordHash = await hashPassword(newPassword);
  await query(
    `UPDATE users SET password_hash = $1, token_version = token_version + 1, updated_at = now()
     WHERE id = $2`,
    [passwordHash, rows[0].id],
  );
  sendEmailInBackground(securityNoticeEmail(email, 'password reset'));
  res.json({ message: 'Password updated. You can now sign in with your new password.' });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
