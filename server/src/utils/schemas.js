import { z } from 'zod';

/** Shared zod building blocks so every route validates input the same way. */

export const uuid = z.string().uuid('Invalid id');

export const email = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .max(254)
  .email('Enter a valid email address');

export const password = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  // bcrypt ignores everything after 72 bytes.
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

export const name = z
  .string({ required_error: 'Name is required' })
  .trim()
  .min(1, 'Name is required')
  .max(80, 'Name must be at most 80 characters');

export const otpCode = z
  .string({ required_error: 'Verification code is required' })
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code from your email');

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Invalid date');

export const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .nullish()
    .transform((value) => (value ? value : null));

/** Reject a range whose end is before its start. */
export const dateRangeCheck = (startKey, endKey, message) => (data, ctx) => {
  if (data[startKey] && data[endKey] && data[endKey] < data[startKey]) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [endKey], message });
  }
};
