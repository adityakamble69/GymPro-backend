const express = require("express");
const router  = express.Router();
const db      = require("../config/db");
const { verifyToken, requireRole } = require("../middleware/authMiddleware");

// GET ALL
router.get("/", verifyToken, (req, res) => {
    const page     = parseInt(req.query.page)   || 1;
    const limit    = parseInt(req.query.limit)  || 10;
    const search   = req.query.search           || "";
    const category = req.query.category         || "";
    const status   = req.query.status           || "";
    const offset   = (page - 1) * limit;
    const q        = `%${search}%`;

    let where = "WHERE (name LIKE ? OR brand LIKE ? OR model LIKE ? OR serial_number LIKE ? OR location LIKE ?)";
    const params = [q, q, q, q, q];

    if (category) { where += " AND category = ?"; params.push(category); }
    if (status)   { where += " AND status = ?";   params.push(status);   }

    db.query(`SELECT COUNT(*) AS total FROM equipment ${where}`, params, (err, countRes) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error", error: err });
        const total = countRes[0].total;

        db.query(
            `SELECT * FROM equipment ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset],
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

// STATS
router.get("/stats/summary", verifyToken, (req, res) => {
    const queries = {
        total:          "SELECT COUNT(*) AS val FROM equipment",
        active:         "SELECT COUNT(*) AS val FROM equipment WHERE status = 'active'",
        maintenance:    "SELECT COUNT(*) AS val FROM equipment WHERE status = 'under_maintenance'",
        totalValue:     "SELECT COALESCE(SUM(purchase_price * quantity), 0) AS val FROM equipment",
        categoryBreak:  "SELECT category, COUNT(*) AS count FROM equipment GROUP BY category ORDER BY count DESC",
        conditionBreak: "SELECT condition_status, COUNT(*) AS count FROM equipment GROUP BY condition_status",
    };

    const results = {};
    let pending = Object.keys(queries).length;

    Object.entries(queries).forEach(([key, sql]) => {
        db.query(sql, (err, rows) => {
            if (!err) {
                const multi = ["categoryBreak","conditionBreak"].includes(key);
                results[key] = multi ? rows : (rows[0]?.val ?? 0);
            }
            if (--pending === 0) res.json({ success: true, data: results });
        });
    });
});

// GET SINGLE
router.get("/:id", verifyToken, (req, res) => {
    db.query("SELECT * FROM equipment WHERE id = ?", [req.params.id], (err, rows) => {
        if (err)          return res.status(500).json({ success: false, message: "DB Error" });
        if (!rows.length) return res.status(404).json({ success: false, message: "Not found" });
        res.json({ success: true, data: rows[0] });
    });
});

// ADD
router.post("/", verifyToken, (req, res) => {
    const {
        name, category, brand, model, serial_number,
        purchase_date, purchase_price, condition_status,
        location, quantity, notes, status
    } = req.body;

    if (!name || !category)
        return res.status(400).json({ success: false, message: "Name and category are required" });

    const sql = `INSERT INTO equipment
        (name, category, brand, model, serial_number, purchase_date,
         purchase_price, condition_status, location, quantity, notes, status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;

    db.query(sql, [
        name, category, brand || null, model || null,
        serial_number || null, purchase_date || null,
        purchase_price || 0, condition_status || "good",
        location || null, quantity || 1,
        notes || null, status || "active"
    ], (err, result) => {
        if (err) {
            if (err.code === "ER_DUP_ENTRY")
                return res.status(400).json({ success: false, message: "Serial number already exists" });
            return res.status(500).json({ success: false, message: "DB Error", error: err });
        }
        res.status(201).json({ success: true, message: "Equipment added", id: result.insertId });
    });
});

// UPDATE
router.put("/:id", verifyToken, (req, res) => {
    const {
        name, category, brand, model, serial_number,
        purchase_date, purchase_price, condition_status,
        location, quantity, notes, status
    } = req.body;

    const sql = `UPDATE equipment SET
        name=?, category=?, brand=?, model=?, serial_number=?,
        purchase_date=?, purchase_price=?, condition_status=?,
        location=?, quantity=?, notes=?, status=?
        WHERE id=?`;

    db.query(sql, [
        name, category, brand, model, serial_number,
        purchase_date, purchase_price, condition_status,
        location, quantity, notes, status, req.params.id
    ], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "Not found" });
        res.json({ success: true, message: "Equipment updated" });
    });
});

// DELETE
router.delete("/:id", verifyToken, requireRole("super_admin"), (req, res) => {
    db.query("DELETE FROM equipment WHERE id = ?", [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "Not found" });
        res.json({ success: true, message: "Equipment deleted" });
    });
});

module.exports = router;