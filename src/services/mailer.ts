import nodemailer from 'nodemailer';
import { env } from '../core/env';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASSWORD,
  },
});

export interface NotificationInput {
  site: string;
  name: string;
  email: string;
  message: string;
  ip: string;
}

export async function sendNotification(input: NotificationInput): Promise<void> {
  await transporter.sendMail({
    from: env.MAIL_FROM,
    to: env.MAIL_TO,
    replyTo: input.email,
    subject: `[${input.site}] New contact form message`,
    text: [
      `Site: ${input.site}`,
      `Name: ${input.name}`,
      `Email: ${input.email}`,
      `IP: ${input.ip}`,
      '',
      input.message,
    ].join('\n'),
  });
}

/** One-time admin login code. Sent to MAIL_TO — the only recipient that matters. */
export async function sendLoginCode(code: string, ip: string): Promise<void> {
  await transporter.sendMail({
    from: env.MAIL_FROM,
    to: env.MAIL_TO,
    subject: '[contact] Admin giriş kodu',
    text: [
      `Giriş kodu: ${code}`,
      '10 dakika geçerli, tek kullanımlık.',
      `İsteği yapan IP: ${ip}`,
      '',
      'Bu isteği sen yapmadıysan bu maili yok say.',
    ].join('\n'),
  });
}

export interface SecurityAlertInput {
  count: number;
  windowMin: number;
  lastIp: string;
}

/** Fired when failed admin logins pile up in a short window. */
export async function sendSecurityAlert(input: SecurityAlertInput): Promise<void> {
  await transporter.sendMail({
    from: env.MAIL_FROM,
    to: env.MAIL_TO,
    subject: '[contact] Tekrarlayan başarısız admin girişleri',
    text: [
      `Son ${input.windowMin} dakikada ${input.count} başarısız admin giriş denemesi.`,
      `En son deneyen IP: ${input.lastIp}`,
      '',
      'Brute-force ihtimaline karşı göz at.',
    ].join('\n'),
  });
}
