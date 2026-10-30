import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { escapeHtml } from '../utils/security.js';

let smtpTransport;

function getSmtpTransport() {
  smtpTransport ??= nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  });
  return smtpTransport;
}

async function sendWithBrevo({ to, subject, text, html }) {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': config.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: config.MAIL_FROM_NAME, email: config.MAIL_FROM_EMAIL },
      to: [{ email: to }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Brevo rejected the email (HTTP ${response.status})`);
  }
}

/**
 * Send an email through the configured provider.
 * With no provider configured (local development) the email is printed to the console.
 */
export async function sendEmail(message) {
  if (config.BREVO_API_KEY) return sendWithBrevo(message);
  if (config.SMTP_HOST) {
    await getSmtpTransport().sendMail({
      from: { name: config.MAIL_FROM_NAME, address: config.MAIL_FROM_EMAIL },
      ...message,
    });
    return undefined;
  }
  if (!config.isTest) {
    console.info(`\n[email preview] To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`);
  }
  return undefined;
}

/** Fire-and-forget variant for emails that must not block or fail the request (e.g. welcome mail). */
export function sendEmailInBackground(message) {
  sendEmail(message).catch((err) => console.error(`Failed to send "${message.subject}":`, err.message));
}

function layout(title, bodyHtml) {
  return `<!doctype html><html lang="en"><body style="margin:0;background:#f6f4fb;font-family:Segoe UI,Arial,sans-serif;color:#1f1b2d">
  <div style="max-width:520px;margin:24px auto;background:#fff;border-radius:12px;padding:28px">
    <h1 style="font-size:20px;margin:0 0 16px;color:#5b3cc4">${escapeHtml(title)}</h1>
    ${bodyHtml}
    <p style="font-size:12px;color:#6b6780;margin-top:28px">PlanPal &middot; Your AI event planning assistant</p>
  </div></body></html>`;
}

export function welcomeEmail(user) {
  const name = escapeHtml(user.name);
  return {
    to: user.email,
    subject: 'Welcome to PlanPal 🎉',
    text: `Hi ${user.name},\n\nWelcome to PlanPal! Create your first event, invite people with its code and let the AI assistant help you plan budgets, timelines and vendors.\n\nStart planning: ${config.APP_URL}\n`,
    html: layout(
      'Welcome to PlanPal!',
      `<p>Hi ${name},</p>
       <p>Your account is ready. Create your first event, invite people with its join code and let our AI assistant help with budgets, timelines, vendor checklists and ideas.</p>
       <p><a href="${escapeHtml(config.APP_URL)}" style="display:inline-block;background:#5b3cc4;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Start planning</a></p>`,
    ),
  };
}

const OTP_PURPOSE_TEXT = {
  reset_password: 'reset your password',
  change_password: 'change your password',
  change_email: 'change the email address on your account',
};

export function otpEmail(to, code, purpose) {
  const action = OTP_PURPOSE_TEXT[purpose];
  return {
    to,
    subject: `Your PlanPal verification code: ${code}`,
    text: `Use this code to ${action}: ${code}\n\nIt expires in 10 minutes. If you did not request this, you can ignore this email and your account stays unchanged.`,
    html: layout(
      'Verification code',
      `<p>Use this code to ${escapeHtml(action)}:</p>
       <p style="font-size:30px;letter-spacing:8px;font-weight:700;margin:16px 0">${escapeHtml(code)}</p>
       <p>It expires in 10 minutes. If you did not request this, you can ignore this email and your account stays unchanged.</p>`,
    ),
  };
}

export function securityNoticeEmail(to, what) {
  return {
    to,
    subject: `PlanPal security notice: ${what}`,
    text: `This is a confirmation that your PlanPal account had the following change: ${what}.\n\nIf this was not you, reset your password immediately.`,
    html: layout(
      'Account change confirmed',
      `<p>Your PlanPal account had the following change: <strong>${escapeHtml(what)}</strong>.</p>
       <p>If this was not you, reset your password immediately.</p>`,
    ),
  };
}
