const express   = require("express");
const router    = express.Router();
const db        = require("../config/db");
const { verifyToken, requireRole } = require("../middleware/authMiddleware");

let sendEmail, paymentReceiptEmail;
try {
  sendEmail           = require("../utils/sendEmail");
  paymentReceiptEmail = require("../utils/emailTemplates").paymentReceiptEmail;
} catch (e) {
  sendEmail           = async () => ({ success: false });
  paymentReceiptEmail = () => ({});
}

function autoSavePlanHistory({ member_id, payment_id, plan_name, plan_start, plan_end, amount_paid, notes, admin_id }) {
  if (!plan_name || !plan_start) return;
  db.query(
    "SELECT id FROM member_plan_history WHERE member_id = ? AND plan_name = ? AND plan_start = ?",
    [member_id, plan_name, plan_start],
    (err, existing) => {
      if (err || existing.length > 0) return;
      db.query(
        `INSERT INTO member_plan_history (member_id, plan_name, plan_start, plan_end, amount_paid, payment_id, notes, changed_by) VALUES (?,?,?,?,?,?,?,?)`,
        [member_id, plan_name, plan_start, plan_end || null, amount_paid || 0, payment_id || null, notes || null, admin_id || null],
        (err2) => {
          if (err2) { console.error("Plan history auto-save error:", err2.message); return; }
          db.query("UPDATE members SET membership_type=?, membership_start=?, membership_end=?, status='active' WHERE id=?",
            [plan_name, plan_start, plan_end || null, member_id], () => {});
        }
      );
    }
  );
}

