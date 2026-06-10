// routes/reminderRoutes.js
const express  = require("express");
const router   = express.Router();
const { verifyToken, requireRole } = require("../middleware/authMiddleware");
const { sendSMS, sendWhatsApp }    = require("../utils/smsService");
const { runRemindersNow }          = require("../utils/reminderCron");

// GET /api/reminders/test-sms?phone=9876543210
router.get("/test-sms", verifyToken, async (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ success: false, message: "Phone number required" });

  const result = await sendSMS(
    phone,
    `Test SMS from GymPro — System is working! Time: ${new Date().toLocaleTimeString("en-IN")}`
  );
  return res.json({ success: result.success, data: result });
});

// GET /api/reminders/test-wa?phone=9876543210
router.get("/test-wa", verifyToken, async (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ success: false, message: "Phone number required" });

  const result = await sendWhatsApp(
    phone,
    `GymPro Test Message\n\nWhatsApp reminder system is working!\n\nTime: ${new Date().toLocaleTimeString("en-IN")}`
  );
  return res.json({ success: result.success, data: result });
});

// POST /api/reminders/run-now  (super_admin only)
router.post("/run-now", verifyToken, requireRole("super_admin"), async (req, res) => {
  try {
    await runRemindersNow();
    return res.json({ success: true, message: "Reminders triggered successfully!" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;