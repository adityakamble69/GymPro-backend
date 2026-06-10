const express   = require("express");
const router    = express.Router();
const db        = require("../config/db");
const { verifyToken } = require("../middleware/authMiddleware");
const sendEmail = require("../utils/sendEmail");
const { inquiryAlertEmail } = require("../utils/emailTemplates");

// ── PUBLIC: Submit inquiry — admin alert email trigger ────────────────────────
router.post("/submit", (req, res) => {
    const { full_name, email, phone, gender, date_of_birth, address, message, membership_interest, preferred_time, photo } = req.body;

    if (!full_name || !email || !phone)
        return res.status(400).json({ success: false, message: "Name, email and phone are required" });

    const sql = `INSERT INTO inquiries
        (full_name, email, phone, gender, date_of_birth, address, message, membership_interest, preferred_time, photo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.query(sql, [
        full_name, email, phone,
        gender              || null,
        date_of_birth       || null,
        address             || null,
        message             || null,
        membership_interest || "not_sure",
        preferred_time      || "anytime",
        photo               || null,
    ], (err, result) => {
        if (err) {
            console.error("❌ Inquiry submit DB error:", err.code, err.message);
            return res.status(500).json({ success: false, message: err.message });
        }

        // ✅ Send admin alert email (non-blocking)
        sendEmail(inquiryAlertEmail({ full_name, email, phone, message, membership_interest, preferred_time }))
          .then(r => console.log(`Inquiry alert email [${full_name}]:`, r.success ? "✅ sent" : "❌ " + r.error))
          .catch(e => console.error("❌ sendEmail crash:", e.message));

        res.status(201).json({ success: true, message: "Thank you! We will contact you soon." });
    });
});

// ── ADMIN: GET all inquiries (paginated + filter) ─────────────────────────────
router.get("/", verifyToken, (req, res) => {
    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 10;
    const search = req.query.search          || "";
    const status = req.query.status          || "";
    const offset = (page - 1) * limit;
    const q      = `%${search}%`;

    let where    = `WHERE (full_name LIKE ? OR email LIKE ? OR phone LIKE ?)`;
    const params = [q, q, q];

    if (status) { where += ` AND status = ?`; params.push(status); }

    db.query(`SELECT COUNT(*) AS total FROM inquiries ${where}`, params, (err, countRes) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        const total = countRes[0].total;
        db.query(
            `SELECT * FROM inquiries ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset],
            (err, rows) => {
                if (err) return res.status(500).json({ success: false, message: "DB Error" });
                res.json({ success: true, data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
            }
        );
    });
});

// ── ADMIN: GET stats ──────────────────────────────────────────────────────────
router.get("/stats/summary", verifyToken, (req, res) => {
    db.query(`
        SELECT
            COUNT(*) AS total,
            SUM(status = 'new')       AS new_count,
            SUM(status = 'contacted') AS contacted_count,
            SUM(status = 'converted') AS converted_count,
            SUM(status = 'rejected')  AS rejected_count,
            SUM(DATE(created_at) = CURDATE()) AS today_count
        FROM inquiries
    `, (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        res.json({ success: true, data: rows[0] });
    });
});

// ── ADMIN: UPDATE inquiry status + notes ──────────────────────────────────────
router.put("/:id", verifyToken, (req, res) => {
    const { status, notes } = req.body;
    db.query(
        "UPDATE inquiries SET status = ?, notes = ? WHERE id = ?",
        [status, notes || null, req.params.id],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: "DB Error" });
            if (!result.affectedRows) return res.status(404).json({ success: false, message: "Not found" });
            res.json({ success: true, message: "Updated" });
        }
    );
});

// ── ADMIN: DELETE inquiry ─────────────────────────────────────────────────────
router.delete("/:id", verifyToken, (req, res) => {
    db.query("DELETE FROM inquiries WHERE id = ?", [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "Not found" });
        res.json({ success: true, message: "Deleted" });
    });
});

module.exports = router;