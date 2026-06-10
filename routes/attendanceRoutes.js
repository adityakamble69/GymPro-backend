const express = require("express");
const router  = express.Router();
const db      = require("../config/db");
const { verifyToken, requireRole } = require("../middleware/authMiddleware");

// ── IST Time Helpers ──────────────────────────────────────────────────────────
// India Standard Time = UTC + 5:30
const getISTDate = () => {
    const now = new Date();
    const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    return ist.toISOString().split("T")[0]; // "YYYY-MM-DD"
};

const getISTDateTime = () => {
    const now = new Date();
    const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    return ist.toISOString().slice(0, 19).replace("T", " "); // "YYYY-MM-DD HH:MM:SS"
};

// ── GET today's attendance list ───────────────────────────────────────────────
router.get("/today", verifyToken, (req, res) => {
    const today = getISTDate();
    const sql = `
        SELECT a.*, m.full_name, m.email, m.phone, m.membership_type
        FROM attendance a
        JOIN members m ON a.member_id = m.id
        WHERE a.date = ?
        ORDER BY a.check_in DESC
    `;
    db.query(sql, [today], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error", error: err });
        res.json({ success: true, data: rows, date: today });
    });
});

// ── GET attendance by date ─────────────────────────────────────────────────
router.get("/date/:date", verifyToken, (req, res) => {
    const sql = `
        SELECT a.*, m.full_name, m.email, m.phone, m.membership_type
        FROM attendance a
        JOIN members m ON a.member_id = m.id
        WHERE a.date = ?
        ORDER BY a.check_in DESC
    `;
    db.query(sql, [req.params.date], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        res.json({ success: true, data: rows });
    });
});

// ── GET weekly stats (last 7 days) — for charts ────────────────────────────
router.get("/stats/weekly", verifyToken, (req, res) => {
    const sql = `
        SELECT
            DATE(date) AS day,
            COUNT(*) AS count
        FROM attendance
        WHERE date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        AND status = 'present'
        GROUP BY DATE(date)
        ORDER BY day ASC
    `;
    db.query(sql, (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });

        // Fill in missing days with 0
        const result = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dayStr = d.toISOString().split("T")[0];
            const found  = rows.find(r => r.day?.toISOString?.().split("T")[0] === dayStr || r.day === dayStr);
            result.push({ day: dayStr, count: found ? found.count : 0 });
        }
        res.json({ success: true, data: result });
    });
});

// ── GET monthly stats (last 30 days) — for charts ─────────────────────────
router.get("/stats/monthly", verifyToken, (req, res) => {
    const sql = `
        SELECT
            WEEK(date) AS week_num,
            MIN(DATE(date)) AS week_start,
            COUNT(*) AS count
        FROM attendance
        WHERE date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
        AND status = 'present'
        GROUP BY WEEK(date)
        ORDER BY week_num ASC
    `;
    db.query(sql, (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        res.json({ success: true, data: rows });
    });
});

// ── GET member attendance history ─────────────────────────────────────────
router.get("/member/:memberId", verifyToken, (req, res) => {
    const sql = `
        SELECT * FROM attendance
        WHERE member_id = ?
        ORDER BY date DESC, check_in DESC
        LIMIT 30
    `;
    db.query(sql, [req.params.memberId], (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        res.json({ success: true, data: rows });
    });
});

// ── GET dashboard summary stats ───────────────────────────────────────────
router.get("/stats/summary", verifyToken, (req, res) => {
    const today = getISTDate();
    const queries = {
        todayCount:   "SELECT COUNT(*) AS val FROM attendance WHERE date = ? AND status = 'present'",
        yesterdayCount: "SELECT COUNT(*) AS val FROM attendance WHERE date = DATE_SUB(?, INTERVAL 1 DAY) AND status = 'present'",
        weekCount:    "SELECT COUNT(*) AS val FROM attendance WHERE date >= DATE_SUB(?, INTERVAL 6 DAY) AND status = 'present'",
        totalMembers: "SELECT COUNT(*) AS val FROM members WHERE status = 'active'",
        membershipBreakdown: "SELECT membership_type, COUNT(*) AS count FROM members GROUP BY membership_type",
        statusBreakdown:     "SELECT status, COUNT(*) AS count FROM members GROUP BY status",
    };

    const results = {};
    let pending = Object.keys(queries).length;

    Object.entries(queries).forEach(([key, sql]) => {
        const param = ["membershipBreakdown","statusBreakdown"].includes(key) ? [] : [today];
        db.query(sql, param, (err, rows) => {
            if (!err) {
                results[key] = ["membershipBreakdown","statusBreakdown"].includes(key)
                    ? rows
                    : rows[0]?.val || 0;
            }
            if (--pending === 0) res.json({ success: true, data: results });
        });
    });
});

// ── MARK attendance (check-in) ────────────────────────────────────────────
router.post("/checkin", verifyToken, (req, res) => {
    const { member_id, notes } = req.body;
    if (!member_id) return res.status(400).json({ success: false, message: "member_id required" });

    const today = getISTDate();
    const now   = getISTDateTime();

    // Check if already checked in today
    db.query(
        "SELECT id FROM attendance WHERE member_id = ? AND date = ?",
        [member_id, today],
        (err, existing) => {
            if (err) return res.status(500).json({ success: false, message: "DB Error" });
            if (existing.length > 0) {
                return res.status(400).json({ success: false, message: "Member already checked in today" });
            }

            db.query(
                "INSERT INTO attendance (member_id, date, check_in, status, notes, marked_by) VALUES (?, ?, ?, 'present', ?, ?)",
                [member_id, today, now, notes || null, req.admin.id],
                (err, result) => {
                    if (err) return res.status(500).json({ success: false, message: "DB Error", error: err });
                    res.status(201).json({ success: true, message: "Check-in marked", id: result.insertId });
                }
            );
        }
    );
});

// ── MARK check-out ────────────────────────────────────────────────────────
router.put("/checkout/:id", verifyToken, (req, res) => {
    const now = getISTDateTime();
    db.query(
        "UPDATE attendance SET check_out = ? WHERE id = ? AND check_out IS NULL",
        [now, req.params.id],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: "DB Error" });
            if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Record not found or already checked out" });
            res.json({ success: true, message: "Check-out marked" });
        }
    );
});

// ── DELETE attendance record (super_admin only) ───────────────────────────
router.delete("/:id", verifyToken, requireRole("super_admin"), (req, res) => {
    db.query("DELETE FROM attendance WHERE id = ?", [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        if (result.affectedRows === 0) return res.status(404).json({ success: false, message: "Not found" });
        res.json({ success: true, message: "Deleted" });
    });
});

module.exports = router;