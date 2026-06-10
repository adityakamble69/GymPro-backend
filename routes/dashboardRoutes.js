const express = require("express");
const router  = express.Router();
const db      = require("../config/db");
const { verifyToken } = require("../middleware/authMiddleware");

// ── MAIN DASHBOARD STATS ──────────────────────────────────────────────────────
router.get("/stats", verifyToken, (req, res) => {
    const queries = {
        totalMembers:    "SELECT COUNT(*) AS val FROM members",
        activeMembers:   "SELECT COUNT(*) AS val FROM members WHERE status = 'active'",
        todayAttendance: "SELECT COUNT(*) AS val FROM attendance WHERE date = CURDATE() AND status = 'present'",
        totalRevenue:    "SELECT COALESCE(SUM(amount), 0) AS val FROM payments WHERE status = 'paid'",
        thisMonthRev:    "SELECT COALESCE(SUM(amount), 0) AS val FROM payments WHERE status = 'paid' AND MONTH(payment_date) = MONTH(CURDATE()) AND YEAR(payment_date) = YEAR(CURDATE())",
        pendingPayments: "SELECT COUNT(*) AS val FROM payments WHERE status = 'pending'",
        pendingAmount:   "SELECT COALESCE(SUM(amount), 0) AS val FROM payments WHERE status = 'pending'",
        activeTrainers:  "SELECT COUNT(*) AS val FROM trainers WHERE status = 'active'",
        totalTrainers:   "SELECT COUNT(*) AS val FROM trainers",
        equipmentCount:  "SELECT COUNT(*) AS val FROM equipment WHERE status = 'active'",
        totalEquipment:  "SELECT COUNT(*) AS val FROM equipment",
        yesterdayAtt:    "SELECT COUNT(*) AS val FROM attendance WHERE date = DATE_SUB(CURDATE(), INTERVAL 1 DAY) AND status = 'present'",
        lastMonthRev:    "SELECT COALESCE(SUM(amount), 0) AS val FROM payments WHERE status = 'paid' AND MONTH(payment_date) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH)) AND YEAR(payment_date) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))",
        newMembersMonth: "SELECT COUNT(*) AS val FROM members WHERE MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())",
    };

    const results = {};
    let pending = Object.keys(queries).length;

    Object.entries(queries).forEach(([key, sql]) => {
        db.query(sql, (err, rows) => {
            if (!err) results[key] = rows[0]?.val ?? 0;
            if (--pending === 0) res.json({ success: true, data: results });
        });
    });
});

// ── REVENUE CHART (last 6 months) ─────────────────────────────────────────────
router.get("/revenue-chart", verifyToken, (req, res) => {
    const sql = `
        SELECT
            DATE_FORMAT(payment_date, '%b %Y') AS label,
            MONTH(payment_date)  AS mo,
            YEAR(payment_date)   AS yr,
            SUM(amount)          AS total
        FROM payments
        WHERE status = 'paid'
        AND payment_date >= DATE_SUB(CURDATE(), INTERVAL 5 MONTH)
        GROUP BY YEAR(payment_date), MONTH(payment_date)
        ORDER BY yr ASC, mo ASC
    `;
    db.query(sql, (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        res.json({ success: true, data: rows });
    });
});

// ── ATTENDANCE CHART (last 7 days) ────────────────────────────────────────────
router.get("/attendance-chart", verifyToken, (req, res) => {
    const sql = `
        SELECT
            DATE(date)      AS day,
            DAYNAME(date)   AS day_name,
            COUNT(*)        AS count
        FROM attendance
        WHERE date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        AND status = 'present'
        GROUP BY DATE(date), DAYNAME(date)
        ORDER BY day ASC
    `;
    db.query(sql, (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });

        // Fill missing days with 0
        const result = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dayStr  = d.toISOString().split("T")[0];
            const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
            const found   = rows.find(r => {
                const rDay = r.day instanceof Date
                    ? r.day.toISOString().split("T")[0]
                    : r.day;
                return rDay === dayStr;
            });
            result.push({ day: dayStr, day_name: dayName, count: found ? found.count : 0 });
        }
        res.json({ success: true, data: result });
    });
});

// ── RECENT MEMBERS (last 5) ───────────────────────────────────────────────────
router.get("/recent-members", verifyToken, (req, res) => {
    db.query(
        `SELECT id, full_name, email, phone, membership_type, status, created_at
         FROM members ORDER BY created_at DESC LIMIT 5`,
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "DB Error" });
            res.json({ success: true, data: rows });
        }
    );
});

// ── RECENT PAYMENTS (last 5) ──────────────────────────────────────────────────
router.get("/recent-payments", verifyToken, (req, res) => {
    db.query(
        `SELECT p.id, p.amount, p.payment_date, p.payment_method,
                p.payment_for, p.status, m.full_name, m.membership_type
         FROM payments p
         JOIN members m ON p.member_id = m.id
         ORDER BY p.created_at DESC LIMIT 5`,
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "DB Error" });
            res.json({ success: true, data: rows });
        }
    );
});

module.exports = router;