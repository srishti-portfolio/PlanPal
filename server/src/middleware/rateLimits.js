import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

const base = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.isTest,
};

/** Sign-in / sign-up: slows down password guessing. */
export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 30,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

/** Anything that sends an email or checks a one-time code. */
export const otpLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 8,
  message: { error: 'Too many verification requests. Please wait 15 minutes.' },
});

/** Joining by code: prevents brute-forcing event codes. */
export const joinLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: { error: 'Too many join attempts. Please wait a few minutes.' },
});

/** Gemini calls cost money: cap them per signed-in user. Must run after requireAuth. */
export const aiLimiter = rateLimit({
  ...base,
  windowMs: 60 * 1000,
  limit: 15,
  keyGenerator: (req) => req.user.id,
  message: { error: 'You are sending messages too quickly. Please wait a moment.' },
});
