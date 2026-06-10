const express = require("express");
const router  = express.Router();
const db      = require("../config/db");
const { verifyToken } = require("../middleware/authMiddleware");

// ── REVENUE REPORT ────────────────────────────────────────────────────────────
router.get("/revenue", verifyToken, (req, res) => {
    const year = req.query.year || new Date().getFullYear();
    const queries = {
        monthly: `
            SELECT MONTH(payment_date) AS month, SUM(amount) AS total, COUNT(*) AS count
            FROM payments WHERE status = 'paid' AND YEAR(payment_date) = ?
            GROUP BY MONTH(payment_date) ORDER BY month ASC`,
        yearly: `
            SELECT YEAR(payment_date) AS year, SUM(amount) AS total, COUNT(*) AS count
            FROM payments WHERE status = 'paid'
            GROUP BY YEAR(payment_date) ORDER BY year ASC`,
        summary: `
            SELECT
                COALESCE(SUM(CASE WHEN YEAR(payment_date)=? AND status='paid' THEN amount END),0) AS this_year,
                COALESCE(SUM(CASE WHEN YEAR(payment_date)=?-1 AND status='paid' THEN amount END),0) AS last_year,
                COALESCE(SUM(CASE WHEN MONTH(payment_date)=MONTH(CURDATE()) AND YEAR(payment_date)=YEAR(CURDATE()) AND status='paid' THEN amount END),0) AS this_month,
                COALESCE(SUM(CASE WHEN status='paid' THEN amount END),0) AS all_time,
                COUNT(CASE WHEN status='pending' THEN 1 END) AS pending_count,
                COALESCE(SUM(CASE WHEN status='pending' THEN amount END),0) AS pending_amount
            FROM payments`,
        byMethod: `
            SELECT payment_method, COUNT(*) AS count, SUM(amount) AS total
            FROM payments WHERE status='paid' AND YEAR(payment_date)=?
            GROUP BY payment_method`,
    };
    const results = {};
    let pending = Object.keys(queries).length;
    const done = () => { if (--pending === 0) res.json({ success: true, data: results }); };
    db.query(queries.monthly,  [year],       (err, rows) => { if (!err) results.monthly  = rows; done(); });
    db.query(queries.yearly,   [],           (err, rows) => { if (!err) results.yearly   = rows; done(); });
    db.query(queries.summary,  [year, year], (err, rows) => { if (!err) results.summary  = rows[0]; done(); });
    db.query(queries.byMethod, [year],       (err, rows) => { if (!err) results.byMethod = rows; done(); });
});

// ── DRILLDOWN: Year → Months (for Last Year / All Time year click) ────────────
router.get("/drilldown/year/:year", verifyToken, (req, res) => {
    const { year } = req.params;
    db.query(`
        SELECT
            MONTH(payment_date) AS month,
            SUM(amount)         AS total,
            SUM(paid_amount)    AS paid,
            SUM(due_amount)     AS due,
            COUNT(*)            AS count
        FROM payments
        WHERE YEAR(payment_date) = ?
        GROUP BY MONTH(payment_date)
        ORDER BY month ASC`,
        [year],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, data: rows, year: Number(year) });
        }
    );
});

