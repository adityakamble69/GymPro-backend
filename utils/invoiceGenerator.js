const PDFDocument = require("pdfkit");

const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" }) : "—";
const fmtAmount = (n) => "Rs. " + Number(n || 0).toLocaleString("en-IN");

function generateInvoicePDF(member, payment) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const buffers = [];

      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      // ── Header ──────────────────────────────────────────────
      doc.rect(0, 0, doc.page.width, 90).fill("#111111");
      doc.fillColor("#ffffff").fontSize(22).font("Helvetica-Bold")
        .text("WORKOUT WORLD GYM", 50, 30);
      doc.fontSize(10).font("Helvetica").fillColor("#999999")
        .text("GYM MANAGEMENT SYSTEM", 50, 58);

      doc.fillColor("#ffffff").fontSize(14).font("Helvetica-Bold")
        .text("PAYMENT RECEIPT", 0, 35, { align: "right", width: doc.page.width - 50 });
      doc.fontSize(10).font("Helvetica").fillColor("#cccccc")
        .text(`#PAY-${String(payment.id).padStart(5, "0")}`, 0, 55, { align: "right", width: doc.page.width - 50 });

      doc.fillColor("#000000");
      let y = 120;

      // ── Member Info ─────────────────────────────────────────
      doc.fontSize(11).font("Helvetica-Bold").text("Billed To:", 50, y);
      y += 18;
      doc.font("Helvetica").fontSize(11).text(member.full_name, 50, y);
      y += 16;
      doc.fontSize(10).fillColor("#555555").text(member.email || "—", 50, y);
      y += 14;
      doc.text(member.phone || "—", 50, y);

      // ── Receipt Info (right side) ───────────────────────────
      doc.fillColor("#000000").fontSize(10).font("Helvetica-Bold")
        .text("Receipt Date:", 350, 120, { continued: true })
        .font("Helvetica").text("  " + fmtDate(payment.payment_date));
      doc.font("Helvetica-Bold")
        .text("Payment Method:", 350, 138, { continued: true })
        .font("Helvetica").text("  " + (payment.payment_method || "cash").replace("_", " ").toUpperCase());
      doc.font("Helvetica-Bold")
        .text("Status:", 350, 156, { continued: true })
        .font("Helvetica").fillColor(payment.due_amount > 0 ? "#f59e0b" : "#10b981")
        .text("  " + (payment.due_amount > 0 ? "PARTIAL" : "PAID"));

      doc.fillColor("#000000");
      y = 200;

      // ── Table Header ────────────────────────────────────────
      doc.rect(50, y, doc.page.width - 100, 28).fill("#111111");
      doc.fillColor("#ffffff").fontSize(10).font("Helvetica-Bold")
        .text("DESCRIPTION", 60, y + 9)
        .text("DETAILS", 280, y + 9)
        .text("AMOUNT", 0, y + 9, { align: "right", width: doc.page.width - 60 });

      y += 28;
      doc.fillColor("#000000");

      // ── Table Row ───────────────────────────────────────────
      const planLabel = payment.plan_name || (payment.payment_for || "monthly").replace("_", " ");
      doc.rect(50, y, doc.page.width - 100, 36).stroke("#e5e7eb");
      doc.fontSize(10).font("Helvetica")
        .text("Membership Payment", 60, y + 13)
        .fillColor("#555555").text(`${planLabel} · ${payment.months_covered || 1} month(s)`, 280, y + 13)
        .fillColor("#000000").font("Helvetica-Bold")
        .text(fmtAmount(payment.amount), 0, y + 13, { align: "right", width: doc.page.width - 60 });

      y += 50;

      // ── Totals ──────────────────────────────────────────────
      const totalsX = 350;
      doc.fontSize(10).font("Helvetica").fillColor("#555555")
        .text("Total Amount:", totalsX, y, { continued: false })
        .text(fmtAmount(payment.amount), 0, y, { align: "right", width: doc.page.width - 50 });
      y += 18;

      if (payment.due_amount > 0) {
        doc.fillColor("#10b981")
          .text("Paid Amount:", totalsX, y)
          .text(fmtAmount(payment.paid_amount), 0, y, { align: "right", width: doc.page.width - 50 });
        y += 18;
        doc.fillColor("#ef4444")
          .text("Due Amount:", totalsX, y)
          .text(fmtAmount(payment.due_amount), 0, y, { align: "right", width: doc.page.width - 50 });
        y += 18;
      }

      doc.moveTo(totalsX, y).lineTo(doc.page.width - 50, y).stroke("#111111");
      y += 10;

      doc.fillColor("#000000").fontSize(13).font("Helvetica-Bold")
        .text("Grand Total:", totalsX, y)
        .text(fmtAmount(payment.amount), 0, y, { align: "right", width: doc.page.width - 50 });

      // ── Footer ──────────────────────────────────────────────
      const footerY = doc.page.height - 100;
      doc.moveTo(50, footerY).lineTo(doc.page.width - 50, footerY).stroke("#e5e7eb");
      doc.fontSize(9).fillColor("#999999").font("Helvetica")
        .text("Thank you for choosing Workout World Gym!", 50, footerY + 16, { align: "center", width: doc.page.width - 100 })
        .text("This is a system-generated receipt and does not require a signature.", 50, footerY + 30, { align: "center", width: doc.page.width - 100 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = generateInvoicePDF;