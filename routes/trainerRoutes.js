const express = require("express");
const router  = express.Router();
const db      = require("../config/db");
const { verifyToken, requireRole } = require("../middleware/authMiddleware");

// ── GET ALL TRAINERS (search + pagination) ────────────────────────────────────
router.get("/", verifyToken, (req, res) => {
    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const offset = (page - 1) * limit;
    const q      = `%${search}%`;

    const countSql = `SELECT COUNT(*) AS total FROM trainers
                      WHERE full_name LIKE ? OR email LIKE ? OR phone LIKE ? OR specialization LIKE ?`;
    const dataSql  = `SELECT * FROM trainers
                      WHERE full_name LIKE ? OR email LIKE ? OR phone LIKE ? OR specialization LIKE ?
                      ORDER BY created_at DESC LIMIT ? OFFSET ?`;

    db.query(countSql, [q,q,q,q], (err, countRes) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        const total = countRes[0].total;
        db.query(dataSql, [q,q,q,q, limit, offset], (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "DB Error" });
            res.json({ success: true, data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
        });
    });
});

// ── GET SINGLE TRAINER ────────────────────────────────────────────────────────
router.get("/:id", verifyToken, (req, res) => {
    db.query("SELECT * FROM trainers WHERE id = ?", [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        if (!rows.length) return res.status(404).json({ success: false, message: "Trainer not found" });
        res.json({ success: true, data: rows[0] });
    });
});

// ── ADD TRAINER ───────────────────────────────────────────────────────────────
router.post("/", verifyToken, (req, res) => {
    const { full_name, email, phone, address, gender, date_of_birth,
            specialization, experience_years, salary, joining_date, status } = req.body;

    if (!full_name || !email || !phone)
        return res.status(400).json({ success: false, message: "Name, email and phone are required" });

    const sql = `INSERT INTO trainers
        (full_name, email, phone, address, gender, date_of_birth,
         specialization, experience_years, salary, joining_date, status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`;

    db.query(sql, [
        full_name, email, phone, address || null, gender || null,
        date_of_birth || null, specialization || null,
        experience_years || 0, salary || 0,
        joining_date || null, status || "active"
    ], (err, result) => {
        if (err) {
            if (err.code === "ER_DUP_ENTRY")
                return res.status(400).json({ success: false, message: "Email already exists" });
            return res.status(500).json({ success: false, message: "DB Error", error: err });
        }
        res.status(201).json({ success: true, message: "Trainer added", id: result.insertId });
    });
});

// ── UPDATE TRAINER ────────────────────────────────────────────────────────────
router.put("/:id", verifyToken, (req, res) => {
    const { full_name, email, phone, address, gender, date_of_birth,
            specialization, experience_years, salary, joining_date, status } = req.body;

    const sql = `UPDATE trainers SET
        full_name=?, email=?, phone=?, address=?, gender=?, date_of_birth=?,
        specialization=?, experience_years=?, salary=?, joining_date=?, status=?
        WHERE id=?`;

    db.query(sql, [
        full_name, email, phone, address, gender, date_of_birth,
        specialization, experience_years, salary, joining_date, status,
        req.params.id
    ], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "Trainer not found" });
        res.json({ success: true, message: "Trainer updated" });
    });
});

// ── DELETE TRAINER (super_admin only) ─────────────────────────────────────────
router.delete("/:id", verifyToken, requireRole("super_admin"), (req, res) => {
    db.query("DELETE FROM trainers WHERE id = ?", [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "Trainer not found" });
        res.json({ success: true, message: "Trainer deleted" });
    });
});

// ── GET STATS (for dashboard) ─────────────────────────────────────────────────
router.get("/stats/summary", verifyToken, (req, res) => {
    db.query(`SELECT
        COUNT(*) AS total,
        SUM(status = 'active') AS active,
        SUM(status = 'inactive') AS inactive
        FROM trainers`, (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        res.json({ success: true, data: rows[0] });
    });
});

module.exports = router;