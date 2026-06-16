// routes/memberRoutes.js
const express   = require("express");
const router    = express.Router();
const db        = require("../config/db");
const { verifyToken, requireRole } = require("../middleware/authMiddleware");
const { onMemberAdded } = require("../utils/smsHooks");

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

  if (!full_name || !phone)
    return res.status(400).json({ success: false, message: "Name and phone are required" });

  const clean = (d) => (d && String(d).trim() !== "") ? d : null;

  db.query(
    "INSERT INTO members (full_name,email,phone,address,gender,date_of_birth,membership_type,membership_start,membership_end,status,photo) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [full_name, email || null, phone, clean(address), clean(gender), clean(date_of_birth),
     clean(membership_type), clean(membership_start), clean(membership_end), status || "active", photo || null],
    (err, result) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY")
          return res.status(400).json({ success: false, message: "Email already exists" });
        return res.status(500).json({ success: false, message: "DB Error: " + err.message });
      }

      // Welcome WhatsApp (non-blocking)
      onMemberAdded({ full_name, phone, membership_type, membership_start, membership_end })
        .catch(e => console.error("Welcome WA error:", e.message));

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
    [full_name, email || null, phone, clean(address), clean(gender), clean(date_of_birth),
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
  const { plan_name, plan_start, plan_end, amount_paid, notes, payment_method } = req.body;

  db.query(
    `UPDATE member_plan_history SET plan_name=?, plan_start=?, plan_end=?, amount_paid=?, notes=?
     WHERE id=? AND member_id=?`,
    [plan_name, plan_start, plan_end || null, amount_paid || 0, notes || null,
     req.params.hid, req.params.id],
    (err, result) => {
      if (err) return res.status(500).json({ success: false, message: "DB Error: " + err.message });
      if (!result.affectedRows) return res.status(404).json({ success: false, message: "Not found" });

      db.query(
        "SELECT payment_id FROM member_plan_history WHERE id = ?",
        [req.params.hid],
        (err2, rows) => {
          if (err2 || !rows.length) return res.json({ success: true, message: "Plan history updated" });
          const paymentId = rows[0].payment_id;
          if (!paymentId) return res.json({ success: true, message: "Plan history updated" });

          const paidAmt = parseFloat(amount_paid) || 0;
          db.query(
            `UPDATE payments
             SET plan_name=?, plan_start=?, plan_end=?, paid_amount=?, amount=?,
                 due_amount=?, notes=?, payment_method=COALESCE(?,payment_method)
             WHERE id=?`,
            [plan_name, plan_start, plan_end || null, paidAmt, paidAmt,
             0, notes || null, payment_method || null, paymentId],
            () => {}
          );
          res.json({ success: true, message: "Plan history updated" });
        }
      );
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

module.exports = router;