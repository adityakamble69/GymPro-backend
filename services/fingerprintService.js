// backend/services/fingerprintService.js
// Universal fingerprint scanner integration
// Supports: ZKTeco (WiFi/LAN), Mantra MFS100, Morpho MSO1300, SecuGen, Startek

const db = require("../config/db");

// ── IST Helpers ───────────────────────────────────────────────────────────────
const getISTDate = () => {
    const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    return ist.toISOString().split("T")[0];
};
const getISTDateTime = () => {
    const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    return ist.toISOString().slice(0, 19).replace("T", " ");
};

// ── Device Type from .env ─────────────────────────────────────────────────────
const DEVICE_TYPE = (process.env.FINGERPRINT_DEVICE || "zkteco_wifi").toLowerCase();

// ═══════════════════════════════════════════════════════════════════════════════
// DRIVER 1 — ZKTeco WiFi/LAN (iClock series, standalone wall mount)
// Best for: Gym entrance wall mount, auto check-in without staff
// npm install zkteco-js
// ═══════════════════════════════════════════════════════════════════════════════
class ZKTecoWiFiDriver {
    constructor() {
        this.instance   = null;
        this.connected  = false;
        this.pollTimer  = null;
        this.lastSync   = new Date(0);
    }

    async connect() {
        const ZKLib = require("zkteco-js");
        const ip    = process.env.ZKTECO_IP   || "192.168.1.201";
        const port  = parseInt(process.env.ZKTECO_PORT) || 4370;
        console.log(`🔌 ZKTeco WiFi connecting to ${ip}:${port}...`);
        this.instance  = new ZKLib(ip, port, 5000, 4000);
        await this.instance.createSocket();
        this.connected = true;
        console.log("✅ ZKTeco WiFi connected!");
        this._startPolling();
        return { success: true };
    }

    async disconnect() {
        if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
        if (this.instance)  { await this.instance.disconnect(); this.instance = null; }
        this.connected = false;
    }

    async enrollMember(memberId, memberName) {
        await this.instance.setUser(parseInt(memberId), String(memberId), memberName, "", 0, 0);
        return { success: true };
    }

    async manualSync() {
        const result = await this.instance.getAttendances();
        return result.data || [];
    }