// ── DRILLDOWN: All Years list ─────────────────────────────────────────────────
router.get("/drilldown/all-years", verifyToken, (req, res) => {
    db.query(`
        SELECT
            YEAR(payment_date)  AS year,
            SUM(amount)         AS total,
            SUM(paid_amount)    AS paid,
            SUM(due_amount)     AS due,
            COUNT(*)            AS count
        FROM payments
        GROUP BY YEAR(payment_date)
        ORDER BY year DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, data: rows });
        }
    );
});

// ── DRILLDOWN: Month → Members who paid ──────────────────────────────────────
router.get("/drilldown/members/:year/:month", verifyToken, (req, res) => {
    const { year, month } = req.params;
    db.query(`
        SELECT p.*, m.full_name, m.phone, m.email, m.membership_type
        FROM payments p
        JOIN members m ON p.member_id = m.id
        WHERE YEAR(p.payment_date) = ? AND MONTH(p.payment_date) = ?
        ORDER BY p.payment_date DESC`,
        [year, month],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, data: rows });
        }
    );
});

// ── DRILLDOWN: This Month members ────────────────────────────────────────────
router.get("/drilldown/this-month", verifyToken, (req, res) => {
    db.query(`
        SELECT p.*, m.full_name, m.phone, m.email, m.membership_type
        FROM payments p
        JOIN members m ON p.member_id = m.id
        WHERE MONTH(p.payment_date) = MONTH(CURDATE())
          AND YEAR(p.payment_date)  = YEAR(CURDATE())
        ORDER BY p.payment_date DESC`,
        [],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, data: rows });
        }
    );
});

// ── DRILLDOWN: Payment method → Members ──────────────────────────────────────
router.get("/drilldown/method/:method", verifyToken, (req, res) => {
    const { method } = req.params;
    const year = req.query.year || new Date().getFullYear();
    db.query(`
        SELECT p.*, m.full_name, m.phone, m.email, m.membership_type
        FROM payments p
        JOIN members m ON p.member_id = m.id
        WHERE p.payment_method = ?
          AND YEAR(p.payment_date) = ?
          AND p.status = 'paid'
        ORDER BY p.payment_date DESC`,
        [method, year],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, data: rows, method, year: Number(year) });
        }
    );
});

// ── MEMBER GROWTH REPORT ──────────────────────────────────────────────────────
router.get("/members", verifyToken, (req, res) => {
    const year = req.query.year || new Date().getFullYear();
    const queries = {
        monthly: `
            SELECT MONTH(created_at) AS month, COUNT(*) AS new_members
            FROM members WHERE YEAR(created_at)=?
            GROUP BY MONTH(created_at) ORDER BY month ASC`,
        byType:   `SELECT membership_type, COUNT(*) AS count FROM members GROUP BY membership_type`,
        byStatus: `SELECT status, COUNT(*) AS count FROM members GROUP BY status`,
        summary: `
            SELECT COUNT(*) AS total,
                SUM(status='active') AS active, SUM(status='inactive') AS inactive, SUM(status='expired') AS expired,
                COUNT(CASE WHEN MONTH(created_at)=MONTH(CURDATE()) AND YEAR(created_at)=YEAR(CURDATE()) THEN 1 END) AS this_month
            FROM members`,
    };
    const results = {};
    let pending = Object.keys(queries).length;
    const done = () => { if (--pending === 0) res.json({ success: true, data: results }); };
    db.query(queries.monthly,  [year], (err, rows) => { if (!err) results.monthly  = rows; done(); });
    db.query(queries.byType,   [],     (err, rows) => { if (!err) results.byType   = rows; done(); });
    db.query(queries.byStatus, [],     (err, rows) => { if (!err) results.byStatus = rows; done(); });
    db.query(queries.summary,  [],     (err, rows) => { if (!err) results.summary  = rows[0]; done(); });
});

// ── ATTENDANCE REPORT ─────────────────────────────────────────────────────────
router.get("/attendance", verifyToken, (req, res) => {
    const year = req.query.year || new Date().getFullYear();
    const queries = {
        monthly: `
            SELECT MONTH(date) AS month, COUNT(*) AS total,
                SUM(status='present') AS present, SUM(status='absent') AS absent
            FROM attendance WHERE YEAR(date)=?
            GROUP BY MONTH(date) ORDER BY month ASC`,
        weekly: `
            SELECT DATE(date) AS day, COUNT(*) AS count
            FROM attendance
            WHERE date >= DATE_SUB(CURDATE(), INTERVAL 29 DAY) AND status='present'
            GROUP BY DATE(date) ORDER BY day ASC`,
        summary: `
            SELECT COUNT(*) AS total, SUM(status='present') AS present,
                COUNT(CASE WHEN date=CURDATE() THEN 1 END) AS today,
                COUNT(CASE WHEN MONTH(date)=MONTH(CURDATE()) AND YEAR(date)=YEAR(CURDATE()) THEN 1 END) AS this_month
            FROM attendance`,
        topMembers: `
            SELECT m.full_name, m.membership_type, COUNT(a.id) AS visits
            FROM attendance a JOIN members m ON a.member_id=m.id
            WHERE a.status='present' AND YEAR(a.date)=?
            GROUP BY a.member_id, m.full_name, m.membership_type
            ORDER BY visits DESC LIMIT 5`,
    };
    const results = {};
    let pending = Object.keys(queries).length;
    const done = () => { if (--pending === 0) res.json({ success: true, data: results }); };
    db.query(queries.monthly,    [year], (err, rows) => { if (!err) results.monthly    = rows; done(); });
    db.query(queries.weekly,     [],     (err, rows) => { if (!err) results.weekly     = rows; done(); });
    db.query(queries.summary,    [],     (err, rows) => { if (!err) results.summary    = rows[0]; done(); });
    db.query(queries.topMembers, [year], (err, rows) => { if (!err) results.topMembers = rows; done(); });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// YEH 4 ROUTES apne reportRoutes.js mein ADD karo
// module.exports = router; se PEHLE paste karo
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── MEMBER GROWTH DRILLDOWN: Stat filter (total / active / inactive / this_month)
// GET /api/reports/members/drilldown/stat?filter=all|active|inactive|this_month
router.get("/members/drilldown/stat", verifyToken, (req, res) => {
    const { filter } = req.query;

    let whereClause = "1=1";
    if (filter === "active")      whereClause = "status = 'active'";
    if (filter === "inactive")    whereClause = "status = 'inactive'";
    if (filter === "this_month")  whereClause = "MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())";

    db.query(
        `SELECT id, full_name, email, phone, membership_type, status, membership_start, membership_end, created_at
         FROM members
         WHERE ${whereClause}
         ORDER BY created_at DESC`,
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, data: rows, filter });
        }
    );
});

// ── MEMBER GROWTH DRILLDOWN: Kis month mein kaun join kiya
// GET /api/reports/members/drilldown/month/:year/:month
router.get("/members/drilldown/month/:year/:month", verifyToken, (req, res) => {
    const { year, month } = req.params;
    db.query(
        `SELECT id, full_name, email, phone, membership_type, status, membership_start, membership_end, created_at
         FROM members
         WHERE YEAR(created_at) = ? AND MONTH(created_at) = ?
         ORDER BY created_at DESC`,
        [year, month],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, data: rows, year: Number(year), month: Number(month) });
        }
    );
});

// ── MEMBER GROWTH DRILLDOWN: Membership type ke members
// GET /api/reports/members/drilldown/type/:type
router.get("/members/drilldown/type/:type", verifyToken, (req, res) => {
    const { type } = req.params;
    db.query(
        `SELECT id, full_name, email, phone, membership_type, status, membership_start, membership_end, created_at
         FROM members
         WHERE membership_type = ?
         ORDER BY created_at DESC`,
        [type],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, data: rows, type });
        }
    );
});

// ── MEMBER GROWTH DRILLDOWN: Date range filter
// GET /api/reports/members/drilldown/daterange?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/members/drilldown/daterange", verifyToken, (req, res) => {
    const { from, to } = req.query;
    if (!from || !to)
        return res.status(400).json({ success: false, message: "from aur to date dono required hain" });

    db.query(
        `SELECT id, full_name, email, phone, membership_type, status, membership_start, membership_end, created_at
         FROM members
         WHERE DATE(created_at) >= ? AND DATE(created_at) <= ?
         ORDER BY created_at DESC`,
        [from, to],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, data: rows, from, to });
        }
    );
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// YEH 4 ROUTES apne reportRoutes.js mein ADD karo
// module.exports = router; se PEHLE paste karo
// (Member Growth drilldown routes ke baad)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── ATTENDANCE DRILLDOWN: Stat filter
// GET /api/reports/attendance/drilldown/stat?filter=all|present|today|this_month
router.get("/attendance/drilldown/stat", verifyToken, (req, res) => {
    const { filter } = req.query;

    let whereClause = "1=1";
    if (filter === "present")    whereClause = "a.status = 'present'";
    if (filter === "today")      whereClause = "DATE(a.date) = CURDATE() AND a.status = 'present'";
    if (filter === "this_month") whereClause = "MONTH(a.date) = MONTH(CURDATE()) AND YEAR(a.date) = YEAR(CURDATE()) AND a.status = 'present'";

    db.query(
        `SELECT a.id, a.date, a.check_in, a.check_out, a.status, a.notes,
                m.id AS member_id, m.full_name, m.phone, m.email, m.membership_type
         FROM attendance a
         JOIN members m ON a.member_id = m.id
         WHERE ${whereClause}
         ORDER BY a.date DESC, a.check_in DESC`,
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, data: rows, filter });
        }
    );
});

// ── ATTENDANCE DRILLDOWN: Specific month ke records
// GET /api/reports/attendance/drilldown/month/:year/:month
router.get("/attendance/drilldown/month/:year/:month", verifyToken, (req, res) => {
    const { year, month } = req.params;
    db.query(
        `SELECT a.id, a.date, a.check_in, a.check_out, a.status, a.notes,
                m.id AS member_id, m.full_name, m.phone, m.email, m.membership_type
         FROM attendance a
         JOIN members m ON a.member_id = m.id
         WHERE YEAR(a.date) = ? AND MONTH(a.date) = ?
         ORDER BY a.date DESC, a.check_in DESC`,
        [year, month],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, data: rows, year: Number(year), month: Number(month) });
        }
    );
});

// ── ATTENDANCE DRILLDOWN: Specific day ke check-ins
// GET /api/reports/attendance/drilldown/day/:date  (date format: YYYY-MM-DD)
router.get("/attendance/drilldown/day/:date", verifyToken, (req, res) => {
    const { date } = req.params;
    db.query(
        `SELECT a.id, a.date, a.check_in, a.check_out, a.status, a.notes,
                m.id AS member_id, m.full_name, m.phone, m.email, m.membership_type
         FROM attendance a
         JOIN members m ON a.member_id = m.id
         WHERE DATE(a.date) = ?
         ORDER BY a.check_in DESC`,
        [date],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, data: rows, date });
        }
    );
});

// ── ATTENDANCE DRILLDOWN: Specific member ki poori history
// GET /api/reports/attendance/drilldown/member/:memberId
router.get("/attendance/drilldown/member/:memberId", verifyToken, (req, res) => {
    const { memberId } = req.params;
    db.query(
        `SELECT a.id, a.date, a.check_in, a.check_out, a.status, a.notes,
                m.full_name, m.phone, m.email, m.membership_type
         FROM attendance a
         JOIN members m ON a.member_id = m.id
         WHERE a.member_id = ?
         ORDER BY a.date DESC, a.check_in DESC`,
        [memberId],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: err.message });

            // Summary bhi bhejo
            const present = rows.filter(r => r.status === "present").length;
            res.json({
                success: true,
                data: rows,
                summary: {
                    total: rows.length,
                    present,
                    member_name: rows[0]?.full_name || "",
                    membership_type: rows[0]?.membership_type || "",
                }
            });
        }
    );
});

// ── ATTENDANCE DRILLDOWN: Date range
// GET /api/reports/attendance/drilldown/daterange?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/attendance/drilldown/daterange", verifyToken, (req, res) => {
    const { from, to } = req.query;
    if (!from || !to)
        return res.status(400).json({ success: false, message: "from aur to date dono required hain" });

    db.query(
        `SELECT a.id, a.date, a.check_in, a.check_out, a.status, a.notes,
                m.id AS member_id, m.full_name, m.phone, m.email, m.membership_type
         FROM attendance a
         JOIN members m ON a.member_id = m.id
         WHERE DATE(a.date) >= ? AND DATE(a.date) <= ?
         ORDER BY a.date DESC, a.check_in DESC`,
        [from, to],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, data: rows, from, to });
        }
    );
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  YEH ROUTE apne reportRoutes.js mein add karo
//  module.exports = router;  se PEHLE paste karo
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── REVENUE DRILLDOWN: Custom Date Range ─────────────────────
// GET /api/reports/drilldown/daterange?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/drilldown/daterange", verifyToken, (req, res) => {
    const { from, to } = req.query;

    if (!from || !to)
        return res.status(400).json({ success: false, message: "from aur to date dono required hain" });

    db.query(
        `SELECT
             p.id, p.member_id, p.amount, p.paid_amount, p.due_amount,
             p.payment_date, p.payment_method, p.payment_for,
             p.plan_name, p.status, p.notes,
             m.full_name, m.phone, m.email, m.membership_type,

             -- Summary fields
             SUM(p.amount)       OVER () AS range_total,
             COUNT(p.id)         OVER () AS range_count,
             COUNT(DISTINCT p.member_id) OVER () AS unique_members
         FROM payments p
         JOIN members m ON p.member_id = m.id
         WHERE DATE(p.payment_date) >= ? AND DATE(p.payment_date) <= ?
         ORDER BY p.payment_date DESC`,
        [from, to],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: err.message });

            const total          = rows.reduce((s, r) => s + Number(r.amount), 0);
            const collected      = rows.filter(r => r.status === "paid").reduce((s, r) => s + Number(r.amount), 0);
            const uniqueMembers  = new Set(rows.map(r => r.member_id)).size;

            res.json({
                success: true,
                data: rows,
                summary: {
                    total,
                    collected,
                    pending:        total - collected,
                    count:          rows.length,
                    unique_members: uniqueMembers,
                    from,
                    to,
                }
            });
        }
    );
});

module.exports = router;