// Correos (RF-50). Con SMTP_URL se envían de verdad; sin él se imprimen en la consola.
// Cada envío queda en email_log para no repetir recordatorios (D9).
import nodemailer from 'nodemailer';
import { and, eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db } from '../db/index.js';
import { emailLog } from '../db/schema.js';

const transport = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null;

/** Últimos correos enviados en memoria (para pruebas y para ver enlaces en desarrollo). */
export const outbox = [];

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * HTML sencillo con el estilo de ReserYa (sin degradados).
 * paragraphs: textos (se escapan). cta: { label, url } opcional.
 */
export function emailLayout({ title, paragraphs = [], cta, footer }) {
  const ps = paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:22px;color:#0E1A26">${esc(p)}</p>`)
    .join('');
  const button = cta
    ? `<p style="margin:22px 0"><a href="${esc(cta.url)}" style="background:#0A7DB2;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:12px;display:inline-block">${esc(cta.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#F4F7FA;font-family:'Plus Jakarta Sans',Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:24px">
<p style="font-size:20px;font-weight:800;color:#0E1A26;margin:0 0 16px">ReserYa</p>
<div style="background:#fff;border:1px solid #E3E9EF;border-radius:16px;padding:24px">
<h1 style="font-size:20px;margin:0 0 14px;color:#0E1A26">${esc(title)}</h1>${ps}${button}</div>
<p style="font-size:12px;color:#5D6B79;margin:16px 0 0">${esc(footer ?? 'Este correo se envió automáticamente desde ReserYa.')}</p>
</div></body></html>`;
}

/** true si ese correo (plantilla + reserva) ya se envió antes. */
export async function alreadySent(template, bookingId) {
  const [row] = await db
    .select({ id: emailLog.id })
    .from(emailLog)
    .where(and(eq(emailLog.template, template), eq(emailLog.bookingId, bookingId)))
    .limit(1);
  return Boolean(row);
}

/**
 * Envía un correo. No lanza error si el envío falla: lo registra y sigue (un correo
 * no debe tumbar una reserva). Devuelve true si se envió.
 */
export async function sendEmail({ to, toUserId, template, subject, html, text, bookingId }) {
  let status = 'sent';
  try {
    if (transport) {
      await transport.sendMail({ from: env.MAIL_FROM, to, subject, html, text });
    } else if (!env.isTest) {
      console.log(`\n✉️  [${template}] para ${to}: ${subject}\n${text ?? stripHtml(html)}\n`);
    }
  } catch (e) {
    status = 'failed';
    console.error('No se pudo enviar el correo', template, e.message);
  }
  outbox.push({ to, template, subject, html, text, bookingId, at: new Date() });
  if (outbox.length > 200) outbox.shift();
  await db.insert(emailLog).values({
    toUserId: toUserId ?? null,
    toEmail: to,
    template,
    bookingId: bookingId ?? null,
    status,
    sentAt: status === 'sent' ? new Date() : null,
  });
  return status === 'sent';
}

function stripHtml(html = '') {
  return html
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g, '$2: $1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
