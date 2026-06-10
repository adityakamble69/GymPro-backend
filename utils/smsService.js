// utils/smsService.js
// ── GymPro SMS + WhatsApp — Twilio only ───────────────────────────────────────

const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Normalise Indian number → +91XXXXXXXXXX
const normalise = (phone) =>
  phone.startsWith("+") ? phone : `+91${String(phone).replace(/[\s\-]/g, "").replace(/^\+91/, "")}`;

// ── 1. Send SMS (Twilio) ───────────────────────────────────────────────────────
const sendSMS = async (phone, message) => {
  try {
    const msg = await client.messages.create({
      from: process.env.TWILIO_SMS_FROM, // your Twilio phone number e.g. +12015551234
      to:   normalise(phone),
      body: message,
    });
    console.log(`✅ SMS sent to ${phone} | SID: ${msg.sid}`);
    return { success: true, sid: msg.sid };
  } catch (err) {
    console.error("❌ SMS error:", err.message);
    return { success: false, error: err.message };
  }
};

// ── 2. Send WhatsApp (Twilio Sandbox) ─────────────────────────────────────────
const sendWhatsApp = async (phone, message) => {
  try {
    const msg = await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`,
      to:   `whatsapp:${normalise(phone)}`,
      body: message,
    });
    console.log(`✅ WhatsApp sent to ${phone} | SID: ${msg.sid}`);
    return { success: true, sid: msg.sid };
  } catch (err) {
    console.error("❌ WhatsApp error:", err.message);
    return { success: false, error: err.message };
  }
};

// ── 3. Send both ───────────────────────────────────────────────────────────────
const sendReminder = async (phone, message) => {
  const [sms, wa] = await Promise.allSettled([
    sendSMS(phone, message),
    sendWhatsApp(phone, message),
  ]);
  return { sms, whatsapp: wa };
};

module.exports = { sendSMS, sendWhatsApp, sendReminder };