// utils/reminderCron.js
// ── Workout World Gym Daily Reminder Cron Job ─────────────────────────────────
// Runs every day at 9:00 AM IST
// Checks:
//   1. Members expiring in 7/3/1 days → SMS + WhatsApp + Email warning
//   2. Members expired today          → SMS + WhatsApp + Email expired notice
//   3. Pending payments (overdue)     → SMS + WhatsApp + Email payment reminder
//   4. Due tomorrow                   → SMS + WhatsApp + Email reminder
// ─────────────────────────────────────────────────────────────────────────────

const cron       = require("node-cron");
const db         = require("../config/db");
const { sendSMS, sendWhatsApp } = require("./smsService");
const t          = require("./smsTemplates");
const sendEmail  = require("./sendEmail");
const { expiryWarningEmail, paymentReceiptEmail } = require("./emailTemplates");

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtDate = (d) =>
  new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

const cleanPhone = (p) =>
  String(p || "").replace(/[\s\-]/g, "").replace(/^\+91/, "").trim();

// ─── Core: SMS + WhatsApp sender ──────────────────────────────────────────────
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

// ─── Core: Email sender (non-blocking, won't crash cron) ──────────────────────
const sendMailSafe = async (mailOptions, label) => {
  if (!mailOptions || !mailOptions.to) return;
  try {
    const r = await sendEmail(mailOptions);
    console.log(`📧 ${label} | Email: ${r.success ? "✅" : "❌ " + r.error}`);
  } catch (e) {
    console.error(`📧 ${label} | Email crash: ${e.message}`);
  }
};

