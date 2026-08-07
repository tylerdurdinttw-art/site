import nodemailer, { type Transporter } from 'nodemailer';
import { APP_NAME } from '@/lib/brand';

/**
 * Отправка писем через обычный SMTP.
 *
 * Без SMTP_HOST транспорта нет: письмо не уходит, а ссылка печатается в лог
 * сервера. Так локальную разработку можно вести, не заводя почтовый ящик.
 */

let cached: Transporter | null | undefined;

function transport(): Transporter | null {
  if (cached !== undefined) return cached;

  const host = process.env.SMTP_HOST;
  if (!host) {
    cached = null;
    return cached;
  }

  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  cached = nodemailer.createTransport({
    host,
    port,
    // 465 — SMTPS с шифрованием сразу, 587 — STARTTLS уже внутри соединения.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: user ? { user, pass } : undefined,
  });

  return cached;
}

/**
 * Настроен ли SMTP вообще. Пока нет — панель не может доставить ссылку
 * подтверждения письмом, и отдаёт её прямо в ответе API.
 */
export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

/** Адрес панели снаружи — из него собираются ссылки в письмах. */
export function appUrl(): string {
  return (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

function from(): string {
  return process.env.MAIL_FROM ?? `${APP_NAME} <no-reply@localhost>`;
}

export interface SendResult {
  /** false — письмо не ушло. */
  sent: boolean;
  /** false — SMTP вообще не настроен: сервер ещё не готов рассылать почту. */
  configured: boolean;
  error?: string;
}

async function send(to: string, subject: string, text: string, html: string): Promise<SendResult> {
  const mailer = transport();

  if (!mailer) {
    console.warn(`[mail] SMTP не настроен, письмо для ${to} не отправлено:\n${text}`);
    return { sent: false, configured: false, error: 'SMTP не настроен' };
  }

  try {
    await mailer.sendMail({ from: from(), to, subject, text, html });
    return { sent: true, configured: true };
  } catch (err) {
    console.error('[mail] отправка не удалась', err);
    return {
      sent: false,
      configured: true,
      error: err instanceof Error ? err.message : 'ошибка отправки',
    };
  }
}

function layout(title: string, body: string, button: { href: string; label: string }): string {
  return `<!doctype html>
<html lang="ru"><body style="margin:0;background:#0d0d0f;padding:32px 16px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#ededf0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:460px;background:#141416;border:1px solid #232327;border-radius:12px" cellpadding="0" cellspacing="0">
      <tr><td style="padding:28px 28px 24px">
        <div style="font-size:15px;font-weight:600;letter-spacing:-0.01em">${APP_NAME}</div>
        <h1 style="margin:18px 0 0;font-size:18px;font-weight:600">${title}</h1>
        <p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#9b9ba4">${body}</p>
        <a href="${button.href}" style="display:inline-block;margin-top:22px;background:#3b82f6;color:#fff;text-decoration:none;font-size:14px;font-weight:500;padding:11px 20px;border-radius:8px">${button.label}</a>
        <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#56565e">Если кнопка не работает, откройте ссылку вручную:<br><span style="color:#7d7d87;word-break:break-all">${button.href}</span></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

/** Письмо с подтверждением почты — уходит сразу после регистрации. */
export function sendVerifyEmail(to: string, login: string, token: string): Promise<SendResult> {
  const link = `${appUrl()}/verify?token=${encodeURIComponent(token)}`;

  return send(
    to,
    `${APP_NAME}: подтвердите почту`,
    `Здравствуйте, ${login}!\n\nПодтвердите почту, чтобы войти в панель:\n${link}\n\nСсылка действует 24 часа. Если вы не регистрировались, просто удалите это письмо.`,
    layout(
      'Подтвердите почту',
      `Здравствуйте, <b style="color:#ededf0">${login}</b>! Остался один шаг — подтвердите адрес, и вход в панель откроется. Ссылка действует 24 часа.`,
      { href: link, label: 'Подтвердить почту' },
    ),
  );
}
