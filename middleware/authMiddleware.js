// middleware/authMiddleware.js
const jwt = require("jsonwebtoken");

// ── Verify JWT Token ──────────────────────────────────────────────────────────
const verifyToken = (req, res, next) => {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "No token provided" });

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ success: false, message: "Invalid or expired token" });
        req.admin = decoded;
        next();
    });
};

// ── RBAC: Require specific role(s) ───────────────────────────────────────────
const requireRole = (...roles) => (req, res, next) => {
    if (!req.admin) return res.status(401).json({ success: false, message: "Not authenticated" });
    if (!roles.includes(req.admin.role)) {
        return res.status(403).json({
            success: false,
            message: `Access denied. Required role: ${roles.join(" or ")}`
        });
    }
    next();
};

module.exports = { verifyToken, requireRole };