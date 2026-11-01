import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../api/client.js';
import ForgotPassword from './ForgotPassword.jsx';

vi.mock('../../api/client.js', () => ({ api: vi.fn() }));

function SignInStub() {
  const location = useLocation();
  return <p>Sign in page: {location.state?.message}</p>;
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/signin" element={<SignInStub />} />
      </Routes>
    </MemoryRouter>,
  );
  return userEvent.setup();
}

async function requestCode(user, email = 'asha@example.com') {
  vi.mocked(api).mockResolvedValueOnce({ message: 'If an account exists for that email, a verification code has been sent.' });
  await user.type(screen.getByLabelText('Email'), email);
  await user.click(screen.getByRole('button', { name: 'Send code' }));
  await screen.findByLabelText('Verification code');
}

beforeEach(() => {
  vi.mocked(api).mockReset();
});

describe('Forgot password', () => {
  it('validates the email before sending a code', async () => {
    const user = renderPage();
    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(api).not.toHaveBeenCalled();
  });

  it('requests a code and moves to the reset step', async () => {
    const user = renderPage();
    await requestCode(user);
    expect(api).toHaveBeenCalledWith('/auth/forgot-password', { method: 'POST', body: { email: 'asha@example.com' } });
    expect(screen.getByRole('status')).toHaveTextContent('verification code has been sent');
    expect(screen.getByLabelText('New password')).toHaveAttribute('type', 'password');
  });

  it('checks the code format and password rules', async () => {
    const user = renderPage();
    await requestCode(user);
    await user.type(screen.getByLabelText('Verification code'), '12');
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.type(screen.getByLabelText('Re-enter new password'), 'other');
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    expect(screen.getByText('Enter the 6-digit code from your email')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(1); // only the "send code" call
  });

  it('resets the password and returns to sign in with a message', async () => {
    const user = renderPage();
    await requestCode(user);
    vi.mocked(api).mockResolvedValueOnce({ message: 'Password updated. You can now sign in.' });

    await user.type(screen.getByLabelText('Verification code'), '482913');
    await user.type(screen.getByLabelText('New password'), 'newpass123');
    await user.type(screen.getByLabelText('Re-enter new password'), 'newpass123');
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    expect(api).toHaveBeenLastCalledWith('/auth/reset-password', {
      method: 'POST',
      body: { email: 'asha@example.com', code: '482913', newPassword: 'newpass123', confirmPassword: 'newpass123' },
    });
    expect(await screen.findByText(/Sign in page: Password updated/)).toBeInTheDocument();
  });

  it('shows the server error for a wrong code', async () => {
    const user = renderPage();
    await requestCode(user);
    vi.mocked(api).mockImplementationOnce(async () => {
      throw new Error('That code is invalid or has expired. Request a new one.');
    });

    await user.type(screen.getByLabelText('Verification code'), '000000');
    await user.type(screen.getByLabelText('New password'), 'newpass123');
    await user.type(screen.getByLabelText('Re-enter new password'), 'newpass123');
    await user.click(screen.getByRole('button', { name: 'Update password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired');
  });

  it('lets the user go back and use a different email', async () => {
    const user = renderPage();
    await requestCode(user);
    await user.click(screen.getByRole('button', { name: 'Use a different email' }));
    expect(screen.getByRole('button', { name: 'Send code' })).toBeInTheDocument();
  });
});
