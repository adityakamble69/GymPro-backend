const db        = require("../config/db");
const sendEmail = require("./sendEmail");
const { expiryWarningEmail } = require("./emailTemplates");

const checkExpiringMemberships = () => {
  console.log("🔄 Checking expiring memberships...");

  db.query(
    `SELECT * FROM members
     WHERE status = 'active'
     AND membership_end BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
     AND email IS NOT NULL AND email != ''`,
    (err, rows) => {
      if (err) return console.error("❌ Expiry check DB error:", err.message);

      if (rows.length === 0) {
        console.log("✅ No expiring memberships in next 7 days");
        return;
      }

      console.log(`📧 Found ${rows.length} expiring membership(s) — sending emails...`);

      rows.forEach(member => {
        const daysLeft = Math.ceil(
          (new Date(member.membership_end) - new Date()) / (1000 * 60 * 60 * 24)
        );
        sendEmail(expiryWarningEmail(member, daysLeft))
          .then(r => console.log(`  → ${member.full_name} (${daysLeft}d): ${r.success ? "✅ sent" : "❌ failed"}`));
      });
    }
  );
};

module.exports = checkExpiringMemberships;