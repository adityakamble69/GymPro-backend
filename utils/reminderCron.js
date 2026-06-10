// utils/reminderCron.js
// ── GymPro Daily Reminder Cron Job ────────────────────────────────────────────
// Runs every day at 9:00 AM IST
// Checks:
//   1. Members expiring in 7 days  → SMS + WhatsApp warning
//   2. Members expiring in 3 days  → SMS + WhatsApp urgent warning
//   3. Members expired today       → SMS + WhatsApp expired notice
//   4. Pending payments (due date) → SMS + WhatsApp payment reminder
// ─────────────────────────────────────────────────────────────────────────────

const cron       = require("node-cron");
const db         = require("../config/db");
const { sendSMS, sendWhatsApp } = require("./smsService");
const t          = require("./smsTemplates");
const { sendEmailNotification } = require("./sendEmail");   // your existing email util

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

// Clean phone: remove spaces, dashes, +91 prefix for Fast2SMS
const cleanPhone = (p) =>
  String(p || "").replace(/[\s\-]/g, "").replace(/^\+91/, "").trim();

// ─── Core reminder sender ─────────────────────────────────────────────────────
const sendBoth = async (phone, smsMsg, waMsg, label) => {
  const num = cleanPhone(phone);
  if (!num || num.length < 10) {
    console.warn(`⚠️  Skipping ${label} — invalid phone: "${phone}"`);
    return;
  }

  const [smsRes, waRes] = await Promise.allSettled([
    sendSMS(num, smsMsg),
    sendWhatsApp(num, waMsg),
  ]);

  const smsOk = smsRes.status === "fulfilled" && smsRes.value?.success;
  const waOk  = waRes.status  === "fulfilled" && waRes.value?.success;

  console.log(`📲 ${label} | SMS: ${smsOk ? "✅" : "❌"} | WA: ${waOk ? "✅" : "❌"}`);
};

// ─── 1. Membership Expiry Reminders ──────────────────────────────────────────
const checkMembershipExpiry = async () => {
  console.log("🔍 Checking membership expiries...");

  // Members expiring in 7 or 3 days
  const [expiringSoon] = await db.query(`
    SELECT id, full_name, phone, membership_end, membership_type
    FROM members
    WHERE status = 'active'
      AND membership_end IS NOT NULL
      AND DATEDIFF(membership_end, CURDATE()) IN (7, 3, 1)
  `);

  for (const m of expiringSoon) {
    const daysLeft  = Math.ceil((new Date(m.membership_end) - new Date()) / (1000 * 60 * 60 * 24));
    const expiryStr = fmtDate(m.membership_end);
    const label     = `Expiry warning — ${m.full_name} (${daysLeft}d)`;

    await sendBoth(
      m.phone,
      t.membershipExpiringSMS(m.full_name, daysLeft, expiryStr),
      t.membershipExpiringWA(m.full_name, daysLeft, expiryStr),
      label
    );

    // Also create a DB notification
    await db.query(
      `INSERT INTO notifications (type, title, message, is_read)
       VALUES (?, ?, ?, 0)`,
      [
        "membership_expiring",
        `Membership Expiring — ${m.full_name}`,
        `Membership expires in ${daysLeft} day(s) on ${expiryStr}.`,
      ]
    ).catch(() => {});
  }

  // Members whose membership expired TODAY
  const [expiredToday] = await db.query(`
    SELECT id, full_name, phone, membership_end
    FROM members
    WHERE DATE(membership_end) = CURDATE()
      AND status = 'active'
  `);

  for (const m of expiredToday) {
    const expiryStr = fmtDate(m.membership_end);

    // Update status → expired
    await db.query(`UPDATE members SET status = 'expired' WHERE id = ?`, [m.id]).catch(() => {});

    await sendBoth(
      m.phone,
      t.membershipExpiredSMS(m.full_name, expiryStr),
      t.membershipExpiredWA(m.full_name, expiryStr),
      `Expired today — ${m.full_name}`
    );

    await db.query(
      `INSERT INTO notifications (type, title, message, is_read)
       VALUES (?, ?, ?, 0)`,
      [
        "membership_expired",
        `Membership Expired — ${m.full_name}`,
        `Membership expired on ${expiryStr}.`,
      ]
    ).catch(() => {});
  }

  console.log(`✅ Expiry check done | Warning: ${expiringSoon.length} | Expired: ${expiredToday.length}`);
};

// ─── 2. Pending Payment Reminders ────────────────────────────────────────────
const checkPendingPayments = async () => {
  console.log("🔍 Checking pending payments...");

  // Payments pending for more than 3 days
  const [pending] = await db.query(`
    SELECT p.id, p.amount, p.payment_date, p.due_amount,
           m.full_name, m.phone
    FROM payments p
    JOIN members m ON p.member_id = m.id
    WHERE p.status = 'pending'
      AND DATEDIFF(CURDATE(), p.payment_date) >= 3
  `);

  for (const p of pending) {
    const amount  = p.due_amount > 0 ? p.due_amount : p.amount;
    const dueDate = fmtDate(p.payment_date);
    const label   = `Payment due — ${p.full_name} ₹${amount}`;

    await sendBoth(
      p.phone,
      t.paymentDueSMS(p.full_name, amount, dueDate),
      t.paymentDueWA(p.full_name, amount, dueDate),
      label
    );

    await db.query(
      `INSERT INTO notifications (type, title, message, is_read)
       VALUES (?, ?, ?, 0)`,
      [
        "payment_pending",
        `Payment Due — ${p.full_name}`,
        `Payment of ₹${amount} is pending since ${dueDate}.`,
      ]
    ).catch(() => {});
  }

  console.log(`✅ Payment check done | Pending: ${pending.length}`);
};

// ─── Start Cron Job ───────────────────────────────────────────────────────────
const startReminderCron = () => {
  // Every day at 9:00 AM IST (UTC+5:30 → 03:30 UTC)
  cron.schedule("30 3 * * *", async () => {
    console.log("\n🕘 [CRON] Daily reminder job started —", new Date().toLocaleString("en-IN"));
    try {
      await checkMembershipExpiry();
      await checkPendingPayments();
    } catch (err) {
      console.error("❌ Cron job error:", err.message);
    }
    console.log("🕘 [CRON] Daily reminder job finished.\n");
  }, {
    timezone: "Asia/Kolkata",
  });

  console.log("⏰ Reminder cron scheduled — runs daily at 9:00 AM IST");
};

// ─── Manual trigger (for testing via API) ────────────────────────────────────
const runRemindersNow = async () => {
  console.log("🔄 Manual reminder trigger...");
  await checkMembershipExpiry();
  await checkPendingPayments();
  return { success: true, message: "Reminders sent!" };
};

module.exports = { startReminderCron, runRemindersNow };