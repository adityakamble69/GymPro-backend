const express = require("express");
const router  = express.Router();
const db      = require("../config/db");
const bcrypt  = require("bcryptjs");
const { verifyToken } = require("../middleware/authMiddleware");

// ── GET current admin profile ─────────────────────────────────────────────────
router.get("/", verifyToken, (req, res) => {
    db.query(
        "SELECT id, full_name, email, role, created_at FROM admins WHERE id = ?",
        [req.admin.id],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "DB Error" });
            if (!rows.length) return res.status(404).json({ success: false, message: "Admin not found" });
            res.json({ success: true, data: rows[0] });
        }
    );
});

// ── UPDATE profile (name + email) ─────────────────────────────────────────────
router.put("/update", verifyToken, (req, res) => {
    const { full_name, email } = req.body;
    if (!full_name || !email)
        return res.status(400).json({ success: false, message: "Name and email required" });

    // Check email not taken by another admin
    db.query(
        "SELECT id FROM admins WHERE email = ? AND id != ?",
        [email, req.admin.id],
        (err, rows) => {
            if (err) return res.status(500).json({ success: false, message: "DB Error" });
            if (rows.length) return res.status(400).json({ success: false, message: "Email already in use" });

            db.query(
                "UPDATE admins SET full_name = ?, email = ? WHERE id = ?",
                [full_name, email, req.admin.id],
                (err, result) => {
                    if (err) return res.status(500).json({ success: false, message: "DB Error" });
                    res.json({ success: true, message: "Profile updated", data: { full_name, email } });
                }
            );
        }
    );
});

// ── CHANGE password ───────────────────────────────────────────────────────────
router.put("/change-password", verifyToken, async (req, res) => {
    const { current_password, new_password, confirm_password } = req.body;

    if (!current_password || !new_password || !confirm_password)
        return res.status(400).json({ success: false, message: "All fields required" });

    if (new_password !== confirm_password)
        return res.status(400).json({ success: false, message: "New passwords do not match" });

    if (new_password.length < 6)
        return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });

    db.query("SELECT password FROM admins WHERE id = ?", [req.admin.id], async (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        if (!rows.length) return res.status(404).json({ success: false, message: "Admin not found" });

        const stored = rows[0].password;

        // Support both plain text (legacy) and bcrypt
        let isMatch = false;
        if (stored.startsWith("$2")) {
            isMatch = await bcrypt.compare(current_password, stored);
        } else {
            isMatch = stored === current_password;
        }

        if (!isMatch)
            return res.status(401).json({ success: false, message: "Current password is incorrect" });

        const hashed = await bcrypt.hash(new_password, 10);
        db.query(
            "UPDATE admins SET password = ? WHERE id = ?",
            [hashed, req.admin.id],
            (err) => {
                if (err) return res.status(500).json({ success: false, message: "DB Error" });
                res.json({ success: true, message: "Password changed successfully" });
            }
        );
    });
});

module.exports = router;