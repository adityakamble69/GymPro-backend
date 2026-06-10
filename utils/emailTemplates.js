const FROM = `"${process.env.EMAIL_FROM_NAME || "GymPro"}" <${process.env.EMAIL_USER}>`;

const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })
  : "—";

const fmtAmount = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

// ── Shared Header & Footer ────────────────────────────────────────────────────
const header = `
  <div style="background:#111;padding:28px 40px;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:26px;letter-spacing:3px;font-family:Arial,sans-serif">
      ⚡ GYMP<span style="color:#666">RO</span>
    </h1>
    <p style="color:#666;margin:5px 0 0;font-size:12px;letter-spacing:1px">GYM MANAGEMENT SYSTEM</p>
  </div>`;

const footer = `
  <div style="background:#f5f5f5;padding:20px 40px;text-align:center;border-top:1px solid #e0e0e0">
    <p style="color:#aaa;font-size:12px;margin:0;font-family:Arial,sans-serif">
      © ${new Date().getFullYear()} GymPro · All rights reserved
    </p>
  </div>`;

const wrap = (content) => `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08)">
    ${header}
    ${content}
    ${footer}
  </div>`;

const tableRow = (label, value, highlight = false) => `
  <tr>
    <td style="padding:10px 0;color:#888;font-size:13px;border-bottom:1px solid #f0f0f0;width:40%">${label}</td>
    <td style="padding:10px 0;font-size:13px;border-bottom:1px solid #f0f0f0;font-weight:${highlight ? "700" : "500"};color:${highlight ? "#10b981" : "#111"}">${value}</td>
  </tr>`;

// ── 1. Welcome Email ──────────────────────────────────────────────────────────
const welcomeEmail = (member) => ({
  from: FROM,
  to: member.email,
  subject: `🎉 Welcome to GymPro, ${member.full_name}! Your Membership is Active`,
  html: wrap(`
    <div style="background:#d1fae5;padding:16px 40px;border-left:4px solid #10b981;text-align:center">
      <p style="color:#065f46;font-weight:700;margin:0;font-size:15px">🎉 Membership Successfully Activated!</p>
    </div>

    <div style="padding:36px 40px">
      <h2 style="color:#111;margin:0 0 10px;font-size:22px">Welcome, ${member.full_name}! 💪</h2>
      <p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 24px">
        Your membership has been successfully activated at GymPro. We're thrilled to have you as part of our fitness family!
      </p>

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px 24px;margin-bottom:24px">
        <h3 style="color:#111;margin:0 0 14px;font-size:12px;text-transform:uppercase;letter-spacing:1.5px">Membership Details</h3>
        <table style="width:100%;border-collapse:collapse">
          ${tableRow("Member Name", member.full_name)}
          ${tableRow("Email", member.email)}
          ${tableRow("Phone", member.phone)}
          ${tableRow("Plan", `<span style="text-transform:capitalize">${member.membership_type || "Standard"}</span>`)}
          ${tableRow("Valid From", fmtDate(member.membership_start))}
          ${tableRow("Valid Until", `<span style="color:#10b981;font-weight:700">${fmtDate(member.membership_end)}</span>`)}
        </table>
      </div>

      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px;margin-bottom:24px">
        <p style="color:#92400e;font-size:13px;margin:0">
          💡 <strong>Tip:</strong> Please carry a valid ID on your first visit. Our staff will assist you with the gym induction.
        </p>
      </div>

      <p style="color:#888;font-size:13px;line-height:1.7">
        If you have any questions or need assistance, feel free to reach out to us. 
        We look forward to seeing you at the gym! 🏋️‍♂️
      </p>
    </div>
  `)
});

