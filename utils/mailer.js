const nodemailer = require("nodemailer");

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function getSmtpPort() {
  const parsedPort = Number(process.env.SMTP_PORT);
  return Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 587;
}

function isMailerConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM_EMAIL);
}

function getMailerTransportOptions() {
  const port = getSmtpPort();
  const secure = normalizeBoolean(process.env.SMTP_SECURE, port === 465);
  const options = {
    host: process.env.SMTP_HOST,
    port,
    secure
  };

  if (process.env.SMTP_USER) {
    options.auth = {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS || ""
    };
  }

  return options;
}

function getFromAddress() {
  const fromEmail = String(process.env.SMTP_FROM_EMAIL || "").trim();
  const fromName = String(process.env.SMTP_FROM_NAME || "Loan Tracker").trim();

  return fromName ? `"${fromName.replace(/"/g, "")}" <${fromEmail}>` : fromEmail;
}

async function sendPasswordResetEmail({ to, firstName, resetUrl, expiresInMinutes }) {
  if (!isMailerConfigured()) {
    const error = new Error("SMTP is not configured for password reset emails.");
    error.code = "MAIL_NOT_CONFIGURED";
    throw error;
  }

  const transporter = nodemailer.createTransport(getMailerTransportOptions());
  const name = firstName || "there";
  const subject = "Reset your Loan Tracker password";
  const text = [
    `Hi ${name},`,
    "",
    "We received a request to reset your Loan Tracker password.",
    `Use this link within ${expiresInMinutes} minutes:`,
    resetUrl,
    "",
    "If you did not request a password reset, you can ignore this email."
  ].join("\n");
  const html = `
    <p>Hi ${name},</p>
    <p>We received a request to reset your Loan Tracker password.</p>
    <p>Use this link within <strong>${expiresInMinutes} minutes</strong>:</p>
    <p><a href="${resetUrl}">${resetUrl}</a></p>
    <p>If you did not request a password reset, you can ignore this email.</p>
  `;

  await transporter.sendMail({
    from: getFromAddress(),
    to,
    subject,
    text,
    html
  });
}

module.exports = {
  isMailerConfigured,
  sendPasswordResetEmail
};
