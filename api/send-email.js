const nodemailer = require("nodemailer");
const { checkAccess } = require("./_auth.js");

const dailySendCounts = new Map();
const MAX_RECIPIENT_LENGTH = 120;
const MAX_SUBJECT_LENGTH = 150;
const MAX_BODY_LENGTH = 3000;
const CONTACT_EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

function getDailyLimit() {
  if (process.env.MAX_EMAILS_PER_DAY === undefined || process.env.MAX_EMAILS_PER_DAY === "") return 10;

  const limit = Number(process.env.MAX_EMAILS_PER_DAY);
  return Number.isSafeInteger(limit) && limit >= 0 ? limit : null;
}

function getContacts() {
  let contacts;
  try {
    contacts = JSON.parse(process.env.CONTACTS_JSON || "");
  } catch {
    return null;
  }

  return contacts && typeof contacts === "object" && !Array.isArray(contacts) ? contacts : null;
}

function normalizeRecipient(value) {
  return value.trim().replace(/\s+/g, " ");
}

function reserveDailySend(day, limit) {
  for (const savedDay of dailySendCounts.keys()) {
    if (savedDay !== day) dailySendCounts.delete(savedDay);
  }

  const count = dailySendCounts.get(day) || 0;
  if (count >= limit) return false;
  dailySendCounts.set(day, count + 1);
  return true;
}

function releaseDailySend(day) {
  const count = dailySendCounts.get(day) || 0;
  if (count <= 1) dailySendCounts.delete(day);
  else dailySendCounts.set(day, count - 1);
}

async function sendMail({ to, subject, text }) {
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_APP_PASSWORD,
    },
  });

  const result = await transporter.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject,
    text,
  });
  if (Array.isArray(result.rejected) && result.rejected.length) {
    throw new Error("The recipient was rejected by the mail server.");
  }
}

module.exports = async (req, res) => {
  const access = checkAccess(req);
  if (!access.ok) return res.status(401).json({ error: access.error });

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }

  const input = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
  if (Object.keys(input).some((key) => /^(?:cc|bcc)$/i.test(key))) {
    return res.status(400).json({ error: "CC and BCC aren't supported." });
  }

  if (typeof input.recipient !== "string" || typeof input.subject !== "string" || typeof input.body !== "string") {
    return res.status(400).json({ error: "Recipient, subject, and body must be text." });
  }

  const recipient = normalizeRecipient(input.recipient);
  const subject = input.subject.replace(/[\r\n]+/g, " ").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  const body = input.body;
  if (
    !recipient ||
    recipient.length > MAX_RECIPIENT_LENGTH ||
    recipient.includes("@") ||
    !subject ||
    subject.length > MAX_SUBJECT_LENGTH ||
    !body.trim() ||
    body.length > MAX_BODY_LENGTH
  ) {
    return res.status(400).json({ error: "Check the recipient, subject, and body lengths, then try again." });
  }

  const contacts = getContacts();
  if (!contacts) {
    return res.status(500).json({ error: "Email contacts are not configured correctly." });
  }

  const contactName = recipient.toLowerCase();
  const matchedName = Object.keys(contacts).find((name) => name.trim().replace(/\s+/g, " ").toLowerCase() === contactName);
  if (!matchedName) {
    return res.status(400).json({ error: "That person isn't in your contacts." });
  }
  const to = contacts[matchedName];
  if (typeof to !== "string" || !CONTACT_EMAIL_PATTERN.test(to)) {
    return res.status(500).json({ error: "That contact is missing a valid email address." });
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_APP_PASSWORD) {
    return res.status(500).json({ error: "SMTP_USER and SMTP_APP_PASSWORD must be configured." });
  }

  const dailyLimit = getDailyLimit();
  if (dailyLimit === null) {
    return res.status(500).json({ error: "MAX_EMAILS_PER_DAY must be a non-negative whole number." });
  }
  const day = new Date().toISOString().slice(0, 10);
  // Serverless instances do not share memory; use a durable counter for a hard cap.
  if (!reserveDailySend(day, dailyLimit)) {
    return res.status(429).json({ error: "The daily email limit has been reached. Try again tomorrow." });
  }

  try {
    await sendMail({ to, subject, text: body });
    return res.status(200).json({ ok: true });
  } catch {
    releaseDailySend(day);
    return res.status(502).json({ error: "Email could not be sent. Check the SMTP settings and try again." });
  }
};
