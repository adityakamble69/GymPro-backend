// utils/smsHooks.js
// ── Workout World Gym WhatsApp Hooks — called from routes ──────────────────────
//   • onMemberAdded     → welcome WhatsApp
//   • onPaymentRecorded → receipt WhatsApp
// ─────────────────────────────────────────────────────────────────────────────

const { sendWhatsApp } = require("./smsService");
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

    await sendWhatsApp(phone, t.welcomeWA(member.full_name, member.membership_type, startStr, endStr));

    console.log(`📲 Welcome WhatsApp sent to ${member.full_name} (${phone})`);
  } catch (err) {
    console.error("⚠️  onMemberAdded WhatsApp error:", err.message);
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

    await sendWhatsApp(phone, t.paymentReceivedWA(memberName, amount, dateStr, plan));

    console.log(`📲 Payment receipt WhatsApp sent to ${memberName} (${phone})`);
  } catch (err) {
    console.error("⚠️  onPaymentRecorded WhatsApp error:", err.message);
  }
};

module.exports = { onMemberAdded, onPaymentRecorded };