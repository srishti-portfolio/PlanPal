import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Field } from '../../components/Field.jsx';
import { Alert } from '../../components/Feedback.jsx';
import { PasswordInput } from '../../components/PasswordInput.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { isValid, validateEmail } from '../../utils/validation.js';
import { AuthLayout } from './AuthLayout.jsx';

export default function SignIn() {
  const { signIn } = useAuth();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const nextErrors = {
      email: validateEmail(form.email),
      password: form.password ? '' : 'Password is required',
    };
    setErrors(nextErrors);
    if (!isValid(nextErrors)) return;

    setBusy(true);
    setServerError('');
    try {
      await signIn({ email: form.email.trim(), password: form.password });
    } catch (err) {
      setServerError(err.message);
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to keep planning.">
      <Alert type="success">{location.state?.message}</Alert>
      <Alert>{serverError}</Alert>
      <form onSubmit={handleSubmit} className="stack" noValidate>
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={form.email}
          error={errors.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
        <PasswordInput
          label="Password"
          value={form.password}
          error={errors.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
        />
        <Link to="/forgot-password" className="align-end small">
          Forgot password?
        </Link>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="auth-switch">
        New to PlanPal? <Link to="/signup">Create an account</Link>
      </p>
    </AuthLayout>
  );
}
