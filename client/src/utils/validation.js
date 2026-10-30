/** Client-side checks mirror the server rules so users get instant feedback. The server re-validates. */

export function validateEmail(email) {
  if (!email.trim()) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address';
  return '';
}

export function validatePassword(password) {
  if (!password) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 72) return 'Password must be at most 72 characters';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must contain a letter and a number';
  return '';
}

export function validateConfirm(password, confirm) {
  if (!confirm) return 'Please re-enter your password';
  return password === confirm ? '' : 'Passwords do not match';
}

export const PASSWORD_HINT = 'At least 8 characters, including a letter and a number.';

/** True when an errors object has no messages. */
export const isValid = (errors) => Object.values(errors).every((message) => !message);
