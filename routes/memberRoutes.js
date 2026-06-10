// routes/memberRoutes.js  — COMPLETE FILE with manual email endpoint added at bottom

const express   = require("express");
const router    = express.Router();
const db        = require("../config/db");
const { verifyToken, requireRole } = require("../middleware/authMiddleware");

// ── Safe email import ─────────────────────────────────────────────────────────
let sendEmail, welcomeEmail, expiryWarningEmail, paymentReceiptEmail;
try {
  sendEmail            = require("../utils/sendEmail");
  const templates      = require("../utils/emailTemplates");
  welcomeEmail         = templates.welcomeEmail;
  expiryWarningEmail   = templates.expiryWarningEmail;
  paymentReceiptEmail  = templates.paymentReceiptEmail;
} catch (e) {
  console.warn("⚠️  Email utils not found — emails disabled:", e.message);
  sendEmail           = async () => ({ success: false, error: "Email not configured" });
  welcomeEmail        = () => ({});
  expiryWarningEmail  = () => ({});
  paymentReceiptEmail = () => ({});
}

// ── GET all members (search + pagination) ─────────────────────────────────────
router.get("/", verifyToken, (req, res) => {
  const page   = parseInt(req.query.page)   || 1;
  const limit  = parseInt(req.query.limit)  || 10;
  const search = req.query.search           || "";
  const offset = (page - 1) * limit;
  const q      = `%${search}%`;

  db.query(
    "SELECT COUNT(*) AS total FROM members WHERE full_name LIKE ? OR email LIKE ? OR phone LIKE ? OR membership_type LIKE ?",
    [q, q, q, q],
    (err, countRes) => {
      if (err) return res.status(500).json({ success: false, message: "DB Error: " + err.message });
      const total = countRes[0].total;
      db.query(
        "SELECT * FROM members WHERE full_name LIKE ? OR email LIKE ? OR phone LIKE ? OR membership_type LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
        [q, q, q, q, limit, offset],
        (err, rows) => {
          if (err) return res.status(500).json({ success: false, message: "DB Error: " + err.message });
          res.json({ success: true, data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
        }
      );
    }
  );
});

// ── GET single member ─────────────────────────────────────────────────────────
router.get("/:id", verifyToken, (req, res) => {
  db.query("SELECT * FROM members WHERE id = ?", [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: "DB Error: " + err.message });
    if (!rows.length) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: rows[0] });
  });
});

// ── ADD member ────────────────────────────────────────────────────────────────
router.post("/", verifyToken, (req, res) => {
  const {
    full_name, email, phone, address, gender,
    date_of_birth, membership_type, membership_start, membership_end, status, photo
  } = req.body;

  if (!full_name || !email || !phone)
    return res.status(400).json({ success: false, message: "Name, email, and phone are required" });

  const clean = (d) => (d && String(d).trim() !== "") ? d : null;

  db.query(
    "INSERT INTO members (full_name,email,phone,address,gender,date_of_birth,membership_type,membership_start,membership_end,status,photo) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [full_name, email, phone, clean(address), clean(gender), clean(date_of_birth),
     clean(membership_type), clean(membership_start), clean(membership_end), status || "active", photo || null],
    (err, result) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY")
          return res.status(400).json({ success: false, message: "Email already exists" });
        return res.status(500).json({ success: false, message: "DB Error: " + err.message });
      }

      // Welcome email (non-blocking)
      if (email) {
        sendEmail(welcomeEmail({ full_name, email, phone, membership_type, membership_start, membership_end }))
          .catch(e => console.error("Welcome email error:", e.message));
      }

      res.status(201).json({ success: true, message: "Member added", id: result.insertId });
    }
  );
});

// ── UPDATE member ─────────────────────────────────────────────────────────────
router.put("/:id", verifyToken, (req, res) => {
  const {
    full_name, email, phone, address, gender,
    date_of_birth, membership_type, membership_start, membership_end, status, photo
  } = req.body;

  const clean = (d) => (d && String(d).trim() !== "") ? d : null;

  db.query(
    "UPDATE members SET full_name=?,email=?,phone=?,address=?,gender=?,date_of_birth=?,membership_type=?,membership_start=?,membership_end=?,status=?,photo=? WHERE id=?",
    [full_name, email, phone, clean(address), clean(gender), clean(date_of_birth),
     clean(membership_type), clean(membership_start), clean(membership_end),
     status || "active", photo || null, req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ success: false, message: "DB Error: " + err.message });
      if (!result.affectedRows) return res.status(404).json({ success: false, message: "Not found" });
      res.json({ success: true, message: "Updated" });
    }
  );
});

// ── DELETE member ─────────────────────────────────────────────────────────────
router.delete("/:id", verifyToken, requireRole("super_admin"), (req, res) => {
  db.query("DELETE FROM members WHERE id = ?", [req.params.id], (err, result) => {
    if (err) return res.status(500).json({ success: false, message: "DB Error: " + err.message });
    if (!result.affectedRows) return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, message: "Deleted" });
  });
});

// ── GET plan history ──────────────────────────────────────────────────────────
router.get("/:id/plan-history", verifyToken, (req, res) => {
  db.query(
    `SELECT mph.*, a.full_name AS changed_by_name
     FROM member_plan_history mph
     LEFT JOIN admins a ON mph.changed_by = a.id
     WHERE mph.member_id = ?
     ORDER BY mph.plan_start DESC`,
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ success: false, message: "DB Error: " + err.message });
      res.json({ success: true, data: rows });
    }
  );
});

