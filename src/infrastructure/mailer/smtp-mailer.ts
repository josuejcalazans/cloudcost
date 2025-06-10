import nodemailer from 'nodemailer';
import type {
  Notification,
  Notifier,
} from '../../application/ports/notifier.ts';

export interface TransportLike {
  sendMail(options: Record<string, unknown>): Promise<unknown>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
}

/**
 * Delivers report notifications through any nodemailer-compatible
 * transport (SMTP, SES, ...). The transport is injected so the class
 * stays unit-testable without a mail server.
 */
export class SmtpMailer implements Notifier {
  private readonly transport: TransportLike;

  constructor(transport: TransportLike) {
    this.transport = transport;
  }

  static fromConfig(config: SmtpConfig): SmtpMailer {
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth:
        config.user !== undefined && config.user !== ''
          ? { user: config.user, pass: config.pass }
          : undefined,
    });
    return new SmtpMailer(transport);
  }

  async send(notification: Notification): Promise<void> {
    await this.transport.sendMail({
      from: notification.from,
      to: notification.to,
      subject: notification.subject,
      text: notification.text,
      attachments: notification.attachments.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
      })),
    });
  }
}