    _startPolling() {
        const interval = parseInt(process.env.ZKTECO_POLL_INTERVAL) || 30000;
        this.pollTimer = setInterval(async () => {
            if (!this.connected) return;
            try {
                const result = await this.instance.getAttendances();
                const logs   = (result.data || []).filter(l => new Date(l.attTime) > this.lastSync);
                for (const log of logs) {
                    await processAttendanceEvent(
                        parseInt(log.deviceUserId),
                        log.inOutStatus === 0 ? "checkin" : "checkout",
                        new Date(log.attTime)
                    );
                }
                if (logs.length > 0) this.lastSync = new Date();
            } catch (e) {
                console.error("ZKTeco poll error:", e.message);
                this.connected = false;
                setTimeout(() => this.connect().catch(() => {}), 15000);
            }
        }, interval);
        console.log(`🔄 ZKTeco polling every ${interval/1000}s`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DRIVER 2 — ZKTeco USB (ZK4500, ZK9500 — plugged into PC)
// Best for: Reception desk, staff marks attendance
// npm install zkteco-js
// ═══════════════════════════════════════════════════════════════════════════════
class ZKTecoUSBDriver {
    constructor() { this.connected = false; }

    async connect() {
        // USB ZKTeco uses same zkteco-js but with USB mode
        // Device creates a local SDK server at localhost
        const ZKLib    = require("zkteco-js");
        this.instance  = new ZKLib("localhost", 4370, 5000, 4000);
        await this.instance.createSocket();
        this.connected = true;
        console.log("✅ ZKTeco USB connected!");
        return { success: true };
    }

    async disconnect() {
        if (this.instance) await this.instance.disconnect();
        this.connected = false;
    }

    async enrollMember(memberId, memberName) {
        await this.instance.setUser(parseInt(memberId), String(memberId), memberName, "", 0, 0);
        return { success: true };
    }

    async manualSync() {
        const result = await this.instance.getAttendances();
        return result.data || [];
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DRIVER 3 — Mantra MFS100 / MFS110 (USB, very popular in India)
// Best for: Budget-friendly, widely available
// Uses Mantra's Windows SDK + local HTTP server bridge
// Download: https://download.mantratecapp.com/
// ═══════════════════════════════════════════════════════════════════════════════
class MantraDriver {
    constructor() {
        this.connected  = false;
        this.bridgeUrl  = process.env.MANTRA_BRIDGE_URL || "http://localhost:11100";
    }

    async connect() {
        // Mantra SDK runs a local HTTP server on Windows
        // Install Mantra RD Service, it exposes API at localhost:11100
        try {
            const axios = require("axios");
            const res   = await axios.get(`${this.bridgeUrl}/rd/info`, { timeout: 3000 });
            this.connected = res.data?.rdService ? true : false;
            if (this.connected) console.log("✅ Mantra MFS100 connected via RD Service!");
            return { success: this.connected };
        } catch (e) {
            return { success: false, error: "Mantra RD Service not running. Install from: https://download.mantratecapp.com/" };
        }
    }

    async disconnect() { this.connected = false; }

    // Capture fingerprint and return template
    async captureFingerprint() {
        const axios = require("axios");
        const body  = `<?xml version="1.0"?><PidOptions ver="1.0"><Opts fCount="1" fType="0" iCount="0" pCount="0" format="0" pidVer="2.0" timeout="10000" posh="UNKNOWN" env="P" wadh="" pType="0"/></PidOptions>`;
        const res   = await axios.post(`${this.bridgeUrl}/rd/capture`, body, {
            headers: { "Content-Type": "text/xml" }, timeout: 15000
        });
        return res.data; // XML response with fingerprint data
    }

    // Match fingerprint against stored template
    async matchFingerprint(capturedData, storedTemplate) {
        // Use Mantra's match API or implement your own matching logic
        // For simplicity: use member ID from the device response
        return { matched: true, memberId: null }; // implement based on Mantra SDK
    }

    async enrollMember(memberId, memberName) {
        // Capture fingerprint and store template in DB
        try {
            const fpData = await this.captureFingerprint();
            // Store template in members table or separate fingerprints table
            await new Promise((resolve, reject) => {
                db.query(
                    "UPDATE members SET fingerprint_template = ? WHERE id = ?",
                    [JSON.stringify(fpData), memberId],
                    (err) => err ? reject(err) : resolve()
                );
            });
            return { success: true, message: `${memberName} fingerprint enrolled` };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DRIVER 4 — Morpho MSO 1300 / MSO 1350 (USB)
// Best for: High accuracy, government-grade
// Uses MorphoSmart SDK (Windows)
// ═══════════════════════════════════════════════════════════════════════════════
class MorphoDriver {
    constructor() {
        this.connected = false;
        this.bridgeUrl = process.env.MORPHO_BRIDGE_URL || "http://localhost:11200";
    }

    async connect() {
        try {
            const axios = require("axios");
            await axios.get(`${this.bridgeUrl}/status`, { timeout: 3000 });
            this.connected = true;
            console.log("✅ Morpho MSO connected!");
            return { success: true };
        } catch (e) {
            return { success: false, error: "Morpho bridge not running. Setup bridge service first." };
        }
    }

    async disconnect() { this.connected = false; }

    async captureFingerprint() {
        const axios = require("axios");
        const res   = await axios.post(`${this.bridgeUrl}/capture`, {}, { timeout: 15000 });
        return res.data;
    }

    async enrollMember(memberId, memberName) {
        try {
            const fpData = await this.captureFingerprint();
            await new Promise((resolve, reject) => {
                db.query(
                    "UPDATE members SET fingerprint_template = ? WHERE id = ?",
                    [JSON.stringify(fpData), memberId],
                    (err) => err ? reject(err) : resolve()
                );
            });
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DRIVER 5 — SecuGen Hamster Pro (USB)
// Uses SecuGen SDK bridge
// ═══════════════════════════════════════════════════════════════════════════════
class SecuGenDriver {
    constructor() {
        this.connected = false;
        this.bridgeUrl = process.env.SECUGEN_BRIDGE_URL || "http://localhost:11300";
    }

    async connect() {
        try {
            const axios = require("axios");
            await axios.get(`${this.bridgeUrl}/status`, { timeout: 3000 });
            this.connected = true;
            console.log("✅ SecuGen connected!");
            return { success: true };
        } catch (e) {
            return { success: false, error: "SecuGen bridge not running." };
        }
    }

    async disconnect() { this.connected = false; }

    async enrollMember(memberId, memberName) {
        return { success: true, message: "Use SecuGen SDK to enroll" };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DRIVER 6 — Startek FM220 (USB)
// Uses Startek RD Service bridge
// ═══════════════════════════════════════════════════════════════════════════════
class StartekDriver {
    constructor() {
        this.connected = false;
        this.bridgeUrl = process.env.STARTEK_BRIDGE_URL || "http://localhost:11400";
    }

    async connect() {
        try {
            const axios = require("axios");
            await axios.get(`${this.bridgeUrl}/status`, { timeout: 3000 });
            this.connected = true;
            console.log("✅ Startek FM220 connected!");
            return { success: true };
        } catch (e) {
            return { success: false, error: "Startek bridge not running." };
        }
    }

    async disconnect() { this.connected = false; }

    async enrollMember(memberId, memberName) {
        return { success: true, message: "Use Startek SDK to enroll" };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORE — Process attendance event (shared by all drivers)
// ═══════════════════════════════════════════════════════════════════════════════
const processAttendanceEvent = async (memberId, type, eventTime = new Date()) => {
    const ist      = new Date(eventTime.getTime() + 5.5 * 60 * 60 * 1000);
    const dateStr  = ist.toISOString().split("T")[0];
    const timeStr  = ist.toISOString().slice(0, 19).replace("T", " ");

    // Verify member exists
    const member = await new Promise((resolve, reject) => {
        db.query("SELECT id, full_name FROM members WHERE id = ?", [memberId],
            (err, rows) => err ? reject(err) : resolve(rows[0] || null));
    });

    if (!member) {
        console.warn(`⚠️  Member ID ${memberId} not found`);
        return { success: false, message: "Member not found" };
    }

    if (type === "checkin") {
        // Check duplicate
        const existing = await new Promise((resolve, reject) => {
            db.query("SELECT id FROM attendance WHERE member_id = ? AND date = ?",
                [memberId, dateStr], (err, rows) => err ? reject(err) : resolve(rows));
        });

        if (existing.length > 0) {
            console.log(`ℹ️  ${member.full_name} already checked in today`);
            return { success: false, message: "Already checked in" };
        }

        await new Promise((resolve, reject) => {
            db.query(
                "INSERT INTO attendance (member_id, date, check_in, status, notes) VALUES (?, ?, ?, 'present', 'Fingerprint Auto')",
                [memberId, dateStr, timeStr],
                (err) => err ? reject(err) : resolve()
            );
        });

        console.log(`✅ CHECK-IN: ${member.full_name} at ${timeStr}`);
        return { success: true, action: "checkin", member: member.full_name, time: timeStr };

    } else {
        // Check-out
        await new Promise((resolve, reject) => {
            db.query(
                "UPDATE attendance SET check_out = ? WHERE member_id = ? AND date = ? AND check_out IS NULL ORDER BY check_in DESC LIMIT 1",
                [timeStr, memberId, dateStr],
                (err) => err ? reject(err) : resolve()
            );
        });

        console.log(`✅ CHECK-OUT: ${member.full_name} at ${timeStr}`);
        return { success: true, action: "checkout", member: member.full_name, time: timeStr };
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY — Select driver based on .env FINGERPRINT_DEVICE
// ═══════════════════════════════════════════════════════════════════════════════
let activeDriver = null;

const getDriver = () => {
    if (activeDriver) return activeDriver;
    switch (DEVICE_TYPE) {
        case "zkteco_wifi":  activeDriver = new ZKTecoWiFiDriver();  break;
        case "zkteco_usb":   activeDriver = new ZKTecoUSBDriver();   break;
        case "mantra":       activeDriver = new MantraDriver();       break;
        case "morpho":       activeDriver = new MorphoDriver();       break;
        case "secugen":      activeDriver = new SecuGenDriver();      break;
        case "startek":      activeDriver = new StartekDriver();      break;
        default:
            console.warn(`⚠️  Unknown device type: ${DEVICE_TYPE}. Using zkteco_wifi`);
            activeDriver = new ZKTecoWiFiDriver();
    }
    return activeDriver;
};

module.exports = {
    getDriver,
    processAttendanceEvent,
    getISTDate,
    getISTDateTime
};