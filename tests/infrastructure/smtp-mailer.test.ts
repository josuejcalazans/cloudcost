import { describe, expect, it } from 'vitest';
import { SmtpMailer } from '../../src/infrastructure/mailer/smtp-mailer.ts';

interface SentMail {
  from: string;
  to: string | string[];
  subject: string;
  text: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}

function fakeTransport(): {
  transport: {
    sendMail: (options: SentMail) => Promise<{ messageId: string }>;
  };
  sent: SentMail[];
} {
  const sent: SentMail[] = [];
  return {
    sent,
    transport: {
      sendMail: (options: SentMail) => {
        sent.push(options);
        return Promise.resolve({ messageId: 'id-1' });
      },
    },
  };
}

const notification = {
  from: 'cloudcost@example.com',
  to: ['team@example.com', 'boss@example.com'],
  subject: 'cloudcost report · oci · 2026-10-01..2026-10-05 · USD 4.00',
  text: 'Total: USD 4.00',
  attachments: [
    {
      filename: 'cloudcost-oci-2026-10-01_2026-10-05.csv',
      content: Buffer.from('date,amount'),
      contentType: 'text/csv',
    },
  ],
};

describe('SmtpMailer', () => {
  it('delivers the notification through the transport', async () => {
    const { transport, sent } = fakeTransport();
    const mailer = new SmtpMailer(transport);

    await mailer.send(notification);

    expect(sent).toHaveLength(1);
    expect(sent[0]?.from).toBe('cloudcost@example.com');
    expect(sent[0]?.subject).toBe(notification.subject);
    expect(sent[0]?.text).toBe(notification.text);
  });

  it('passes recipients and attachments through unchanged', async () => {
    const { transport, sent } = fakeTransport();
    const mailer = new SmtpMailer(transport);

    await mailer.send(notification);

    expect(sent[0]?.to).toEqual(['team@example.com', 'boss@example.com']);
    expect(sent[0]?.attachments).toHaveLength(1);
    expect(sent[0]?.attachments?.[0]?.filename).toBe(
      'cloudcost-oci-2026-10-01_2026-10-05.csv',
    );
    expect(sent[0]?.attachments?.[0]?.content.toString()).toBe('date,amount');
    expect(sent[0]?.attachments?.[0]?.contentType).toBe('text/csv');
  });

  it('supports notifications without attachments', async () => {
    const { transport, sent } = fakeTransport();
    const mailer = new SmtpMailer(transport);

    await mailer.send({ ...notification, attachments: [] });

    expect(sent[0]?.attachments).toEqual([]);
  });
});
