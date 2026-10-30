import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SignUp from './SignUp.jsx';

const signUp = vi.fn();
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: () => ({ signUp }) }));

function renderPage() {
  render(
    <MemoryRouter>
      <SignUp />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

async function fill(user, { name = 'Asha', email = 'asha@example.com', password = 'secret123', confirm = 'secret123' }) {
  if (name) await user.type(screen.getByLabelText('Name'), name);
  if (email) await user.type(screen.getByLabelText('Email'), email);
  if (password) await user.type(screen.getByLabelText('Password'), password);
  if (confirm) await user.type(screen.getByLabelText('Re-enter password'), confirm);
  await user.click(screen.getByRole('button', { name: 'Sign up' }));
}

describe('SignUp page', () => {
  beforeEach(() => {
    signUp.mockReset();
  });

  it('has name, email, password and re-enter password fields, each password with an eye toggle', () => {
    renderPage();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show re-enter password' })).toBeInTheDocument();
  });

  it('shows an error when the passwords do not match', async () => {
    const user = renderPage();
    await fill(user, { confirm: 'secret124' });
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('enforces the password rules', async () => {
    const user = renderPage();
    await fill(user, { password: 'short', confirm: 'short' });
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('submits valid details', async () => {
    const user = renderPage();
    await fill(user, {});
    expect(signUp).toHaveBeenCalledWith({
      name: 'Asha',
      email: 'asha@example.com',
      password: 'secret123',
      confirmPassword: 'secret123',
    });
  });

  it('shows server errors', async () => {
    signUp.mockRejectedValue(new Error('An account with this email already exists.'));
    const user = renderPage();
    await fill(user, {});
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
  });
});
