// routes/membershipPlanRoutes.js
const express = require("express");
const router  = express.Router();
const db      = require("../config/db");
const ctrl    = require("../controllers/membershipPlanController");
const { verifyToken } = require("../middleware/authMiddleware");

// ── PUBLIC: Inquiry form ke liye — no token required ─────────────────────────
router.get("/public", (req, res) => {
    db.query(
        `SELECT id, name, duration_type, duration_days, price, description, features
         FROM membership_plans WHERE status = 'active'
         ORDER BY price ASC`,
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "DB Error" });
            res.json({ success: true, data: rows });
        }
    );
});

// ── ADMIN routes (token required) ────────────────────────────────────────────
router.get("/",        verifyToken, ctrl.getAll);
router.get("/stats",   verifyToken, ctrl.getStats);
router.get("/:id",     verifyToken, ctrl.getOne);
router.post("/",       verifyToken, ctrl.create);
router.put("/:id",     verifyToken, ctrl.update);
router.delete("/:id",  verifyToken, ctrl.remove);
router.post("/assign", verifyToken, ctrl.assignToMember);

module.exports = router;