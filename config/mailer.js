require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.verify((err, success) => {
  if (err) console.error("❌ Mailer Error:", err.message);
  else     console.log("✅ Mailer Ready — Gmail connected:", process.env.EMAIL_USER);
});

module.exports = transporter;