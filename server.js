require("dotenv").config();
const express            = require("express");
const cors               = require("cors");
const path               = require("path");
const db                 = require("./config/db");

// ── Routes ────────────────────────────────────────────────────────────────────
const authRoutes           = require("./routes/authRoutes");
const memberRoutes         = require("./routes/memberRoutes");
const attendanceRoutes     = require("./routes/attendanceRoutes");
const trainerRoutes        = require("./routes/trainerRoutes");
const paymentRoutes        = require("./routes/paymentRoutes");
const equipmentRoutes      = require("./routes/equipmentRoutes");
const reportRoutes         = require("./routes/reportRoutes");
const dashboardRoutes      = require("./routes/dashboardRoutes");
const notifRoutes          = require("./routes/notificationRoutes");
const profileRoutes        = require("./routes/profileRoutes");
const inquiryRoutes        = require("./routes/inquiryRoutes");
const membershipPlanRoutes = require("./routes/membershipPlanRoutes");
const { startReminderCron } = require("./utils/reminderCron");
const reminderRoutes = require("./routes/reminderRoutes");

// ── Email & Cron ──────────────────────────────────────────────────────────────
require("./config/mailer");                               // init + verify Gmail on startup
const checkExpiringMemberships = require("./utils/expiryChecker");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/api/auth",             authRoutes);
app.use("/api/members",          memberRoutes);
app.use("/api/attendance",       attendanceRoutes);
app.use("/api/trainers",         trainerRoutes);
app.use("/api/payments",         paymentRoutes);
app.use("/api/equipment",        equipmentRoutes);
app.use("/api/reports",          reportRoutes);
app.use("/api/dashboard",        dashboardRoutes);
app.use("/api/notifications",    notifRoutes);
app.use("/api/profile",          profileRoutes);
app.use("/api/inquiries",        inquiryRoutes);
app.use("/api/membership-plans", membershipPlanRoutes);
app.use("/api/reminders", reminderRoutes);
startReminderCron();

// ── Serve Public Inquiry Form ─────────────────────────────────────────────────
app.use("/inquiry", express.static(path.join(__dirname, "public/inquiry")));

app.get("/", (req, res) => res.send("GymPro API Running ⚡"));

// ── Start Server ──────────────────────────────────────────────────────────────
app.listen(process.env.PORT, () => {
    console.log(`🚀 Server running on port ${process.env.PORT}`);

    // ✅ Expiry check — run once on startup, then every 24 hours
    setTimeout(() => {
        checkExpiringMemberships();
        setInterval(checkExpiringMemberships, 24 * 60 * 60 * 1000);
    }, 3000); // 3 second delay — wait for DB to be ready
});