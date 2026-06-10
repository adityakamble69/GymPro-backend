// utils/smsHooks.js
// ── GymPro SMS Hooks — called from routes ────────────────────────────────────
// These are event-based triggers (not cron):
//   • onMemberAdded     → welcome SMS + WhatsApp
//   • onPaymentRecorded → receipt SMS + WhatsApp
// ─────────────────────────────────────────────────────────────────────────────

const { sendSMS, sendWhatsApp } = require("./smsService");
const t = require("./smsTemplates");

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "";

const cleanPhone = (p) =>
  String(p || "").replace(/[\s\-]/g, "").replace(/^\+91/, "").trim();

// ─── 1. Welcome message when new member is added ──────────────────────────────
const onMemberAdded = async (member) => {
  try {
    const phone = cleanPhone(member.phone);
    if (!phone || phone.length < 10) return;

    const startStr = fmtDate(member.membership_start);
    const endStr   = fmtDate(member.membership_end);

    await Promise.allSettled([
      sendSMS(phone, t.welcomeSMS(member.full_name)),
      sendWhatsApp(phone, t.welcomeWA(member.full_name, member.membership_type, startStr, endStr)),
    ]);

    console.log(`📲 Welcome SMS+WA sent to ${member.full_name} (${phone})`);
  } catch (err) {
    // Non-blocking — don't crash the API if SMS fails
    console.error("⚠️  onMemberAdded SMS error:", err.message);
  }
};

// ─── 2. Payment receipt when payment is recorded ─────────────────────────────
const onPaymentRecorded = async (payment, memberPhone, memberName) => {
  try {
    const phone = cleanPhone(memberPhone);
    if (!phone || phone.length < 10) return;

    const dateStr = fmtDate(payment.payment_date || new Date());
    const amount  = payment.amount;
    const plan    = payment.plan_name || payment.payment_for || "Membership";

    await Promise.allSettled([
      sendSMS(phone, t.paymentReceivedSMS(memberName, amount, dateStr)),
      sendWhatsApp(phone, t.paymentReceivedWA(memberName, amount, dateStr, plan)),
    ]);

    console.log(`📲 Payment receipt SMS+WA sent to ${memberName} (${phone})`);
  } catch (err) {
    console.error("⚠️  onPaymentRecorded SMS error:", err.message);
  }
};

module.exports = { onMemberAdded, onPaymentRecorded };