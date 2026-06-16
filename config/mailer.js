// config/mailer.js
// ── Workout World Gym Mailer — Resend v6 (Railway-compatible) ────────────────
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = `${process.env.EMAIL_FROM_NAME || "Workout World Gym"} <onboarding@resend.dev>`;

const transporter = {
  sendMail: async (mailOptions) => {
    const { data, error } = await resend.emails.send({
      from: mailOptions.from || FROM,
      to: Array.isArray(mailOptions.to) ? mailOptions.to : [mailOptions.to],
      subject: mailOptions.subject,
      html: mailOptions.html || "",
      text: mailOptions.text || "",
      attachments: (mailOptions.attachments || []).map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });

    if (error) {
      console.error("❌ Resend error:", error);
      throw new Error(error.message);
    }

    return { messageId: data?.id };
  },

  verify: (cb) => {
    if (!process.env.RESEND_API_KEY) {
      cb(new Error("RESEND_API_KEY not set in environment"));
    } else {
      console.log("✅ Mailer Ready — Resend v6 connected:", process.env.EMAIL_USER);
      cb(null, true);
    }
  },
};

module.exports = transporter;