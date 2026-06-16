const transporter = require("../config/mailer");

const sendEmail = async (mailOptions) => {
  try {
    const info = await transporter.sendMail(mailOptions);
    const hasAttachment = mailOptions.attachments && mailOptions.attachments.length > 0;
    console.log(`✅ Email sent to ${mailOptions.to} | ID: ${info.messageId}${hasAttachment ? " | 📎 with attachment" : ""}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`❌ Email failed to ${mailOptions.to}:`, err.message);
    return { success: false, error: err.message };
  }
};

module.exports = sendEmail;