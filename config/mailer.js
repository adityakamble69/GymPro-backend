require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const nodemailer = require("nodemailer");
const dns = require("dns");

// ✅ Force IPv4 first — fixes Railway ENETUNREACH/timeout issue
dns.setDefaultResultOrder("ipv4first");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  family: 4, // force IPv4
});

transporter.verify((err, success) => {
  if (err) console.error("❌ Mailer Error:", err.message);
  else     console.log("✅ Mailer Ready — Gmail connected:", process.env.EMAIL_USER);
});

module.exports = transporter;