// ── GET ALL PAYMENTS ──────────────────────────────────────────────────────────
router.get("/", verifyToken, (req, res) => {
    const page   = parseInt(req.query.page)   || 1;
    const limit  = parseInt(req.query.limit)  || 10;
    const search = req.query.search           || "";
    const status = req.query.status           || "";
    const method = req.query.method           || "";
    const offset = (page - 1) * limit;
    const q      = `%${search}%`;

    let where    = "WHERE (m.full_name LIKE ? OR m.email LIKE ? OR m.phone LIKE ?)";
    const params = [q, q, q];
    if (status) { where += " AND p.status = ?";         params.push(status); }
    if (method) { where += " AND p.payment_method = ?"; params.push(method); }

    const countSql = `SELECT COUNT(*) AS total FROM payments p JOIN members m ON p.member_id = m.id ${where}`;
    const dataSql  = `SELECT p.*, m.full_name, m.email, m.phone, m.membership_type FROM payments p JOIN members m ON p.member_id = m.id ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;

    db.query(countSql, params, (err, countRes) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error", error: err.message });
        const total = countRes[0].total;
        db.query(dataSql, [...params, limit, offset], (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "DB Error", error: err.message });
            res.json({ success: true, data: rows, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
        });
    });
});

// ── GET STATS / SUMMARY ───────────────────────────────────────────────────────
router.get("/stats/summary", verifyToken, (req, res) => {
    const queries = {
        totalRevenue:    "SELECT COALESCE(SUM(amount),0)     AS val FROM payments WHERE status='paid'",
        thisMonth:       "SELECT COALESCE(SUM(amount),0)     AS val FROM payments WHERE status='paid' AND MONTH(payment_date)=MONTH(CURDATE()) AND YEAR(payment_date)=YEAR(CURDATE())",
        lastMonth:       "SELECT COALESCE(SUM(amount),0)     AS val FROM payments WHERE status='paid' AND MONTH(payment_date)=MONTH(DATE_SUB(CURDATE(),INTERVAL 1 MONTH)) AND YEAR(payment_date)=YEAR(DATE_SUB(CURDATE(),INTERVAL 1 MONTH))",
        pendingCount:    "SELECT COUNT(*)                    AS val FROM payments WHERE status='pending'",
        pendingAmount:   "SELECT COALESCE(SUM(due_amount),0) AS val FROM payments WHERE status='pending' AND due_amount > 0",
        todayRevenue:    "SELECT COALESCE(SUM(amount),0)     AS val FROM payments WHERE status='paid' AND payment_date=CURDATE()",
        totalDue:        "SELECT COALESCE(SUM(due_amount),0) AS val FROM payments WHERE due_amount > 0",
        totalCount:      "SELECT COUNT(*)                    AS val FROM payments WHERE status='paid'",
        methodBreakdown: "SELECT payment_method, COUNT(*) AS count, SUM(amount) AS total FROM payments WHERE status='paid' GROUP BY payment_method",
        monthly6: `SELECT DATE_FORMAT(MIN(payment_date),'%b %Y') AS label, MONTH(MIN(payment_date)) AS mo, YEAR(MIN(payment_date)) AS yr, SUM(amount) AS total FROM payments WHERE status='paid' AND payment_date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) GROUP BY YEAR(payment_date), MONTH(payment_date) ORDER BY yr ASC, mo ASC`,
    };
    const results = {};
    let pending = Object.keys(queries).length;
    Object.entries(queries).forEach(([key, sql]) => {
        db.query(sql, (err, rows) => {
            if (!err) { const multi = ["methodBreakdown","monthly6"].includes(key); results[key] = multi ? rows : (rows[0]?.val ?? 0); }
            if (--pending === 0) res.json({ success: true, data: results });
        });
    });
});

// ── DRILL DOWN: Years list ────────────────────────────────────────────────────
router.get("/drilldown/years", verifyToken, (req, res) => {
    db.query(
        `SELECT YEAR(payment_date) AS year, COALESCE(SUM(amount),0) AS total, COUNT(*) AS count
         FROM payments WHERE status='paid'
         GROUP BY YEAR(payment_date) ORDER BY year DESC`,
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "DB Error" });
            res.json({ success: true, data: rows });
        }
    );
});

// ── DRILL DOWN: Months of a year ─────────────────────────────────────────────
// FIX: DATE_FORMAT removed — causes Error 1055 in MySQL strict mode
// month_name now derived in JS
router.get("/drilldown/months/:year", verifyToken, (req, res) => {
    const MONTH_NAMES = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    db.query(
        `SELECT MONTH(payment_date) AS month,
                COALESCE(SUM(amount),0) AS total,
                COUNT(*) AS count
         FROM payments
         WHERE status='paid' AND YEAR(payment_date)=?
         GROUP BY MONTH(payment_date)
         ORDER BY month ASC`,
        [req.params.year],
        (err, rows) => {
            if (err) {
                console.error("DRILLDOWN MONTHS ERROR:", err.message);
                return res.status(500).json({ success: false, message: "DB Error: " + err.message });
            }
            const data = rows.map(r => ({ ...r, month_name: MONTH_NAMES[r.month] || String(r.month) }));
            res.json({ success: true, data });
        }
    );
});

// ── DRILL DOWN: Members in a month ───────────────────────────────────────────
router.get("/drilldown/members/:year/:month", verifyToken, (req, res) => {
    db.query(
        `SELECT p.id, p.amount, p.paid_amount, p.due_amount, p.payment_method, p.payment_for,
                p.plan_name, p.payment_date, p.status, m.full_name, m.phone
         FROM payments p JOIN members m ON p.member_id = m.id
         WHERE p.status='paid' AND YEAR(p.payment_date)=? AND MONTH(p.payment_date)=?
         ORDER BY p.amount DESC`,
        [req.params.year, req.params.month],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "DB Error" });
            res.json({ success: true, data: rows });
        }
    );
});

// ── TODAY's payments ──────────────────────────────────────────────────────────
router.get("/today/list", verifyToken, (req, res) => {
    db.query(
        `SELECT p.*, m.full_name, m.phone FROM payments p JOIN members m ON p.member_id = m.id
         WHERE p.payment_date = CURDATE() ORDER BY p.created_at DESC`,
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "DB Error" });
            res.json({ success: true, data: rows });
        }
    );
});

// ── THIS MONTH payments ───────────────────────────────────────────────────────
router.get("/thismonth/list", verifyToken, (req, res) => {
    db.query(
        `SELECT p.*, m.full_name, m.phone FROM payments p JOIN members m ON p.member_id = m.id
         WHERE MONTH(p.payment_date)=MONTH(CURDATE()) AND YEAR(p.payment_date)=YEAR(CURDATE())
         AND p.status='paid' ORDER BY p.payment_date DESC`,
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "DB Error" });
            res.json({ success: true, data: rows });
        }
    );
});

// ── PENDING payments list ─────────────────────────────────────────────────────
router.get("/pending/list", verifyToken, (req, res) => {
    db.query(
        `SELECT p.*, m.full_name, m.phone, m.email FROM payments p JOIN members m ON p.member_id = m.id
         WHERE p.status='pending' ORDER BY p.payment_date ASC`,
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "DB Error" });
            res.json({ success: true, data: rows });
        }
    );
});

// ── DUE AMOUNT list (member-wise) ─────────────────────────────────────────────
router.get("/due/list", verifyToken, (req, res) => {
    db.query(
        `SELECT m.id AS member_id, m.full_name, m.phone,
                COUNT(p.id) AS payment_count,
                COALESCE(SUM(p.amount),0) AS total_amount,
                COALESCE(SUM(p.paid_amount),0) AS total_paid,
                COALESCE(SUM(p.due_amount),0) AS total_due,
                MAX(p.payment_date) AS last_payment_date
         FROM payments p JOIN members m ON p.member_id = m.id
         WHERE p.due_amount > 0
         GROUP BY m.id, m.full_name, m.phone
         ORDER BY total_due DESC`,
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "DB Error" });
            res.json({ success: true, data: rows });
        }
    );
});

// ── CHART MONTH DETAIL: member+plan+pending for a chart bar ──────────────────
router.get("/chart-month/:year/:month", verifyToken, (req, res) => {
    db.query(
        `SELECT p.id, p.amount, p.paid_amount, p.due_amount, p.status,
                p.payment_for, p.plan_name, p.payment_date, p.payment_method,
                m.full_name, m.phone
         FROM payments p JOIN members m ON p.member_id = m.id
         WHERE YEAR(p.payment_date)=? AND MONTH(p.payment_date)=?
         ORDER BY m.full_name ASC`,
        [req.params.year, req.params.month],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "DB Error" });
            res.json({ success: true, data: rows });
        }
    );
});

// ── GET MEMBER PAYMENT HISTORY ────────────────────────────────────────────────
router.get("/member/:memberId", verifyToken, (req, res) => {
    db.query(
        "SELECT * FROM payments WHERE member_id = ? ORDER BY payment_date DESC LIMIT 50",
        [req.params.memberId],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "DB Error" });
            res.json({ success: true, data: rows });
        }
    );
});

// ── GET MEMBER PLAN HISTORY (from member_plan_history table) ──────────────────
router.get("/member/:memberId/plan-history", verifyToken, (req, res) => {
    // Try member_plan_history table first; fallback to building from payments
    db.query(
        `SELECT mph.*, p.payment_method
         FROM member_plan_history mph
         LEFT JOIN payments p ON mph.payment_id = p.id
         WHERE mph.member_id = ?
         ORDER BY mph.plan_start DESC`,
        [req.params.memberId],
        (err, rows) => {
            if (err || rows.length === 0) {
                // Fallback: derive from payments table
                db.query(
                    `SELECT id, plan_name, plan_start, plan_end,
                            paid_amount AS amount_paid, payment_date, payment_method, notes
                     FROM payments
                     WHERE member_id = ? AND plan_name IS NOT NULL
                     ORDER BY payment_date DESC`,
                    [req.params.memberId],
                    (err2, fallbackRows) => {
                        if (err2) return res.status(500).json({ success: false, message: "DB Error" });
                        res.json({ success: true, data: fallbackRows });
                    }
                );
            } else {
                res.json({ success: true, data: rows });
            }
        }
    );
});

// ── ADD PAYMENT ───────────────────────────────────────────────────────────────
router.post("/", verifyToken, (req, res) => {
    const { member_id, amount, paid_amount, payment_date, payment_method, payment_for, status, months_covered, notes, plan_name, plan_start, plan_end } = req.body;

    if (!member_id || !amount || !payment_date)
        return res.status(400).json({ success: false, message: "member_id, amount and payment_date are required" });

    const totalAmt    = parseFloat(amount);
    if (isNaN(totalAmt) || totalAmt <= 0) return res.status(400).json({ success: false, message: "Amount must be positive" });

    const paidAmt     = (paid_amount !== "" && paid_amount != null && !isNaN(parseFloat(paid_amount))) ? parseFloat(paid_amount) : totalAmt;
    const dueAmt      = parseFloat(Math.max(0, totalAmt - paidAmt).toFixed(2));
    const finalStatus = dueAmt > 0 ? "pending" : (status || "paid");
    const receivedBy  = req.admin?.id ?? null;

    db.query(
        `INSERT INTO payments (member_id, amount, paid_amount, due_amount, payment_date, payment_method, payment_for, status, months_covered, notes, received_by, plan_name, plan_start, plan_end) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [member_id, totalAmt, paidAmt, dueAmt, payment_date, payment_method || "cash", payment_for || "monthly", finalStatus, parseInt(months_covered) || 1, notes || null, receivedBy, plan_name || null, plan_start || null, plan_end || null],
        (err, result) => {
            if (err) { console.error("ADD PAYMENT ERROR:", err.message); return res.status(500).json({ success: false, message: "DB Error: " + err.message }); }

            const paymentId = result.insertId;

            if (plan_name && plan_start) {
                autoSavePlanHistory({ member_id, payment_id: paymentId, plan_name, plan_start, plan_end, amount_paid: paidAmt, notes, admin_id: receivedBy });
            } else if (payment_for && !["other","registration","monthly"].includes(payment_for)) {
                autoSavePlanHistory({ member_id, payment_id: paymentId, plan_name: payment_for, plan_start: payment_date, plan_end: null, amount_paid: paidAmt, notes, admin_id: receivedBy });
            }

            db.query("SELECT * FROM members WHERE id = ?", [member_id], (e, rows) => {
                if (!e && rows.length && rows[0].email) {
                    const member = rows[0];
                    const payment = { id: paymentId, amount: totalAmt, paid_amount: paidAmt, due_amount: dueAmt, payment_date, payment_method: payment_method || "cash", payment_for: payment_for || "monthly", months_covered: parseInt(months_covered) || 1, plan_name: plan_name || null, notes: notes || null };
                    sendEmail(paymentReceiptEmail(member, payment)).catch(() => {});
                }
            });

            res.status(201).json({ success: true, message: dueAmt > 0 ? `Partial payment. Due: ₹${dueAmt}` : "Payment recorded", id: paymentId, paid_amount: paidAmt, due_amount: dueAmt, status: finalStatus });
        }
    );
});

