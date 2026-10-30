import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Field } from '../../components/Field.jsx';
import { Alert } from '../../components/Feedback.jsx';
import { PasswordInput } from '../../components/PasswordInput.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { isValid, PASSWORD_HINT, validateConfirm, validateEmail, validatePassword } from '../../utils/validation.js';
import { AuthLayout } from './AuthLayout.jsx';

export default function SignUp() {
  const { signUp } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    const nextErrors = {
      name: form.name.trim() ? '' : 'Name is required',
      email: validateEmail(form.email),
      password: validatePassword(form.password),
      confirmPassword: validateConfirm(form.password, form.confirmPassword),
    };
    setErrors(nextErrors);
    if (!isValid(nextErrors)) return;

    setBusy(true);
    setServerError('');
    try {
      await signUp({ ...form, name: form.name.trim(), email: form.email.trim() });
    } catch (err) {
      setServerError(err.message);
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Create your account" subtitle="We'll send a welcome email to your inbox.">
      <Alert>{serverError}</Alert>
      <form onSubmit={handleSubmit} className="stack" noValidate>
        <Field label="Name" autoComplete="name" maxLength={80} value={form.name} error={errors.name} onChange={update('name')} />
        <Field label="Email" type="email" autoComplete="email" value={form.email} error={errors.email} onChange={update('email')} />
        <PasswordInput
          label="Password"
          autoComplete="new-password"
          hint={PASSWORD_HINT}
          value={form.password}
          error={errors.password}
          onChange={update('password')}
        />
        <PasswordInput
          label="Re-enter password"
          autoComplete="new-password"
          value={form.confirmPassword}
          error={errors.confirmPassword}
          onChange={update('confirmPassword')}
        />
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
      <p className="auth-switch">
        Already have an account? <Link to="/signin">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
