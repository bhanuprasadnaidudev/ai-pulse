import { Injectable, Logger } from '@nestjs/common';

const logger = new Logger('MailService');

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

// Brevo's HTTP API, over plain HTTPS on 443.
//
// This used to be Gmail SMTP with a dedicated account's App Password, and
// that was the right call at the time: real Gmail infrastructure is
// already trusted by other providers and needs no domain of its own,
// where Resend and SendGrid both want a paid, DNS-verified domain before
// they'll deliver to a stranger's inbox. What killed it was the host, not
// the design -- Render blocked outbound traffic to ports 25, 465 and 587
// on free web services in September 2025, so the connection now times out
// at their edge and no SMTP client of any kind can get out. Sending over
// 443 sidesteps the whole category: a blocked SMTP port can't affect a
// request that isn't using one.
//
// Free tier is 300 emails/day, far more than this app sends, and Brevo
// verifies a single sender address, so GMAIL_USER still works as the from
// address without owning a domain. The cost is that mail is relayed by
// Brevo rather than sent by Gmail: DKIM signs as Brevo, not gmail.com, so
// it can land in spam more readily than it used to. That is the price of
// the free tier here, and it's a filing problem rather than a delivery
// failure.
@Injectable()
export class MailService {
  async sendVerificationEmail(to: string, name: string, verifyUrl: string): Promise<void> {
    await this.send(to, name, 'Verify your email for Current', `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="margin: 0 0 16px;">Hi ${escapeHtml(name)},</h2>
          <p style="color: #444; line-height: 1.6;">
            Confirm this is your email address to finish setting up your Current account.
          </p>
          <p style="margin: 24px 0;">
            <a href="${verifyUrl}" style="background: #0b0b0b; color: #d6ff3f; padding: 12px 20px; text-decoration: none; font-weight: bold; display: inline-block;">
              Verify email
            </a>
          </p>
          <p style="color: #999; font-size: 12px; line-height: 1.6;">
            This link expires in 24 hours. If you didn't sign up for Current, you can ignore this email.
          </p>
        </div>
      `);
  }

  /** resendVerification (and signup) intentionally never let a mail-send
   * failure change the response shape returned to the caller -- an
   * account-enumeration protection. This is where that failure actually
   * gets logged instead, so it isn't silently lost. */
  async sendVerificationEmailSafely(to: string, name: string, verifyUrl: string): Promise<void> {
    try {
      await this.sendVerificationEmail(to, name, verifyUrl);
    } catch (err) {
      logger.warn(`Failed to send verification email to ${to}: ${(err as Error).message}`);
    }
  }

  async sendPasswordResetEmail(to: string, name: string, resetUrl: string): Promise<void> {
    await this.send(to, name, 'Reset your Current password', `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="margin: 0 0 16px;">Hi ${escapeHtml(name)},</h2>
          <p style="color: #444; line-height: 1.6;">
            Someone asked to reset the password for your Current account. Choose a new one here:
          </p>
          <p style="margin: 24px 0;">
            <a href="${resetUrl}" style="background: #0b0b0b; color: #d6ff3f; padding: 12px 20px; text-decoration: none; font-weight: bold; display: inline-block;">
              Reset password
            </a>
          </p>
          <p style="color: #999; font-size: 12px; line-height: 1.6;">
            This link expires in 1 hour and can only be used once. If you didn't ask for this,
            you can ignore this email -- your password won't change.
          </p>
        </div>
      `);
  }

  /** Same reasoning as sendVerificationEmailSafely: requestPasswordReset
   * must answer identically whether or not the account exists, so a send
   * failure can only be surfaced here, in the logs. */
  async sendPasswordResetEmailSafely(to: string, name: string, resetUrl: string): Promise<void> {
    try {
      await this.sendPasswordResetEmail(to, name, resetUrl);
    } catch (err) {
      logger.warn(`Failed to send password reset email to ${to}: ${(err as Error).message}`);
    }
  }

  /** Brevo answers a rejected send with 4xx and a JSON body naming the
   * reason -- an unverified sender, an exhausted daily quota, a bad key.
   * That body is the single most useful thing when mail stops arriving,
   * and the callers above only ever log `err.message`, so it gets folded
   * into the thrown error rather than dropped. */
  private async send(to: string, name: string, subject: string, htmlContent: string): Promise<void> {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) throw new Error('BREVO_API_KEY is not set');

    // Falls back to GMAIL_USER, which is already set to the address being
    // verified with Brevo -- one fewer variable to keep in sync, and
    // MAIL_FROM is there for when the app outgrows a gmail.com sender.
    const from = process.env.MAIL_FROM ?? process.env.GMAIL_USER;
    if (!from) throw new Error('neither MAIL_FROM nor GMAIL_USER is set');

    const res = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: from, name: 'Current' },
        to: [{ email: to, name }],
        subject,
        htmlContent,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '<unreadable>');
      throw new Error(`Brevo returned ${res.status}: ${body}`);
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
