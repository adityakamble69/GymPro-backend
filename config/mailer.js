// config/mailer.js
// ── Workout World Gym Mailer — Resend (Railway-compatible) ───────────────────
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Nodemailer-compatible wrapper ─────────────────────────────────────────────
// sendEmail.js ko kuch change nahi karna — same interface
const transporter = {
  sendMail: async (mailOptions) => {
    const result = await resend.emails.send({
      from: mailOptions.from || `${process.env.EMAIL_FROM_NAME || "Workout World Gym"} <onboarding@resend.dev>`,
      to: Array.isArray(mailOptions.to) ? mailOptions.to : [mailOptions.to],
      subject: mailOptions.subject,
      html: mailOptions.html || "",
      text: mailOptions.text || "",
      attachments: (mailOptions.attachments || []).map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });

    if (result.error) throw new Error(result.error.message);

    return { messageId: result.data?.id };
  },

  verify: (cb) => {
    if (!process.env.RESEND_API_KEY) {
      cb(new Error("RESEND_API_KEY not set in environment"));
    } else {
      console.log("✅ Mailer Ready — Resend connected:", process.env.EMAIL_USER);
      cb(null, true);
    }
  },
};

module.exports = transporter;