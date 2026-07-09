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