// ─── 1. Membership Expiry Reminders ──────────────────────────────────────────
const checkMembershipExpiry = async () => {
  console.log("🔍 Checking membership expiries...");

  // ── 1a. Members expiring in 7, 3, or 1 day ───────────────────────────────
  const [expiringSoon] = await db.query(`
    SELECT id, full_name, phone, email, membership_end, membership_type
    FROM members
    WHERE status = 'active'
      AND membership_end IS NOT NULL
      AND DATEDIFF(membership_end, CURDATE()) IN (7, 3, 1)
  `);

  for (const m of expiringSoon) {
    const daysLeft  = Math.ceil((new Date(m.membership_end) - new Date()) / (1000 * 60 * 60 * 24));
    const expiryStr = fmtDate(m.membership_end);
    const label     = `Expiry warning — ${m.full_name} (${daysLeft}d)`;

    // SMS + WhatsApp
    await sendBoth(
      m.phone,
      t.membershipExpiringSMS(m.full_name, daysLeft, expiryStr),
      t.membershipExpiringWA(m.full_name, daysLeft, expiryStr),
      label
    );

    // Email (agar email hai toh)
    if (m.email) {
      await sendMailSafe(expiryWarningEmail(m, daysLeft), label);
    }

    // DB notification
    await db.query(
      `INSERT INTO notifications (type, title, message, is_read) VALUES (?, ?, ?, 0)`,
      [
        "membership_expiring",
        `Membership Expiring — ${m.full_name}`,
        `Membership expires in ${daysLeft} day(s) on ${expiryStr}.`,
      ]
    ).catch(() => {});
  }

  // ── 1b. Members whose membership expired TODAY ────────────────────────────
  const [expiredToday] = await db.query(`
    SELECT id, full_name, phone, email, membership_end
    FROM members
    WHERE DATE(membership_end) = CURDATE()
      AND status = 'active'
  `);

  for (const m of expiredToday) {
    const expiryStr = fmtDate(m.membership_end);

    // Status update → expired
    await db.query(`UPDATE members SET status = 'expired' WHERE id = ?`, [m.id]).catch(() => {});

    // SMS + WhatsApp
    await sendBoth(
      m.phone,
      t.membershipExpiredSMS(m.full_name, expiryStr),
      t.membershipExpiredWA(m.full_name, expiryStr),
      `Expired today — ${m.full_name}`
    );

    // Email — expired notice (0 days left)
    if (m.email) {
      await sendMailSafe(expiryWarningEmail(m, 0), `Expired today — ${m.full_name}`);
    }

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

  // ── 2a. Overdue: due_date set aur aaj se pehle guzar gaya ────────────────
  const [overdueByDate] = await db.query(`
    SELECT p.id, p.amount, p.payment_date, p.due_amount, p.due_date,
           p.payment_method, p.payment_for, p.months_covered, p.plan_name, p.notes,
           m.id AS member_id, m.full_name, m.phone, m.email
    FROM payments p
    JOIN members m ON p.member_id = m.id
    WHERE p.status = 'pending'
      AND p.due_date IS NOT NULL
      AND p.due_date < CURDATE()
  `);

  for (const p of overdueByDate) {
    const amount     = p.due_amount > 0 ? p.due_amount : p.amount;
    const dueDateFmt = fmtDate(p.due_date);
    const label      = `Overdue balance — ${p.full_name} ₹${amount}`;

    await sendBoth(
      p.phone,
      t.paymentOverdueSMS(p.full_name, amount, dueDateFmt),
      t.paymentOverdueWA(p.full_name, amount, dueDateFmt),
      label
    );

    if (p.email) {
      const memberObj  = { full_name: p.full_name, email: p.email, phone: p.phone };
      const paymentObj = {
        id: p.id, amount: p.amount, paid_amount: p.amount - amount,
        due_amount: amount, payment_date: p.payment_date,
        payment_method: p.payment_method || "cash",
        payment_for: p.payment_for || "monthly",
        months_covered: p.months_covered || 1,
        plan_name: p.plan_name, notes: p.notes
      };
      await sendMailSafe(paymentReceiptEmail(memberObj, paymentObj), label);
    }

    await db.query(
      `INSERT INTO notifications (type, title, message, ref_id, ref_type, is_read) VALUES (?, ?, ?, ?, ?, 0)`,
      [
        "payment_overdue",
        `Balance Due Overdue — ${p.full_name}`,
        `${p.full_name} ne ₹${Number(amount).toLocaleString("en-IN")} due date ${dueDateFmt} tak nahi bhara.`,
        p.member_id, "member"
      ]
    ).catch(() => {});
  }

  // ── 2b. Due tomorrow: aaj se kal due hai — ek din pehle reminder ─────────
  const [dueTomorrow] = await db.query(`
    SELECT p.id, p.amount, p.payment_date, p.due_amount, p.due_date,
           p.payment_method, p.payment_for, p.months_covered, p.plan_name, p.notes,
           m.full_name, m.phone, m.email
    FROM payments p
    JOIN members m ON p.member_id = m.id
    WHERE p.status = 'pending'
      AND p.due_date IS NOT NULL
      AND p.due_date = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
  `);

  for (const p of dueTomorrow) {
    const amount     = p.due_amount > 0 ? p.due_amount : p.amount;
    const dueDateFmt = fmtDate(p.due_date);
    const label      = `Due tomorrow — ${p.full_name} ₹${amount}`;

    await sendBoth(
      p.phone,
      t.paymentDueSMS(p.full_name, amount, dueDateFmt),
      t.paymentDueWA(p.full_name, amount, dueDateFmt),
      label
    );

    if (p.email) {
      const memberObj  = { full_name: p.full_name, email: p.email, phone: p.phone };
      const paymentObj = {
        id: p.id, amount: p.amount, paid_amount: p.amount - amount,
        due_amount: amount, payment_date: p.payment_date,
        payment_method: p.payment_method || "cash",
        payment_for: p.payment_for || "monthly",
        months_covered: p.months_covered || 1,
        plan_name: p.plan_name, notes: p.notes
      };
      await sendMailSafe(paymentReceiptEmail(memberObj, paymentObj), label);
    }
  }

  // ── 2c. Old-style fallback: no due_date, pending for 3+ days ─────────────
  const [pending] = await db.query(`
    SELECT p.id, p.amount, p.payment_date, p.due_amount,
           p.payment_method, p.payment_for, p.months_covered, p.plan_name, p.notes,
           m.id AS member_id, m.full_name, m.phone, m.email
    FROM payments p
    JOIN members m ON p.member_id = m.id
    WHERE p.status = 'pending'
      AND p.due_date IS NULL
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

    if (p.email) {
      const memberObj  = { full_name: p.full_name, email: p.email, phone: p.phone };
      const paymentObj = {
        id: p.id, amount: p.amount, paid_amount: p.amount - amount,
        due_amount: amount, payment_date: p.payment_date,
        payment_method: p.payment_method || "cash",
        payment_for: p.payment_for || "monthly",
        months_covered: p.months_covered || 1,
        plan_name: p.plan_name, notes: p.notes
      };
      await sendMailSafe(paymentReceiptEmail(memberObj, paymentObj), label);
    }

    await db.query(
      `INSERT INTO notifications (type, title, message, is_read) VALUES (?, ?, ?, 0)`,
      [
        "payment_pending",
        `Payment Due — ${p.full_name}`,
        `Payment of ₹${amount} is pending since ${dueDate}.`,
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
  }, {
    timezone: "Asia/Kolkata",
  });

  console.log("⏰ Reminder cron scheduled — runs daily at 9:00 AM IST");
};

// ─── Manual trigger (testing ke liye) ────────────────────────────────────────
const runRemindersNow = async () => {
  console.log("🔄 Manual reminder trigger...");
  await checkMembershipExpiry();
  await checkPendingPayments();
  return { success: true, message: "Reminders sent!" };
};

module.exports = { startReminderCron, runRemindersNow };