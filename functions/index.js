const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const nodemailer = require("nodemailer");
const cors = require("cors");
const { rateLimit } = require("express-rate-limit");

const app = express();

// Automatically parse JSON and enable CORS (Firebase needs CORS often)
app.use(cors({ origin: true }));
app.use(express.json());
app.set("trust proxy", 1);

// Rate limiter: Max 5 inquiries per hour per IP
const inquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: "Too many inquiries. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});

// Helper function to generate Google Calendar links
const getGoogleCalendarUrl = (dateStr, timeStr, serviceTitle) => {
  try {
    const ymd = dateStr.replace(/-/g, ""); // "20260527"
    
    const parts = timeStr.split("-").map(p => p.trim());
    const startTimeStr = parts[0];
    const endTimeStr = parts[1] || null;

    const parseTime = (str) => {
      const match = str.match(/^(\d+):(\d+)\s+(AM|PM)$/i);
      if (!match) return null;
      let hours = Number(match[1]);
      const minutes = Number(match[2]);
      const ampm = match[3].toUpperCase();
      if (ampm === "PM" && hours < 12) hours += 12;
      if (ampm === "AM" && hours === 12) hours = 0;
      return { hours, minutes };
    };

    const start = parseTime(startTimeStr);
    if (!start) return null;

    const pad = (n) => String(n).padStart(2, "0");
    const startHM = `${pad(start.hours)}${pad(start.minutes)}00`;

    let endHM = "";
    if (endTimeStr) {
      const end = parseTime(endTimeStr);
      if (end) {
        endHM = `${pad(end.hours)}${pad(end.minutes)}00`;
      }
    }

    if (!endHM) {
      let endHours = start.hours;
      let endMinutes = start.minutes + 30;
      if (endMinutes >= 60) {
        endMinutes -= 60;
        endHours = (endHours + 1) % 24;
      }
      endHM = `${pad(endHours)}${pad(endMinutes)}00`;
    }

    const startField = `${ymd}T${startHM}`;
    const endField = `${ymd}T${endHM}`;
    
    const title = encodeURIComponent(`One Earth Sustainability - ${serviceTitle}`);
    const details = encodeURIComponent(`Thank you for booking a ${serviceTitle} with One Earth. We look forward to speaking with you!\n\nDate: ${dateStr}\nTime: ${timeStr} (Europe/London)\n\nBecause every action counts.`);
    const location = encodeURIComponent("Online (Google Meet link to be provided)");
    
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startField}%2F${endField}&details=${details}&location=${location}&ctz=Europe/London`;
  } catch (err) {
    console.error("Error building Google Calendar URL:", err);
    return null;
  }
};

let cachedConfigStr = "";
let transporterInstance = null;
const getTransporter = () => {
  const host = process.env.SMTP_HOST || "";
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER || process.env.SMTP_USERNAME || "";
  const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || "";

  const currentConfigStr = `${host}:${port}:${user}:${pass}`;

  if (transporterInstance && cachedConfigStr === currentConfigStr) {
    return transporterInstance;
  }

  if (!user || !pass) {
    return null;
  }

  cachedConfigStr = currentConfigStr;
  transporterInstance = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000
  });

  return transporterInstance;
};

const sendMailViaService = async (options) => {
  let brevoKey = process.env.BREVO_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  
  if (!brevoKey && resendKey && resendKey.startsWith("xkeysib-")) {
    brevoKey = resendKey;
  }
  
  const errors = [];

  const isValidKey = (key) => {
    if (!key) return false;
    const k = key.trim();
    return k !== "" && !k.startsWith("YOUR_") && !k.startsWith("MY_") && k !== "undefined";
  };

  // 1. Try Brevo HTTP API
  if (isValidKey(brevoKey)) {
    try {
      console.log("Sending email via Brevo HTTPS REST API (Port 443)...");
      const senderEmail = process.env.SMTP_USER || process.env.SMTP_USERNAME || "info@oneearth.eco";
      
      const nameMatch = options.from.match(/^"([^"]+)"/);
      const senderName = nameMatch ? nameMatch[1] : "One Earth Limited";

      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "api-key": brevoKey,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: options.to }],
          replyTo: options.replyTo ? { email: options.replyTo } : undefined,
          subject: options.subject,
          htmlContent: options.html,
          textContent: options.text
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Brevo API failed (${response.status}): ${errText}`);
      }
      return { success: true };
    } catch (err) {
      errors.push(`Brevo: ${err.message}`);
    }
  }

  // 2. Try Resend HTTP API
  if (isValidKey(resendKey)) {
    try {
      console.log("Sending email via Resend HTTPS REST API (Port 443)...");
      const fromEmail = process.env.SMTP_USER || process.env.SMTP_USERNAME || "info@oneearth.eco";
      const nameMatch = options.from.match(/^"([^"]+)"/);
      const senderName = nameMatch ? nameMatch[1] : "One Earth Limited";

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: `${senderName} <${fromEmail}>`,
          to: [options.to],
          reply_to: options.replyTo,
          subject: options.subject,
          html: options.html,
          text: options.text
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Resend API failed (${response.status}): ${errText}`);
      }
      return { success: true };
    } catch (err) {
      errors.push(`Resend: ${err.message}`);
    }
  }

  // 3. SMTP Fallback
  const transporter = getTransporter();
  const user = process.env.SMTP_USER || process.env.SMTP_USERNAME;
  if (transporter && user) {
    try {
      await transporter.sendMail({
        from: options.from,
        to: options.to,
        replyTo: options.replyTo,
        subject: options.subject,
        text: options.text,
        html: options.html
      });
      return { success: true };
    } catch (err) {
      try {
        await transporter.sendMail({
          from: user,
          to: options.to,
          replyTo: options.replyTo,
          subject: options.subject,
          text: options.text,
          html: options.html
        });
        return { success: true };
      } catch (retryErr) {
        errors.push(`SMTP: ${retryErr.message}`);
      }
    }
  } else {
    errors.push("SMTP service not configured.");
  }

  throw new Error(`All methods failed: [${errors.join(" | ")}]`);
};

app.post("/api/send-email", inquiryLimiter, async (req, res) => {
  const { business_name, user_email, phone, subject, message, to_email, website_verify, eventDate, eventTime, eventService } = req.body;

  if (website_verify) {
    return res.status(200).json({ success: true, note: "Bot detected" });
  }

  const user = process.env.SMTP_USER || process.env.SMTP_USERNAME || "info@oneearth.eco";

  let calendarLinkHtml = "";
  let calendarLinkText = "";
  if (eventDate && eventTime) {
    const title = eventService || "Free Consultation";
    const gcalUrl = getGoogleCalendarUrl(eventDate, eventTime, title);
    if (gcalUrl) {
      calendarLinkText = `\nAdd to Google Calendar: ${gcalUrl}`;
      calendarLinkHtml = `
        <div style="margin: 25px 0;">
          <a href="${gcalUrl}" target="_blank" style="display: inline-block; background-color: #34a853; color: white; padding: 12px 24px; font-weight: bold; font-family: sans-serif; text-decoration: none; border-radius: 8px; font-size: 13px;">
            📅 Add to Google Calendar
          </a>
        </div>
      `;
    }
  }

  try {
    // 1. Send inquiry to Admin
    try {
      await sendMailViaService({
        from: `"${business_name.replace(/"/g, "'")}" <${user}>`,
        to: to_email || user,
        replyTo: user_email,
        subject: `[Website Inquiry] ${subject}`,
        text: `From: ${business_name} (${user_email})\nPhone: ${phone || "N/A"}\n\nMessage:\n${message}${calendarLinkText}`,
        html: `
          <h3>New Website Inquiry</h3>
          <p><strong>Business:</strong> ${business_name}</p>
          <p><strong>Email:</strong> ${user_email}</p>
          <p><strong>Phone:</strong> ${phone || "N/A"}</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <p><strong>Message:</strong></p>
          <p>${message.replace(/\n/g, '<br>')}</p>
          ${calendarLinkHtml ? `<hr> ${calendarLinkHtml}` : ""}
        `,
      });
    } catch (adminMailErr) {
      console.error("Admin inquiry send failed:", adminMailErr);
      return res.status(500).json({ error: "Failed to deliver inquiry to admin: " + adminMailErr.message });
    }

    // 2. Send automated receipt
    try {
      await sendMailViaService({
        from: `"One Earth Limited" <${user}>`,
        to: user_email,
        subject: "We've received your inquiry - One Earth Limited",
        text: `Thank you for reaching out!\n\nHi ${business_name},\n\nWe've received your inquiry.\nYour phone number on file: ${phone || "N/A"}\n\nWe aim to get back to you within 24 hours.\n\n"Because we all share one planet — and every action counts."\n\nBest regards,\nThe One Earth Team\n${calendarLinkText}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e5e7eb; border-radius: 20px;">
            <h2 style="color: #2d3436; font-size: 24px;">Thank you for reaching out!</h2>
            <p style="font-size: 15px;">Hi ${business_name},</p>
            <p style="font-size: 15px; margin-bottom: 20px;">We've received your inquiry and our team is reviewing it.</p>
            <p style="font-size: 15px; margin-bottom: 20px;">Your phone number on file: <strong>${phone || "N/A"}</strong></p>
            <p style="font-size: 15px; font-weight: bold; margin: 20px 0;">We aim to get back to you within 24 hours.</p>
            ${calendarLinkHtml}
            <div style="margin: 30px 0; padding: 20px; background-color: #f9fafb; border-radius: 12px; border-left: 4px solid #788c78;">
              <p style="margin: 0; font-style: italic; color: #4b5563; font-size: 14px;">"Because we all share one planet — and every action counts."</p>
            </div>
            <p style="font-size: 15px; margin: 0;">Best regards,<br><strong>The One Earth Team</strong></p>
          </div>
        `,
      });
    } catch (autoReplyErr) {
      console.error("Auto-reply send failed:", autoReplyErr);
      return res.status(200).json({ success: true, note: "Admin inquiry sent, but auto-reply failed." });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error routing email dispatch:", error);
    res.status(500).json({ error: "Failed to send email: " + error.message });
  }
});

// Expose Express API as a single Cloud Function:
// The endpoint will be available at /api 
exports.api = onRequest(app);
