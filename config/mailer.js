require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const nodemailer = require("nodemailer");
const dns = require("dns");

dns.setDefaultResultOrder("ipv4first");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,        // 465 → 587
  secure: false,    // true → false
  requireTLS: true, // yeh add karo
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  family: 4,
});

transporter.verify((err, success) => {
  if (err) console.error("❌ Mailer Error:", err.message);
  else     console.log("✅ Mailer Ready — Gmail connected:", process.env.EMAIL_USER);
});

module.exports = transporter;