require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const nodemailer = require("nodemailer");
const dns = require("dns");

// ✅ Force IPv4 — fixes Railway ENETUNREACH/IPv6 issue
dns.setDefaultResultOrder("ipv4first");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,         // 465 nahi — Railway pe 587 kaam karta hai
  secure: false,     // 587 ke saath false hona chahiye
  requireTLS: true,  // TLS enforce karo
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  family: 4,         // force IPv4
  tls: {
    rejectUnauthorized: false, // Railway SSL quirks ke liye
  },
});

transporter.verify((err, success) => {
  if (err) console.error("❌ Mailer Error:", err.message);
  else     console.log("✅ Mailer Ready — Gmail connected:", process.env.EMAIL_USER);
});

module.exports = transporter;