// utils/smsTemplates.js
// ── GymPro SMS / WhatsApp Message Templates ───────────────────────────────────
// Keep messages under 160 chars for single-part SMS.
// WhatsApp can be longer — use multiline versions.
// ─────────────────────────────────────────────────────────────────────────────

const GYM_NAME = process.env.GYM_NAME || "GymPro Fitness";

const templates = {

  // ── 1. Membership Expiry Warning ──────────────────────────────────────────
  membershipExpiringSMS: (name, daysLeft, expiryDate) =>
    `Hi ${name}! Your ${GYM_NAME} membership expires in ${daysLeft} day(s) on ${expiryDate}. Renew now to continue enjoying uninterrupted access. Call us or visit the gym. -${GYM_NAME}`,

  membershipExpiringWA: (name, daysLeft, expiryDate) =>
    `🏋️ *${GYM_NAME}*\n\nHi *${name}*! 👋\n\nYour membership is expiring in *${daysLeft} day(s)* on *${expiryDate}*.\n\n⚡ Renew now to keep your fitness journey going without interruption!\n\n📞 Contact us or visit the gym to renew.\n\n_Stay fit, stay strong!_ 💪`,

  // ── 2. Membership Expired ─────────────────────────────────────────────────
  membershipExpiredSMS: (name, expiryDate) =>
    `Hi ${name}, your ${GYM_NAME} membership expired on ${expiryDate}. Renew today to regain access. Visit us or call to renew. -${GYM_NAME}`,

  membershipExpiredWA: (name, expiryDate) =>
    `🏋️ *${GYM_NAME}*\n\nHi *${name}*,\n\nYour membership *expired on ${expiryDate}*. ❌\n\nDon't let your fitness goals slip — renew today and get back on track! 🔥\n\n📍 Visit us or call to renew your plan.\n\n_We miss you at the gym!_ 🙌`,

  // ── 3. Payment Due Reminder ───────────────────────────────────────────────
  paymentDueSMS: (name, amount, dueDate) =>
    `Hi ${name}, your ${GYM_NAME} payment of Rs.${amount} is due on ${dueDate}. Please pay to avoid membership suspension. -${GYM_NAME}`,

  paymentDueWA: (name, amount, dueDate) =>
    `🏋️ *${GYM_NAME}*\n\nHi *${name}*,\n\nThis is a friendly reminder that your payment of *₹${amount}* is due on *${dueDate}*. 💳\n\n⚠️ Please pay on time to avoid suspension of your membership.\n\n_Thank you for being a valued member!_ 🙏`,

  // ── 4. Payment Received (Receipt) ────────────────────────────────────────
  paymentReceivedSMS: (name, amount, date) =>
    `Hi ${name}, we received your payment of Rs.${amount} on ${date}. Thank you! Your membership is active. -${GYM_NAME}`,

  paymentReceivedWA: (name, amount, date, planName) =>
    `🏋️ *${GYM_NAME}*\n\n✅ *Payment Confirmed!*\n\nHi *${name}*, your payment has been received.\n\n💰 Amount: *₹${amount}*\n📅 Date: *${date}*\n🎯 Plan: *${planName || "Membership"}*\n\nYour membership is now *active*. Keep crushing those goals! 💪\n\n_See you at the gym!_ 🏋️`,

  // ── 5. Welcome (new member) ───────────────────────────────────────────────
  welcomeSMS: (name) =>
    `Welcome to ${GYM_NAME}, ${name}! Your membership is now active. We are excited to be part of your fitness journey. See you at the gym! -${GYM_NAME}`,

  welcomeWA: (name, membershipType, startDate, endDate) =>
    `🏋️ *Welcome to ${GYM_NAME}!* 🎉\n\nHi *${name}*, your membership has been activated!\n\n📋 Plan: *${membershipType}*\n📅 Start: *${startDate}*\n📅 Valid till: *${endDate}*\n\nWe are thrilled to have you with us. Let us help you achieve your fitness goals! 💪🔥\n\n_See you at the gym!_ 🙌`,
};

module.exports = templates;