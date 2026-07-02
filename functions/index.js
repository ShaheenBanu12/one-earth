const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

let transporterInstance = null;

const getTransporter = () => {
    let host = process.env.SMTP_HOST || "";
    const port = parseInt(process.env.SMTP_PORT || "587");
    const user = process.env.SMTP_USER || process.env.SMTP_USERNAME || process.env.VITE_SMTP_USER || "";
    const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || process.env.VITE_SMTP_PASS || "";

    if (!host && user.includes("@gmail.com")) {
      host = "smtp.gmail.com";
    }

    if (transporterInstance) {
      return transporterInstance;
    }

    if (!user || !pass || !host) {
      return null;
    }

    transporterInstance = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 10000
    });

    return transporterInstance;
};

const sendMailViaService = async (options) => {
    const transporter = getTransporter();
    const user = process.env.SMTP_USER || process.env.SMTP_USERNAME || process.env.VITE_SMTP_USER;
    
    if (!transporter || !user) {
        throw new Error("SMTP service not configured (missing SMTP_USER or SMTP_PASS).");
    }

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
        // Fallback to sending from the authenticated user
        await transporter.sendMail({
            from: user,
            to: options.to,
            replyTo: options.replyTo,
            subject: options.subject,
            text: options.text,
            html: options.html
        });
        return { success: true };
    }
};

const handleInquiry = async (req, res) => {
    console.log("DEBUG: handleInquiry received request body:", JSON.stringify(req.body));
    const { business_name, user_email, phone, subject, message, to_email, website_verify, eventDate, eventTime, eventService } = req.body;

    if (website_verify) {
      console.warn("Honeypot triggered. Blocking request.");
      return res.status(200).json({ success: true, note: "Bot detected" });
    }

    const user = process.env.SMTP_USER || process.env.SMTP_USERNAME || process.env.VITE_SMTP_USER || "";
    
    if (!user) {
         return res.status(500).json({ error: "Email service is not configured. Missing SMTP credentials." });
    }

    let calendarLinkHtml = "";
    let calendarLinkText = "";
    if (eventDate && eventTime) {
      const title = eventService || "Free Consultation";
      const formatTime = (timeStr) => {
          const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
          if (!match) return null;
          let [_, h, m, ampm] = match;
          let hours = parseInt(h);
          if (ampm) {
              if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
              if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
          }
          return { hours, minutes: parseInt(m) };
      };
      
      const startTime = formatTime(eventTime);
      if (startTime) {
        const startDate = new Date(eventDate);
        startDate.setHours(startTime.hours, startTime.minutes, 0);
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
        
        const pad = (n) => (n < 10 ? '0' + n : n);
        const formatGCalDate = (d) => d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';

        const datesParam = `${formatGCalDate(startDate)}/${formatGCalDate(endDate)}`;
        const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${datesParam}`;
        console.log("DEBUG: gcalUrl generated:", gcalUrl);
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
      await sendMailViaService({
        from: `"${business_name.replace(/"/g, "'")}" <${user}>`,
        to: to_email || user,
        replyTo: user_email,
        subject: `[Website Inquiry] ${subject}`,
        text: `From: ${business_name} (${user_email})\nPhone: ${phone || "N/A"}\n\nMessage:\n${message}`,
        html: `
          <h3>New Website Inquiry</h3>
          <p><strong>Business:</strong> ${business_name}</p>
          <p><strong>Email:</strong> ${user_email}</p>
          <p><strong>Phone:</strong> ${phone || "N/A"}</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <p><strong>Message:</strong></p>
          <p>${message.replace(/\n/g, '<br>')}</p>
        `,
      });

      try {
        await sendMailViaService({
          from: `"One Earth" <${user}>`,
          to: user_email,
          subject: "We've received your inquiry - One Earth",
          text: `Thank you for reaching out!\n\nHi ${business_name},\n\nWe've received your inquiry.\nYour phone number on file: ${phone || "N/A"}\n\nWe aim to get back to you within 24 hours.\n\n"Because we all share one planet — and every action counts."\n\nBest regards,\nThe One Earth Team${calendarLinkText}`,
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
      }

      return res.status(200).json({ success: true, message: "Inquiry sent successfully" });
    } catch (error) {
      console.error("Endpoint error:", error);
      return res.status(500).json({ error: error.message || "Failed to process inquiry" });
    }
};

app.post("/api/send-email", handleInquiry);
app.post("/api/send-email-v2", handleInquiry);

// Using V1 HTTP functions
exports.api = functions.https.onRequest(app);
