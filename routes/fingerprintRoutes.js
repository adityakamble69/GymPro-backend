// backend/routes/fingerprintRoutes.js

const express = require("express");
const router  = express.Router();
const { getDriver, processAttendanceEvent } = require("../services/fingerprintService");
const { verifyToken, requireRole } = require("../middleware/authMiddleware");
const db = require("../config/db");

// ── GET device status ─────────────────────────────────────────────────────────
router.get("/status", verifyToken, (req, res) => {
    const driver = getDriver();
    res.json({
        success:   true,
        connected: driver.connected || false,
        device:    process.env.FINGERPRINT_DEVICE || "zkteco_wifi",
        ip:        process.env.ZKTECO_IP || "N/A"
    });
});

// ── Connect to device ─────────────────────────────────────────────────────────
router.post("/connect", verifyToken, requireRole("super_admin"), async (req, res) => {
    try {
        const result = await getDriver().connect();
        res.json(result);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── Disconnect device ─────────────────────────────────────────────────────────
router.post("/disconnect", verifyToken, requireRole("super_admin"), async (req, res) => {
    try {
        await getDriver().disconnect();
        res.json({ success: true, message: "Disconnected" });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── Enroll member fingerprint on device ───────────────────────────────────────
router.post("/enroll/:memberId", verifyToken, async (req, res) => {
    const { memberId } = req.params;

    db.query("SELECT id, full_name FROM members WHERE id = ?", [memberId], async (err, rows) => {
        if (err) return res.status(500).json({ success: false, message: "DB Error" });
        if (!rows.length) return res.status(404).json({ success: false, message: "Member not found" });

        try {
            const result = await getDriver().enrollMember(rows[0].id, rows[0].full_name);
            res.json(result);
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });
});

// ── Manual sync (pull all logs from device now) ────────────────────────────────
router.post("/sync", verifyToken, async (req, res) => {
    const driver = getDriver();
    if (!driver.connected) {
        return res.status(400).json({ success: false, message: "Device not connected" });
    }
    try {
        let processed = 0;
        if (driver.manualSync) {
            const logs = await driver.manualSync();
            for (const log of logs) {
                await processAttendanceEvent(
                    parseInt(log.deviceUserId),
                    log.inOutStatus === 0 ? "checkin" : "checkout",
                    new Date(log.attTime)
                );
                processed++;
            }
        }
        res.json({ success: true, processed, message: `${processed} records synced` });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── Manual check-in/out via fingerprint scan (for USB devices) ────────────────
// Frontend calls this after capturing fingerprint data
router.post("/manual-event", verifyToken, async (req, res) => {
    const { member_id, type } = req.body; // type: "checkin" | "checkout"
    if (!member_id || !type) {
        return res.status(400).json({ success: false, message: "member_id and type required" });
    }
    try {
        const result = await processAttendanceEvent(parseInt(member_id), type, new Date());
        res.json(result);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;