// ── ADD plan history ──────────────────────────────────────────────────────────
router.post("/:id/plan-history", verifyToken, (req, res) => {
  const { plan_name, plan_start, plan_end, amount_paid, payment_id, notes } = req.body;
  if (!plan_name || !plan_start)
    return res.status(400).json({ success: false, message: "plan_name and plan_start required" });

  db.query(
    `INSERT INTO member_plan_history
     (member_id, plan_name, plan_start, plan_end, amount_paid, payment_id, notes, changed_by)
     VALUES (?,?,?,?,?,?,?,?)`,
    [req.params.id, plan_name, plan_start, plan_end || null,
     amount_paid || 0, payment_id || null, notes || null, req.admin?.id || null],
    (err, result) => {
      if (err) return res.status(500).json({ success: false, message: "DB Error: " + err.message });
      db.query(
        "UPDATE members SET membership_type=?, membership_start=?, membership_end=? WHERE id=?",
        [plan_name, plan_start, plan_end || null, req.params.id], () => {}
      );
      res.status(201).json({ success: true, message: "Plan history added", id: result.insertId });
    }
  );
});

// ── UPDATE plan history ───────────────────────────────────────────────────────
router.put("/:id/plan-history/:hid", verifyToken, (req, res) => {
  const { plan_name, plan_start, plan_end, amount_paid, notes } = req.body;
  db.query(
    `UPDATE member_plan_history SET plan_name=?, plan_start=?, plan_end=?, amount_paid=?, notes=?
     WHERE id=? AND member_id=?`,
    [plan_name, plan_start, plan_end || null, amount_paid || 0, notes || null,
     req.params.hid, req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ success: false, message: "DB Error: " + err.message });
      if (!result.affectedRows) return res.status(404).json({ success: false, message: "Not found" });
      res.json({ success: true, message: "Plan history updated" });
    }
  );
});

// ── DELETE plan history ───────────────────────────────────────────────────────
router.delete("/:id/plan-history/:hid", verifyToken, requireRole("super_admin"), (req, res) => {
  db.query(
    "DELETE FROM member_plan_history WHERE id=? AND member_id=?",
    [req.params.hid, req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ success: false, message: "DB Error: " + err.message });
      if (!result.affectedRows) return res.status(404).json({ success: false, message: "Not found" });
      res.json({ success: true, message: "Deleted" });
    }
  );
});

// ── ✉️  MANUAL EMAIL SEND — Admin triggers from Members page ─────────────────
// POST /api/members/:id/send-email
// body: { type: "expiry_warning" | "payment_reminder" | "welcome" | "renewal_done" }
router.post("/:id/send-email", verifyToken, async (req, res) => {
  const { type } = req.body;

  if (!type) return res.status(400).json({ success: false, message: "Email type required" });

  // Fetch member
  db.query("SELECT * FROM members WHERE id = ?", [req.params.id], async (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: "DB Error" });
    if (!rows.length) return res.status(404).json({ success: false, message: "Member not found" });

    const member = rows[0];

    if (!member.email)
      return res.status(400).json({ success: false, message: "Member has no email address" });

    try {
      let mailOptions;
      let label;

      if (type === "welcome") {
        mailOptions = welcomeEmail(member);
        label = "Welcome";

      } else if (type === "expiry_warning") {
        // Calculate days left
        const today    = new Date();
        const endDate  = member.membership_end ? new Date(member.membership_end) : null;
        const daysLeft = endDate
          ? Math.ceil((endDate - today) / (1000 * 60 * 60 * 24))
          : 0;
        mailOptions = expiryWarningEmail(member, Math.max(daysLeft, 0));
        label = "Expiry Warning";

      } else if (type === "payment_reminder") {
        // Fetch latest pending payment
        const payments = await new Promise((resolve, reject) => {
          db.query(
            "SELECT * FROM payments WHERE member_id = ? ORDER BY payment_date DESC LIMIT 1",
            [member.id],
            (e, r) => e ? reject(e) : resolve(r)
          );
        });
        const lastPayment = payments[0] || {
          id: 0, amount: 0, paid_amount: 0, due_amount: 0,
          payment_date: new Date(), payment_method: "cash",
          payment_for: member.membership_type || "membership",
          months_covered: 1, notes: null, plan_name: member.membership_type
        };
        mailOptions = paymentReceiptEmail(member, lastPayment);
        label = "Payment Reminder";

      } else if (type === "renewal_done") {
        // Renewal = welcome email with updated dates
        mailOptions = welcomeEmail(member);
        // Override subject for renewal
        mailOptions.subject = `✅ Membership Renewed — Welcome Back, ${member.full_name}! | GymPro`;
        label = "Renewal Confirmation";

      } else {
        return res.status(400).json({ success: false, message: "Unknown email type: " + type });
      }

      const result = await sendEmail(mailOptions);

      if (result.success) {
        res.json({
          success: true,
          message: `${label} email sent to ${member.email}`,
          messageId: result.messageId
        });
      } else {
        res.status(500).json({ success: false, message: "Email failed: " + result.error });
      }

    } catch (e) {
      console.error("Manual email error:", e.message);
      res.status(500).json({ success: false, message: "Server error: " + e.message });
    }
  });
});

module.exports = router;