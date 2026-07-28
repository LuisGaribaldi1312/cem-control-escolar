const nodemailer = require('nodemailer');

let transporter = null;
const isConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

if (isConfigured) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendMail({ to, subject, html }) {
  if (!isConfigured) {
    // Sin proveedor de correo configurado: se deja constancia en el registro del servidor
    // para no bloquear el flujo en desarrollo. Configura SMTP_* en el .env para envíos reales.
    console.log(`[CEM][correo no enviado - falta configurar SMTP] Para: ${to} | Asunto: ${subject}`);
    return { simulated: true };
  }
  return transporter.sendMail({
    from: process.env.SMTP_FROM || '"Centro Educativo CEM" <no-responder@example.com>',
    to,
    subject,
    html,
  });
}

module.exports = { sendMail, isConfigured };
