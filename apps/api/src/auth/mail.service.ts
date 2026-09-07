import { Injectable, Logger } from '@nestjs/common';
import { promises as dns } from 'node:dns';
import nodemailer from 'nodemailer';

const logger = new Logger('MailService');

const SMTP_HOST = 'smtp.gmail.com';

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
  private transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

  /** Nodemailer resolves the hostname itself -- dns.resolve4 and
   * dns.resolve6, concatenated -- and then picks one of the results AT
   * RANDOM (see formatDNSValue in nodemailer/shared). That is why setting
   * Node's ipv4first lookup order wasn't enough: this path never calls
   * dns.lookup, so the order setting has nothing to steer. Render
   * instances have no IPv6 route out, so a send that drew Gmail's AAAA
   * address died with `connect ENETUNREACH 2607:f8b0:...:587` -- and
   * because the pick is random, it failed unpredictably rather than
   * consistently, which is the worst way for this to break.
   *
   * Resolving an IPv4 address here and handing that over instead
   * takes the coin flip out of it. tls.servername keeps the certificate
   * validated against smtp.gmail.com rather than the bare IP, which is
   * what makes passing an address safe. Built once and reused: Google's
   * SMTP addresses rotate slowly, and a free Render instance restarts far
   * more often than they do. */
  private async getTransporter(): Promise<ReturnType<typeof nodemailer.createTransport>> {
    if (this.transporter) return this.transporter;

    // dns.lookup, not dns.resolve4: lookup goes through getaddrinfo and so
    // honours the OS resolver, hosts file and search domains, and works in
    // sandboxes where direct queries to port 53 are refused. If it fails
    // anyway, fall back to the hostname -- that puts us back to the random
    // pick, which at least sometimes works, rather than sending nothing.
    let host = SMTP_HOST;
    try {
      host = (await dns.lookup(SMTP_HOST, { family: 4 })).address;
    } catch (err) {
      logger.warn(`Could not resolve an IPv4 address for ${SMTP_HOST}, falling back to the hostname: ${(err as Error).message}`);
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: 587,
      secure: false, // STARTTLS on 587, not implicit TLS
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
      tls: { servername: SMTP_HOST },
    });
    return this.transporter;
  }

  async sendVerificationEmail(to: string, name: string, verifyUrl: string): Promise<void> {
    const transporter = await this.getTransporter();
    await transporter.sendMail({
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
    const transporter = await this.getTransporter();
    await transporter.sendMail({
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