// ── 2. Membership Expiry Warning ──────────────────────────────────────────────
const expiryWarningEmail = (member, daysLeft) => ({
  from: FROM,
  to: member.email,
  subject: `⚠️ Membership Expiring in ${daysLeft} Day${daysLeft !== 1 ? "s" : ""} — GymPro`,
  html: wrap(`
    <div style="background:#fef3c7;padding:16px 40px;border-left:4px solid #f59e0b;text-align:center">
      <p style="color:#92400e;font-weight:700;margin:0;font-size:15px">
        ⏰ Your membership expires in <strong>${daysLeft} day${daysLeft !== 1 ? "s" : ""}</strong>
      </p>
    </div>

    <div style="padding:36px 40px">
      <h2 style="color:#111;margin:0 0 10px;font-size:22px">Hi ${member.full_name},</h2>
      <p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 24px">
        Your GymPro membership is expiring soon. Renew now to ensure uninterrupted access to all gym facilities and continue your fitness journey!
      </p>

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px 24px;margin-bottom:28px">
        <h3 style="color:#111;margin:0 0 14px;font-size:12px;text-transform:uppercase;letter-spacing:1.5px">Current Plan Details</h3>
        <table style="width:100%;border-collapse:collapse">
          ${tableRow("Plan", `<span style="text-transform:capitalize">${member.membership_type}</span>`)}
          ${tableRow("Expiry Date", `<span style="color:#e53e3e;font-weight:700">${fmtDate(member.membership_end)}</span>`)}
          ${tableRow("Days Remaining", `<span style="color:#e53e3e;font-weight:700;font-size:16px">${daysLeft} day${daysLeft !== 1 ? "s" : ""}</span>`)}
        </table>
      </div>

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 18px;margin-bottom:28px">
        <p style="color:#991b1b;font-size:13px;margin:0">
          ⚠️ After expiry, your gym access will be suspended until renewal.
        </p>
      </div>

      <p style="color:#888;font-size:13px;">
        Visit the gym or contact us to renew your membership. Keep your fitness momentum going! 💪
      </p>
    </div>
  `)
});

