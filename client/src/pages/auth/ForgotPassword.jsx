import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import { Field } from '../../components/Field.jsx';
import { Alert } from '../../components/Feedback.jsx';
import { PasswordInput } from '../../components/PasswordInput.jsx';
import { isValid, PASSWORD_HINT, validateConfirm, validateEmail, validatePassword } from '../../utils/validation.js';
import { AuthLayout } from './AuthLayout.jsx';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState('email'); // email -> reset
  const [form, setForm] = useState({ email: '', code: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function run(action) {
    setBusy(true);
    setServerError('');
    try {
      await action();
    } catch (err) {
      setServerError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function requestCode(e) {
    e.preventDefault();
    const emailError = validateEmail(form.email);
    setErrors({ email: emailError });
    if (emailError) return;
    run(async () => {
      const data = await api('/auth/forgot-password', { method: 'POST', body: { email: form.email.trim() } });
      setMessage(data.message);
      setStep('reset');
    });
  }

  function resetPassword(e) {
    e.preventDefault();
    const nextErrors = {
      code: /^\d{6}$/.test(form.code.trim()) ? '' : 'Enter the 6-digit code from your email',
      newPassword: validatePassword(form.newPassword),
      confirmPassword: validateConfirm(form.newPassword, form.confirmPassword),
    };
    setErrors(nextErrors);
    if (!isValid(nextErrors)) return;
    run(async () => {
      const data = await api('/auth/reset-password', {
        method: 'POST',
        body: { ...form, email: form.email.trim(), code: form.code.trim() },
      });
      navigate('/signin', { replace: true, state: { message: data.message } });
    });
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle={step === 'email' ? "Enter your email and we'll send you a verification code." : `Check ${form.email} for a 6-digit code.`}
    >
      <Alert type="success">{message}</Alert>
      <Alert>{serverError}</Alert>
      {step === 'email' ? (
        <form onSubmit={requestCode} className="stack" noValidate>
          <Field label="Email" type="email" autoComplete="email" value={form.email} error={errors.email} onChange={update('email')} />
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Sending…' : 'Send code'}
          </button>
        </form>
      ) : (
        <form onSubmit={resetPassword} className="stack" noValidate>
          <Field
            label="Verification code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={form.code}
            error={errors.code}
            onChange={update('code')}
          />
          <PasswordInput
            label="New password"
            autoComplete="new-password"
            hint={PASSWORD_HINT}
            value={form.newPassword}
            error={errors.newPassword}
            onChange={update('newPassword')}
          />
          <PasswordInput
            label="Re-enter new password"
            autoComplete="new-password"
            value={form.confirmPassword}
            error={errors.confirmPassword}
            onChange={update('confirmPassword')}
          />
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Updating…' : 'Update password'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setStep('email')}>
            Use a different email
          </button>
        </form>
      )}
      <p className="auth-switch">
        Remembered it? <Link to="/signin">Back to sign in</Link>
      </p>
    </AuthLayout>
  );
}