// ── UPDATE PAYMENT ────────────────────────────────────────────────────────────
router.put("/:id", verifyToken, (req, res) => {
    const { member_id, amount, paid_amount, payment_date, payment_method, payment_for, status, months_covered, notes, plan_name, plan_start, plan_end } = req.body;

    const totalAmt    = parseFloat(amount);
    if (isNaN(totalAmt) || totalAmt <= 0) return res.status(400).json({ success: false, message: "Amount must be positive" });

    const paidAmt     = (paid_amount !== "" && paid_amount != null && !isNaN(parseFloat(paid_amount))) ? parseFloat(paid_amount) : totalAmt;
    const dueAmt      = parseFloat(Math.max(0, totalAmt - paidAmt).toFixed(2));
    const finalStatus = dueAmt > 0 ? "pending" : (status || "paid");

    db.query(
        `UPDATE payments SET member_id=?, amount=?, paid_amount=?, due_amount=?, payment_date=?, payment_method=?, payment_for=?, status=?, months_covered=?, notes=?, plan_name=?, plan_start=?, plan_end=? WHERE id=?`,
        [member_id, totalAmt, paidAmt, dueAmt, payment_date, payment_method, payment_for, finalStatus, parseInt(months_covered) || 1, notes || null, plan_name || null, plan_start || null, plan_end || null, req.params.id],
        (err, result) => {
            if (err) return res.status(500).json({ success: false, message: "DB Error: " + err.message });
            if (!result.affectedRows) return res.status(404).json({ success: false, message: "Payment not found" });
            if (dueAmt === 0 && plan_name) {
                db.query("UPDATE member_plan_history SET amount_paid = ? WHERE payment_id = ?", [totalAmt, req.params.id], () => {});
            }
            res.json({ success: true, message: "Payment updated", due_amount: dueAmt, status: finalStatus });
        }
    );
});

// ── DELETE PAYMENT ────────────────────────────────────────────────────────────
router.delete("/:id", verifyToken, requireRole("super_admin"), (req, res) => {
    db.query("DELETE FROM payments WHERE id = ?", [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "Not found" });
        res.json({ success: true, message: "Payment deleted" });
    });
});

module.exports = router;