// ── 3. Payment Receipt ────────────────────────────────────────────────────────
const paymentReceiptEmail = (member, payment) => {
  const isDue = parseFloat(payment.due_amount || 0) > 0;
  return {
    from: FROM,
    to: member.email,
    subject: `✅ Payment Receipt — ${fmtAmount(payment.amount)} | GymPro #PAY-${String(payment.id).padStart(5, "0")}`,
    html: wrap(`
      <div style="background:${isDue ? "#fef3c7" : "#d1fae5"};padding:16px 40px;text-align:center;border-left:4px solid ${isDue ? "#f59e0b" : "#10b981"}">
        <p style="color:${isDue ? "#92400e" : "#065f46"};font-weight:700;margin:0;font-size:15px">
          ${isDue
            ? `⏳ Partial payment of ${fmtAmount(payment.paid_amount)} received. Due: ${fmtAmount(payment.due_amount)}`
            : `✅ Payment of ${fmtAmount(payment.amount)} received successfully!`
          }
        </p>
      </div>

      <div style="padding:36px 40px">
        <h2 style="color:#111;margin:0 0 10px;font-size:22px">Hi ${member.full_name},</h2>
        <p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 24px">
          Thank you for your payment! Here is your official receipt for reference. Please keep this email as payment proof.
        </p>

        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px 24px;margin-bottom:24px">
          <h3 style="color:#111;margin:0 0 14px;font-size:12px;text-transform:uppercase;letter-spacing:1.5px">Receipt Details</h3>
          <table style="width:100%;border-collapse:collapse">
            ${tableRow("Receipt No.", `<strong>#PAY-${String(payment.id).padStart(5, "0")}</strong>`)}
            ${tableRow("Member", member.full_name)}
            ${tableRow("Payment Date", fmtDate(payment.payment_date))}
            ${tableRow("Payment For", `<span style="text-transform:capitalize">${(payment.payment_for || "monthly").replace("_", " ")}</span>`)}
            ${tableRow("Method", `<span style="text-transform:capitalize">${(payment.payment_method || "cash").replace("_", " ")}</span>`)}
            ${tableRow("Months Covered", `${payment.months_covered || 1} month(s)`)}
            ${payment.plan_name ? tableRow("Plan", `<span style="text-transform:capitalize">${payment.plan_name}</span>`) : ""}
            ${isDue ? tableRow("Paid Amount", fmtAmount(payment.paid_amount)) : ""}
            ${isDue ? tableRow("Due Amount", `<span style="color:#e53e3e;font-weight:700">${fmtAmount(payment.due_amount)}</span>`) : ""}
          </table>

          <div style="margin-top:16px;padding-top:16px;border-top:2px solid #111;display:flex;justify-content:space-between">
            <span style="font-size:15px;font-weight:700;color:#111">Total Amount</span>
            <span style="font-size:20px;font-weight:800;color:${isDue ? "#f59e0b" : "#10b981"}">${fmtAmount(payment.amount)}</span>
          </div>
        </div>

        ${payment.notes ? `
        <div style="background:#f9fafb;border-radius:8px;padding:14px 18px;margin-bottom:16px">
          <p style="color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 4px">Note</p>
          <p style="color:#555;font-size:13px;margin:0;font-style:italic">${payment.notes}</p>
        </div>` : ""}

        <p style="color:#888;font-size:13px;">Thank you for choosing GymPro. See you at the gym! 🏋️</p>
      </div>
    `)
  };
};

// ── 4. Inquiry Alert to Admin ─────────────────────────────────────────────────
const inquiryAlertEmail = (inquiry) => ({
  from: FROM,
  to: process.env.ADMIN_EMAIL,
  subject: `📩 New Inquiry: ${inquiry.full_name} — GymPro Admin Alert`,
  html: wrap(`
    <div style="background:#ede9fe;padding:16px 40px;border-left:4px solid #7c3aed">
      <p style="color:#4c1d95;font-weight:700;margin:0;font-size:15px">
        📩 New inquiry received — please follow up!
      </p>
    </div>

    <div style="padding:36px 40px">
      <h2 style="color:#111;margin:0 0 10px;font-size:22px">New Inquiry Alert</h2>
      <p style="color:#555;font-size:14px;line-height:1.7;margin:0 0 24px">
        A potential member has submitted an inquiry through the GymPro inquiry form. Please review and follow up at the earliest.
      </p>

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px 24px;margin-bottom:24px">
        <h3 style="color:#111;margin:0 0 14px;font-size:12px;text-transform:uppercase;letter-spacing:1.5px">Inquiry Details</h3>
        <table style="width:100%;border-collapse:collapse">
          ${tableRow("Name", `<strong>${inquiry.full_name}</strong>`)}
          ${tableRow("Email", inquiry.email || "—")}
          ${tableRow("Phone", `<strong>${inquiry.phone}</strong>`)}
          ${tableRow("Interest", `<span style="text-transform:capitalize">${(inquiry.membership_interest || inquiry.interest || "—").replace("_", " ")}</span>`)}
          ${tableRow("Preferred Time", `<span style="text-transform:capitalize">${(inquiry.preferred_time || "anytime").replace("_", " ")}</span>`)}
          ${tableRow("Received At", new Date().toLocaleString("en-IN"))}
        </table>

        ${inquiry.message ? `
        <div style="margin-top:16px;padding:14px;background:#f0f0ff;border-radius:8px;border-left:3px solid #7c3aed">
          <p style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px">Message from ${inquiry.full_name}</p>
          <p style="color:#333;font-size:13px;margin:0;line-height:1.7;font-style:italic">"${inquiry.message}"</p>
        </div>` : ""}
      </div>

      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px">
        <p style="color:#92400e;font-size:13px;margin:0">
          ⚡ <strong>Action Required:</strong> Login to GymPro admin panel → Inquiries section to update the status and add notes.
        </p>
      </div>
    </div>
  `)
});

module.exports = { welcomeEmail, expiryWarningEmail, paymentReceiptEmail, inquiryAlertEmail };