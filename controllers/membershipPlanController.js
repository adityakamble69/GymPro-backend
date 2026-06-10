// controllers/membershipPlanController.js
const db = require("../config/db");

// ─── GET all plans (with optional filter) ──────────────────────────────────────
exports.getAll = (req, res) => {
  const { status, duration_type } = req.query;

  let sql    = "SELECT * FROM membership_plans WHERE 1=1";
  const vals = [];

  if (status)        { sql += " AND status = ?";        vals.push(status); }
  if (duration_type) { sql += " AND duration_type = ?"; vals.push(duration_type); }

  sql += " ORDER BY duration_type, price ASC";

  db.query(sql, vals, (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error", error: err });
    res.json({ data: rows });
  });
};

// ─── GET single plan ───────────────────────────────────────────────────────────
exports.getOne = (req, res) => {
  db.query("SELECT * FROM membership_plans WHERE id = ?", [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error", error: err });
    if (!rows.length) return res.status(404).json({ message: "Plan not found" });
    res.json({ data: rows[0] });
  });
};

// ─── GET stats ─────────────────────────────────────────────────────────────────
exports.getStats = (req, res) => {
  const sql = `
    SELECT
      (SELECT COUNT(*) FROM membership_plans WHERE status = 'active')  AS total_active,
      (SELECT COUNT(*) FROM membership_plans)                           AS total_plans,
      (SELECT COUNT(*) FROM members WHERE plan_id IS NOT NULL)          AS members_with_plan,
      (SELECT MIN(price) FROM membership_plans WHERE status = 'active') AS min_price,
      (SELECT MAX(price) FROM membership_plans WHERE status = 'active') AS max_price
  `;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error", error: err });
    res.json({ data: rows[0] });
  });
};

// ─── CREATE plan ───────────────────────────────────────────────────────────────
exports.create = (req, res) => {
  const { name, duration_type, duration_days, price, description, features, status } = req.body;

  if (!name || !duration_type || !price) {
    return res.status(400).json({ message: "name, duration_type, and price are required." });
  }

  // Auto-set duration_days from type if not provided
  const daysMap = { monthly: 30, quarterly: 90, yearly: 365 };
  const days    = duration_days || daysMap[duration_type];

  const sql  = `INSERT INTO membership_plans (name, duration_type, duration_days, price, description, features, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)`;
  const vals = [name, duration_type, days, price, description || "", features || "", status || "active"];

  db.query(sql, vals, (err, result) => {
    if (err) return res.status(500).json({ message: "DB error", error: err });
    res.status(201).json({ message: "Plan created", id: result.insertId });
  });
};

// ─── UPDATE plan ───────────────────────────────────────────────────────────────
exports.update = (req, res) => {
  const { name, duration_type, duration_days, price, description, features, status } = req.body;

  const daysMap = { monthly: 30, quarterly: 90, yearly: 365 };
  const days    = duration_days || daysMap[duration_type];

  const sql  = `UPDATE membership_plans SET name=?, duration_type=?, duration_days=?,
                price=?, description=?, features=?, status=? WHERE id=?`;
  const vals = [name, duration_type, days, price, description || "", features || "", status || "active", req.params.id];

  db.query(sql, vals, (err) => {
    if (err) return res.status(500).json({ message: "DB error", error: err });
    res.json({ message: "Plan updated" });
  });
};

// ─── DELETE plan ───────────────────────────────────────────────────────────────
exports.remove = (req, res) => {
  // Prevent deletion if members are assigned
  db.query("SELECT COUNT(*) AS cnt FROM members WHERE plan_id = ?", [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ message: "DB error", error: err });
    if (rows[0].cnt > 0) {
      return res.status(400).json({
        message: `Cannot delete — ${rows[0].cnt} member(s) are on this plan. Reassign them first.`
      });
    }
    db.query("DELETE FROM membership_plans WHERE id = ?", [req.params.id], (err2) => {
      if (err2) return res.status(500).json({ message: "DB error", error: err2 });
      res.json({ message: "Plan deleted" });
    });
  });
};

// ─── ASSIGN plan to member ─────────────────────────────────────────────────────
exports.assignToMember = (req, res) => {
  const { member_id, plan_id } = req.body;

  if (!member_id || !plan_id) {
    return res.status(400).json({ message: "member_id and plan_id are required." });
  }

  // Fetch plan to auto-calculate membership_end
  db.query("SELECT * FROM membership_plans WHERE id = ?", [plan_id], (err, plans) => {
    if (err || !plans.length) return res.status(404).json({ message: "Plan not found" });

    const plan  = plans[0];
    const start = new Date();
    const end   = new Date();
    end.setDate(end.getDate() + plan.duration_days);

    const sql = `
      UPDATE members SET
        plan_id           = ?,
        plan_assigned_at  = NOW(),
        membership_start  = ?,
        membership_end    = ?,
        membership_type   = ?,
        status            = 'active'
      WHERE id = ?
    `;
    const vals = [
      plan_id,
      start.toISOString().split("T")[0],
      end.toISOString().split("T")[0],
      plan.duration_type === "yearly"    ? "premium"  :
      plan.duration_type === "quarterly" ? "standard" : "basic",
      member_id
    ];

    db.query(sql, vals, (err2) => {
      if (err2) return res.status(500).json({ message: "DB error", error: err2 });
      res.json({
        message: "Plan assigned successfully",
        plan_name: plan.name,
        membership_start: start.toISOString().split("T")[0],
        membership_end: end.toISOString().split("T")[0],
      });
    });
  });
};