import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

const logger = new Logger('MailService');

// Gmail SMTP via a dedicated account's App Password, not a transactional-
// email vendor (Resend/Brevo/SendGrid) -- researched and deliberate, not a
// shortcut. Both of those require a paid, owned, DNS-verified domain to
// reliably deliver to a stranger's inbox for free: Resend's free sandbox
// sender is hard-blocked from sending to anyone but the account owner
// until a domain is verified, and Brevo's free tier can silently fail to
// reach Gmail/Yahoo/Outlook recipients specifically without one (2024+
// bulk-sender authentication rules), which is worse than a hard error
// since the app would believe the send succeeded. Real Gmail
// infrastructure, by contrast, is already trusted by other mail providers
// and needs no domain of its own -- free up to 500 emails/day, far more
// than this app will ever send. Trade-off: mail arrives from
// `<GMAIL_USER>@gmail.com`, not a branded address -- cosmetic, not
// functional, and the actual price of staying free.
@Injectable()
export class MailService {
  private readonly transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // STARTTLS on 587, not implicit TLS
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  async sendVerificationEmail(to: string, name: string, verifyUrl: string): Promise<void> {
    await this.transporter.sendMail({
      from: `"Current" <${process.env.GMAIL_USER}>`,
      to,
      subject: 'Verify your email for Current',
      html: `
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
      `,
    });
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
    await this.transporter.sendMail({
      from: `"Current" <${process.env.GMAIL_USER}>`,
      to,
      subject: 'Reset your Current password',
      html: `
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
      `,
    });
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
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
