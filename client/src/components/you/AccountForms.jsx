import { useState } from 'react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { isValid, PASSWORD_HINT, validateConfirm, validateEmail, validatePassword } from '../../utils/validation.js';
import { Field } from '../Field.jsx';
import { Alert } from '../Feedback.jsx';
import { PasswordInput } from '../PasswordInput.jsx';

/** Shared submit state for the small account forms. */
function useSubmit() {
  const [state, setState] = useState({ busy: false, error: '', success: '' });
  async function run(action) {
    setState({ busy: true, error: '', success: '' });
    try {
      const success = await action();
      setState({ busy: false, error: '', success: success ?? '' });
    } catch (err) {
      setState({ busy: false, error: err.message, success: '' });
    }
  }
  return [state, run];
}

export function ProfileForm() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [{ busy, error, success }, run] = useSubmit();

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          if (!name.trim()) throw new Error('Name is required');
          const data = await api('/account/profile', { method: 'PATCH', body: { name: name.trim() } });
          updateUser(data.user);
          return 'Name updated.';
        });
      }}
    >
      <Alert>{error}</Alert>
      <Alert type="success">{success}</Alert>
      <Field label="Name" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit" className="btn btn-secondary" disabled={busy || name.trim() === user.name}>
        Save name
      </button>
    </form>
  );
}

/** Two steps: request (sends a code to the CURRENT email) → confirm with that code. */
export function EmailChangeForm() {
  const { user, startSession } = useAuth();
  const [step, setStep] = useState('request');
  const [form, setForm] = useState({ newEmail: '', currentPassword: '', code: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [{ busy, error, success }, run] = useSubmit();
  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  function request(e) {
    e.preventDefault();
    const errors = {
      newEmail: validateEmail(form.newEmail),
      currentPassword: form.currentPassword ? '' : 'Current password is required',
    };
    setFieldErrors(errors);
    if (!isValid(errors)) return;
    run(async () => {
      const data = await api('/account/email/request', {
        method: 'POST',
        body: { newEmail: form.newEmail.trim(), currentPassword: form.currentPassword },
      });
      setStep('confirm');
      return data.message;
    });
  }

  function confirm(e) {
    e.preventDefault();
    run(async () => {
      const data = await api('/account/email/confirm', { method: 'POST', body: { code: form.code.trim() } });
      startSession(data);
      setForm({ newEmail: '', currentPassword: '', code: '' });
      setStep('request');
      return `Your email is now ${data.user.email}.`;
    });
  }

  return (
    <div className="stack">
      <p className="muted small">
        Current email: <strong>{user.email}</strong>. For security, we&apos;ll send a code to this address before changing it.
      </p>
      <Alert>{error}</Alert>
      <Alert type="success">{success}</Alert>
      {step === 'request' ? (
        <form className="stack" onSubmit={request} noValidate>
          <Field label="New email" type="email" autoComplete="email" value={form.newEmail} error={fieldErrors.newEmail} onChange={update('newEmail')} />
          <PasswordInput
            label="Current password"
            value={form.currentPassword}
            error={fieldErrors.currentPassword}
            onChange={update('currentPassword')}
          />
          <button type="submit" className="btn btn-secondary" disabled={busy}>
            {busy ? 'Sending…' : 'Send verification code'}
          </button>
        </form>
      ) : (
        <form className="stack" onSubmit={confirm}>
          <Field
            label={`Code sent to ${user.email}`}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            value={form.code}
            onChange={update('code')}
          />
          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Confirm new email
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setStep('request')}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Two steps: current password → code sent by email + new password. */
export function PasswordChangeForm() {
  const { user, startSession } = useAuth();
  const [step, setStep] = useState('request');
  const [form, setForm] = useState({ currentPassword: '', code: '', newPassword: '', confirmPassword: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [{ busy, error, success }, run] = useSubmit();
  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  function request(e) {
    e.preventDefault();
    run(async () => {
      if (!form.currentPassword) throw new Error('Enter your current password');
      const data = await api('/account/password/request', {
        method: 'POST',
        body: { currentPassword: form.currentPassword },
      });
      setStep('confirm');
      return data.message;
    });
  }

  function confirm(e) {
    e.preventDefault();
    const errors = {
      code: /^\d{6}$/.test(form.code.trim()) ? '' : 'Enter the 6-digit code',
      newPassword: validatePassword(form.newPassword),
      confirmPassword: validateConfirm(form.newPassword, form.confirmPassword),
    };
    setFieldErrors(errors);
    if (!isValid(errors)) return;
    run(async () => {
      const data = await api('/account/password/confirm', {
        method: 'POST',
        body: { code: form.code.trim(), newPassword: form.newPassword, confirmPassword: form.confirmPassword },
      });
      startSession({ token: data.token });
      setForm({ currentPassword: '', code: '', newPassword: '', confirmPassword: '' });
      setStep('request');
      return data.message;
    });
  }

  return (
    <div className="stack">
      <Alert>{error}</Alert>
      <Alert type="success">{success}</Alert>
      {step === 'request' ? (
        <form className="stack" onSubmit={request}>
          <PasswordInput label="Current password" value={form.currentPassword} onChange={update('currentPassword')} />
          <button type="submit" className="btn btn-secondary" disabled={busy}>
            {busy ? 'Sending…' : 'Send verification code'}
          </button>
        </form>
      ) : (
        <form className="stack" onSubmit={confirm} noValidate>
          <Field
            label={`Code sent to ${user.email}`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={form.code}
            error={fieldErrors.code}
            onChange={update('code')}
          />
          <PasswordInput
            label="New password"
            autoComplete="new-password"
            hint={PASSWORD_HINT}
            value={form.newPassword}
            error={fieldErrors.newPassword}
            onChange={update('newPassword')}
          />
          <PasswordInput
            label="Re-enter new password"
            autoComplete="new-password"
            value={form.confirmPassword}
            error={fieldErrors.confirmPassword}
            onChange={update('confirmPassword')}
          />
          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Change password
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setStep('request')}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
