// utils/smsService.js
// ── Workout World Gym WhatsApp — Meta WhatsApp Business API only ────────────

const axios = require("axios");

// Normalise Indian number → +91XXXXXXXXXX
const normalise = (phone) =>
  phone.startsWith("+") ? phone : `+91${String(phone).replace(/[\s\-]/g, "").replace(/^\+91/, "")}`;

// ── Send WhatsApp (Meta WhatsApp Business API) ─────────────────────────────────
const sendWhatsApp = async (phone, message) => {
  try {
    const token        = process.env.META_WHATSAPP_TOKEN;
    const phoneNumberId = process.env.META_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      console.log("⚠️ WhatsApp skipped — Meta credentials not configured");
      return { success: false, error: "WhatsApp not configured" };
    }

    const toNumber = normalise(phone).replace("+", ""); // Meta wants without +

    const res = await axios.post(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        to: toNumber,
        type: "text",
        text: { body: message }
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log(`✅ WhatsApp sent to ${phone} | ID: ${res.data.messages?.[0]?.id}`);
    return { success: true, id: res.data.messages?.[0]?.id };
  } catch (err) {
    console.error("❌ WhatsApp error:", err.response?.data?.error?.message || err.message);
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
};

module.exports = { sendWhatsApp };