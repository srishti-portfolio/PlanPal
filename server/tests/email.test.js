import { afterEach, describe, expect, it, vi } from 'vitest';
import { otpEmail, securityNoticeEmail, sendEmail, welcomeEmail } from '../src/services/email.js';

// Ignore any real email provider configured in a developer's server/.env,
// so these tests never send real emails or depend on local keys.
vi.mock('../src/config.js', async (importOriginal) => {
  const { config } = await importOriginal();
  return { config: { ...config, BREVO_API_KEY: undefined, SMTP_HOST: undefined } };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('email templates', () => {
  it('welcome email greets the user and escapes their name in HTML', () => {
    const message = welcomeEmail({ name: '<script>alert(1)</script>', email: 'asha@example.com' });
    expect(message.to).toBe('asha@example.com');
    expect(message.subject).toMatch(/Welcome/);
    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;');
  });

  it.each([
    ['reset_password', 'reset your password'],
    ['change_password', 'change your password'],
    ['change_email', 'change the email address'],
  ])('code email for %s explains the action and contains the code', (purpose, action) => {
    const message = otpEmail('asha@example.com', '482913', purpose);
    expect(message.subject).toContain('482913');
    expect(message.text).toContain('482913');
    expect(message.text).toContain(action);
    expect(message.text).toMatch(/10 minutes/);
    expect(message.html).toContain('482913');
  });

  it('security notice names the change', () => {
    const message = securityNoticeEmail('asha@example.com', 'password changed');
    expect(message.subject).toContain('password changed');
    expect(message.text).toMatch(/If this was not you/);
  });
});

describe('sendEmail without a provider', () => {
  it('does not call any external service', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(sendEmail(welcomeEmail({ name: 'Asha', email: 'asha@example.com' }))).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
