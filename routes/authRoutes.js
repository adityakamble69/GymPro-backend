const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../config/db");

router.post("/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: "Email and password required" });
    }

    db.query("SELECT * FROM admins WHERE email = ?", [email], async (err, result) => {
        if (err) return res.status(500).json({ success: false, message: "Database Error" });

        if (result.length === 0) {
            return res.status(401).json({ success: false, message: "Admin Not Found" });
        }

        const admin = result[0];

        // Support both plain text (legacy) and bcrypt passwords
        let isMatch = false;
        if (admin.password.startsWith("$2")) {
            isMatch = await bcrypt.compare(password, admin.password);
        } else {
            isMatch = admin.password === password;
        }

        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Wrong Password" });
        }

        const token = jwt.sign(
            { id: admin.id, email: admin.email, role: admin.role },
            process.env.JWT_SECRET,
            { expiresIn: "8h" }
        );

        res.json({
            success: true,
            message: "Login Successful",
            token,
            admin: {
                id: admin.id,
                name: admin.full_name,
                email: admin.email,
                role: admin.role
            }
        });
    });
});

module.exports = router;