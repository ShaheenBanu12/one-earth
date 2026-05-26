import express from "express";
import nodemailer from "nodemailer";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { rateLimit } from "express-rate-limit";

dotenv.config();

// ESM and CommonJS compatible path resolution
const resolvedFilename = typeof __filename !== "undefined"
  ? __filename
  : (typeof import.meta !== "undefined" && import.meta.url ? fileURLToPath(import.meta.url) : "");
const resolvedDirname = typeof __dirname !== "undefined"
  ? __dirname
  : path.dirname(resolvedFilename);

// Rate limiter: Max 5 inquiries per hour per IP
const inquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { error: "Too many inquiries. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
});

async function startServer() {
  const app = express();
  app.set("trust proxy", 1); // Trust first-hop proxy for client IP detection
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // Helper function to generate Google Calendar links
  const getGoogleCalendarUrl = (dateStr: string, timeStr: string, serviceTitle: string) => {
    try {
      const ymd = dateStr.replace(/-/g, ""); // "20260527"
      
      const parts = timeStr.split("-").map(p => p.trim());
      const startTimeStr = parts[0];
      const endTimeStr = parts[1] || null;

      const parseTime = (str: string) => {
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

      const pad = (n: number) => String(n).padStart(2, "0");
      const startHM = `${pad(start.hours)}${pad(start.minutes)}00`;

      let endHM = "";
      if (endTimeStr) {
        const end = parseTime(endTimeStr);
        if (end) {
          endHM = `${pad(end.hours)}${pad(end.minutes)}00`;
        }
      }

      if (!endHM) {
        // Fallback to adding 30 minutes
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

  // Create and pool transporter once
  let transporterInstance: any = null;
  const getTransporter = () => {
    if (transporterInstance) return transporterInstance;

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || "587");
    const user = process.env.SMTP_USER || process.env.SMTP_USERNAME;
    const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;

    if (!user || !pass) {
      return null;
    }

    transporterInstance = nodemailer.createTransport({
      pool: true, // Enable TCP/SMTP connection pooling to reuse active connections
      maxConnections: 5,
      maxMessages: 100,
      host,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false // Often needed for STARTTLS on port 587 in some environments
      }
    });

    return transporterInstance;
  };

  // API Route for sending emails
  app.post("/api/send-email", inquiryLimiter, async (req, res) => {
    const { business_name, user_email, phone, subject, message, to_email, website_verify, eventDate, eventTime, eventService } = req.body;

    // Honeypot check: If the hidden field is filled, it's likely a bot
    if (website_verify) {
      console.warn("Honeypot triggered. Blocking request.");
      return res.status(200).json({ success: true, note: "Bot detected" }); // Pretend it worked
    }

    const transporter = getTransporter();
    const user = process.env.SMTP_USER || process.env.SMTP_USERNAME;

    if (!transporter || !user) {
      console.error("SMTP credentials missing in environment variables. Expected SMTP_USER/SMTP_USERNAME and SMTP_PASS/SMTP_PASSWORD.");
      return res.status(500).json({ error: "Server configuration error: SMTP credentials missing" });
    }

    // Generate Calendar link if relevant details are provided
    let calendarLinkHtml = "";
    let calendarLinkText = "";
    if (eventDate && eventTime) {
      const title = eventService || "Free Consultation";
      const gcalUrl = getGoogleCalendarUrl(eventDate, eventTime, title);
      if (gcalUrl) {
        calendarLinkText = `\nAdd to Google Calendar: ${gcalUrl}`;
        calendarLinkHtml = `
          <div style="margin: 25px 0;">
            <p style="margin-bottom: 8px; font-weight: bold; color: #2d3436; font-size: 14px;">Keep track on your schedule:</p>
            <a href="${gcalUrl}" target="_blank" style="display: inline-block; background-color: #34a853; color: white; padding: 12px 24px; font-weight: bold; font-family: sans-serif; text-decoration: none; border-radius: 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; box-shadow: 0 4px 6px rgba(52,168,83,0.2);">
              📅 Add to Google Calendar
            </a>
          </div>
        `;
      }
    }

    try {
      // 1. Send inquiry to One Earth admin (Awaited to confirm receipt)
      const adminMailPromise = transporter.sendMail({
        from: `"${business_name}" <${user}>`, // Use the authorized account as sender
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
          ${calendarLinkHtml ? `<hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 25px 0;"> ${calendarLinkHtml}` : ""}
        `,
      });

      // 2. Send automated receipt/acknowledgment to the customer (Dispatched asynchronously in the background)
      transporter.sendMail({
        from: `"One Earth Limited" <${user}>`,
        to: user_email,
        subject: "We've received your inquiry - One Earth Limited",
        text: `Thank you for reaching out!\n\nHi ${business_name},\n\nWe've received your inquiry regarding "${subject}" and our team is currently reviewing your message.\n\nWe aim to get back to you within 24 hours.\n\n"Because we all share one planet — and every action counts."\n\nBest regards,\nThe One Earth Team\n${calendarLinkText}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e5e7eb; border-radius: 20px;">
            <h2 style="color: #2d3436; font-size: 24px; font-weight: bold; margin-bottom: 20px; font-family: sans-serif;">Thank you for reaching out!</h2>
            <p style="font-size: 15px; color: #2d3436;">Hi ${business_name},</p>
            <p style="font-size: 15px; color: #333333; line-height: 1.5; margin-bottom: 20px;">We've received your inquiry regarding <strong>"${subject}"</strong> and our team is currently reviewing your message.</p>
            <p style="font-size: 15px; font-weight: bold; color: #2d3436; margin: 20px 0;">We aim to get back to you within 24 hours.</p>
            
            ${calendarLinkHtml}
            
            <div style="margin: 30px 0; padding: 20px; background-color: #f9fafb; border-radius: 12px; border-left: 4px solid #788c78;">
              <p style="margin: 0; font-style: italic; color: #4b5563; font-size: 14px;">"Because we all share one planet — and every action counts."</p>
            </div>
            
            <p style="font-size: 15px; color: #333333; line-height: 1.5; margin: 0;">Best regards,<br><strong>The One Earth Team</strong></p>
            <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 25px 0 20px 0;">
            <p style="font-size: 12px; color: #9ca3af; margin: 0;">One Earth Limited | Derby, United Kingdom</p>
          </div>
        `,
      }).catch((autoReplyErr: any) => {
        console.error("Auto-reply background send failed (handled):", autoReplyErr);
      });

      // Wait for primary inquiry transfer to complete
      await adminMailPromise;

      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ error: "Failed to send email" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
