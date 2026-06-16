// utils/reminderCron.js
// ── Workout World Gym Daily Reminder Cron Job ─────────────────────────────────
// Runs every day at 9:00 AM IST
// Checks:
//   1. Members expiring in 7/3/1 days → WhatsApp warning
//   2. Members expired today          → WhatsApp expired notice
//   3. Pending payments (overdue)     → WhatsApp payment reminder
//   4. Due tomorrow                   → WhatsApp reminder
// ─────────────────────────────────────────────────────────────────────────────

const cron              = require("node-cron");
const db                = require("../config/db");
const { sendWhatsApp }  = require("./smsService");
const t                 = require("./smsTemplates");

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

const cleanPhone = (p) =>
  String(p || "").replace(/[\s\-]/g, "").replace(/^\+91/, "").trim();

// ─── Core: WhatsApp sender ────────────────────────────────────────────────────
const sendWA = async (phone, message, label) => {
  const num = cleanPhone(phone);
  if (!num || num.length < 10) {
    console.warn(`⚠️  Skipping ${label} — invalid phone: "${phone}"`);
    return;
  }
  const res = await sendWhatsApp(num, message);
  const ok  = res?.success;
  console.log(`📲 ${label} | WA: ${ok ? "✅" : "❌ " + res?.error}`);
};

// ─── 1. Membership Expiry Reminders ──────────────────────────────────────────
const checkMembershipExpiry = async () => {
  console.log("🔍 Checking membership expiries...");

  // 1a. Expiring in 7, 3, or 1 day
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

    await sendWA(m.phone, t.membershipExpiringWA(m.full_name, daysLeft, expiryStr), label);

    await db.query(
      `INSERT INTO notifications (type, title, message, is_read) VALUES (?, ?, ?, 0)`,
      [
        "membership_expiring",
        `Membership Expiring — ${m.full_name}`,
        `Membership expires in ${daysLeft} day(s) on ${expiryStr}.`,
      ]
    ).catch(() => {});
  }

  // 1b. Expired TODAY → update status
  const [expiredToday] = await db.query(`
    SELECT id, full_name, phone, membership_end
    FROM members
    WHERE DATE(membership_end) = CURDATE()
      AND status = 'active'
  `);

  for (const m of expiredToday) {
    const expiryStr = fmtDate(m.membership_end);

    await db.query(`UPDATE members SET status = 'expired' WHERE id = ?`, [m.id]).catch(() => {});

    await sendWA(m.phone, t.membershipExpiredWA(m.full_name, expiryStr), `Expired today — ${m.full_name}`);

    await db.query(
      `INSERT INTO notifications (type, title, message, is_read) VALUES (?, ?, ?, 0)`,
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

  // 2a. Overdue — due_date crossed
  const [overdueByDate] = await db.query(`
    SELECT p.id, p.amount, p.due_amount, p.due_date,
           m.id AS member_id, m.full_name, m.phone
    FROM payments p
    JOIN members m ON p.member_id = m.id
    WHERE p.status = 'pending'
      AND p.due_date IS NOT NULL
      AND p.due_date < CURDATE()
  `);

  for (const p of overdueByDate) {
    const amount     = p.due_amount > 0 ? p.due_amount : p.amount;
    const dueDateFmt = fmtDate(p.due_date);
    const label      = `Overdue — ${p.full_name} ₹${amount}`;

    await sendWA(p.phone, t.paymentOverdueWA(p.full_name, amount, dueDateFmt), label);

    await db.query(
      `INSERT INTO notifications (type, title, message, ref_id, ref_type, is_read) VALUES (?, ?, ?, ?, ?, 0)`,
      [
        "payment_overdue",
        `Balance Due Overdue — ${p.full_name}`,
        `₹${Number(amount).toLocaleString("en-IN")} overdue since ${dueDateFmt}.`,
        p.member_id, "member"
      ]
    ).catch(() => {});
  }

  // 2b. Due tomorrow
  const [dueTomorrow] = await db.query(`
    SELECT p.id, p.amount, p.due_amount, p.due_date,
           m.full_name, m.phone
    FROM payments p
    JOIN members m ON p.member_id = m.id
    WHERE p.status = 'pending'
      AND p.due_date IS NOT NULL
      AND p.due_date = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
  `);

  for (const p of dueTomorrow) {
    const amount     = p.due_amount > 0 ? p.due_amount : p.amount;
    const dueDateFmt = fmtDate(p.due_date);
    await sendWA(p.phone, t.paymentDueWA(p.full_name, amount, dueDateFmt), `Due tomorrow — ${p.full_name}`);
  }

  // 2c. Old-style: no due_date, pending 3+ days
  const [pending] = await db.query(`
    SELECT p.id, p.amount, p.due_amount, p.payment_date,
           m.id AS member_id, m.full_name, m.phone
    FROM payments p
    JOIN members m ON p.member_id = m.id
    WHERE p.status = 'pending'
      AND p.due_date IS NULL
      AND DATEDIFF(CURDATE(), p.payment_date) >= 3
  `);

  for (const p of pending) {
    const amount  = p.due_amount > 0 ? p.due_amount : p.amount;
    const dueDate = fmtDate(p.payment_date);
    await sendWA(p.phone, t.paymentDueWA(p.full_name, amount, dueDate), `Payment due — ${p.full_name}`);

    await db.query(
      `INSERT INTO notifications (type, title, message, is_read) VALUES (?, ?, ?, 0)`,
      [
        "payment_pending",
        `Payment Due — ${p.full_name}`,
        `Payment of ₹${amount} pending since ${dueDate}.`,
      ]
    ).catch(() => {});
  }

  console.log(`✅ Payment check done | Overdue: ${overdueByDate.length} | Due tomorrow: ${dueTomorrow.length} | Old pending: ${pending.length}`);
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
  }, { timezone: "Asia/Kolkata" });

  console.log("⏰ Reminder cron scheduled — runs daily at 9:00 AM IST");
};

// ─── Manual trigger ───────────────────────────────────────────────────────────
const runRemindersNow = async () => {
  console.log("🔄 Manual reminder trigger...");
  await checkMembershipExpiry();
  await checkPendingPayments();
  return { success: true, message: "Reminders sent!" };
};

module.exports = { startReminderCron, runRemindersNow };