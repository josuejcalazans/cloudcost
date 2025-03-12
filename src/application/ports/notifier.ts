export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface Notification {
  from: string;
  to: string[];
  subject: string;
  text: string;
  attachments: MailAttachment[];
}

export interface Notifier {
  send(notification: Notification): Promise<void>;
}
