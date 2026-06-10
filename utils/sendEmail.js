const transporter = require("../config/mailer");

const sendEmail = async (mailOptions) => {
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${mailOptions.to} | ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`❌ Email failed to ${mailOptions.to}:`, err.message);
    return { success: false, error: err.message };
  }
};

module.exports = sendEmail;