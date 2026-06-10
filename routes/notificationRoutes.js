const express = require("express");
const router  = express.Router();
const db      = require("../config/db");
const { verifyToken } = require("../middleware/authMiddleware");

// ── AUTO-GENERATE notifications from live DB data ─────────────────────────────
function generateNotifications(callback) {
    const inserts = [];
    let pending = 4;
    const done = () => { if (--pending === 0) callback(inserts); };

    // 1. Expired memberships
    db.query(
        `SELECT id, full_name, membership_end FROM members
         WHERE status = 'active' AND membership_end < CURDATE()`,
        (err, rows) => {
            if (!err) rows.forEach(r => inserts.push({
                type: "membership_expired",
                title: "Membership Expired",
                message: `${r.full_name}'s membership expired on ${new Date(r.membership_end).toLocaleDateString("en-IN")}`,
                ref_id: r.id, ref_type: "member"
            }));
            done();
        }
    );

    // 2. Memberships expiring in 7 days
    db.query(
        `SELECT id, full_name, membership_end FROM members
         WHERE status = 'active'
         AND membership_end BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)`,
        (err, rows) => {
            if (!err) rows.forEach(r => {
                const daysLeft = Math.ceil((new Date(r.membership_end) - new Date()) / (1000 * 60 * 60 * 24));
                inserts.push({
                    type: "membership_expiring",
                    title: "Membership Expiring Soon",
                    message: `${r.full_name}'s membership expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
                    ref_id: r.id, ref_type: "member"
                });
            });
            done();
        }
    );

    // 3. Equipment maintenance due within 7 days
    db.query(
        `SELECT id, name, next_maintenance FROM equipment
         WHERE status = 'active'
         AND next_maintenance IS NOT NULL
         AND next_maintenance <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)`,
        (err, rows) => {
            if (!err) rows.forEach(r => {
                const daysLeft = Math.ceil((new Date(r.next_maintenance) - new Date()) / (1000 * 60 * 60 * 24));
                const overdue  = daysLeft < 0;
                inserts.push({
                    type: "equipment_maintenance",
                    title: overdue ? "Maintenance Overdue" : "Maintenance Due Soon",
                    message: overdue
                        ? `${r.name} maintenance is overdue by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? "s" : ""}`
                        : `${r.name} is due for maintenance in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`,
                    ref_id: r.id, ref_type: "equipment"
                });
            });
            done();
        }
    );

    // 4. Pending inquiries
    db.query(
        `SELECT id, full_name, created_at FROM inquiries
         WHERE status = 'pending'
         ORDER BY created_at DESC`,
        (err, rows) => {
            if (!err && rows) rows.forEach(r => inserts.push({
                type: "inquiry",
                title: "New Inquiry Received",
                message: `${r.full_name} ne inquiry ki hai — reply pending hai`,
                ref_id: r.id, ref_type: "inquiry"
            }));
            done();
        }
    );
}

// ── GET UNREAD COUNT ──────────────────────────────────────────────────────────
// IMPORTANT: Specific routes PEHLE, dynamic /:id routes BAAD MEIN
router.get("/unread-count", verifyToken, (req, res) => {
    db.query("SELECT COUNT(*) AS count FROM notifications WHERE is_read = 0", (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        res.json({ success: true, count: rows[0].count });
    });
});

// ── SYNC: Generate fresh notifications ───────────────────────────────────────
router.post("/sync", verifyToken, (req, res) => {
    generateNotifications((inserts) => {
        if (inserts.length === 0)
            return res.json({ success: true, message: "No new alerts", created: 0 });

        db.query(
            `DELETE FROM notifications WHERE is_read = 0 AND type != 'general'`,
            (err) => {
                if (err) return res.status(500).json({ success: false, message: "DB Error" });

                const values = inserts.map(n => [n.type, n.title, n.message, n.ref_id || null, n.ref_type || null]);
                db.query(
                    "INSERT INTO notifications (type, title, message, ref_id, ref_type) VALUES ?",
                    [values],
                    (err, result) => {
                        if (err) return res.status(500).json({ success: false, message: "DB Error", error: err });
                        res.json({ success: true, message: "Notifications synced", created: result.affectedRows });
                    }
                );
            }
        );
    });
});

// ── MARK ALL AS READ ── (specific route — BEFORE /:id)
router.put("/mark-all/read", verifyToken, (req, res) => {
    db.query("UPDATE notifications SET is_read = 1 WHERE is_read = 0", (err, result) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        res.json({ success: true, message: "All marked as read", updated: result.affectedRows });
    });
});

// ── DELETE ALL READ ── (specific route — BEFORE /:id)
router.delete("/clear/read", verifyToken, (req, res) => {
    db.query("DELETE FROM notifications WHERE is_read = 1", (err, result) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        res.json({ success: true, message: "Cleared", deleted: result.affectedRows });
    });
});

// ── GET ALL NOTIFICATIONS (paginated) ─────────────────────────────────────────
router.get("/", verifyToken, (req, res) => {
    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    db.query("SELECT COUNT(*) AS total FROM notifications", (err, countRes) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        const total = countRes[0].total;
        db.query(
            "SELECT * FROM notifications ORDER BY created_at DESC LIMIT ? OFFSET ?",
            [limit, offset],
            (err, rows) => {
                if (err) return res.status(500).json({ success: false, message: "DB Error" });
                res.json({
                    success: true, data: rows,
                    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
                });
            }
        );
    });
});

// ── MARK ONE AS READ ── (dynamic route — AFTER specific routes)
router.put("/:id/read", verifyToken, (req, res) => {
    db.query("UPDATE notifications SET is_read = 1 WHERE id = ?", [req.params.id], (err) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        res.json({ success: true, message: "Marked as read" });
    });
});

// ── DELETE ONE ── (dynamic route — AFTER specific routes)
router.delete("/:id", verifyToken, (req, res) => {
    db.query("DELETE FROM notifications WHERE id = ?", [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "Not found" });
        res.json({ success: true, message: "Deleted" });
    });
});

module.exports = router;