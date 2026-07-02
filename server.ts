import express from "express";
import cors from "cors";
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
  app.use(cors());
  app.set("trust proxy", 1); // Trust first-hop proxy for client IP detection
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // Helper function to generate Google Calendar links
  const getGoogleCalendarUrl = (dateStr: string, timeStr: string, serviceTitle: string) => {
    try {
      console.log(`DEBUG: Building calendar link. Date: ${dateStr}, Time: ${timeStr}, Service: ${serviceTitle}`);
      const ymd = dateStr.replace(/-/g, ""); // "20260527"
      
      const parts = timeStr.split("-").map(p => p.trim());
      const startTimeStr = parts[0];
      const endTimeStr = parts[1] || null;
      console.log(`DEBUG: Time parts: ${JSON.stringify(parts)}`);

      const parseTime = (str: string) => {
        const cleanStr = str.trim().toUpperCase();
        // Try HH:MM AM/PM or HH:MM
        let match = cleanStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
        
        if (!match) {
           // Maybe it's missing the space?
           match = cleanStr.match(/^(\d{1,2}):(\d{2})(AM|PM)?$/);
        }
        
        if (!match) {
           console.log(`DEBUG: Failed to parse time: ${str}`);
           return null;
        }
        let hours = Number(match[1]);
        const minutes = Number(match[2]);
        const ampm = match[3] || null;
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
      
      const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startField}%2F${endField}&details=${details}&location=${location}&ctz=Europe/London`;
      console.log(`DEBUG: Generated URL: ${url}`);
      return url;
    } catch (err) {
      console.error("Error building Google Calendar URL:", err);
      return null;
    }
  };

  // Create and pool transporter once, but rebuild if environment variables change
  let cachedConfigStr = "";
  let transporterInstance: any = null;
  const getTransporter = () => {
    let host = process.env.SMTP_HOST || "";
    const port = parseInt(process.env.SMTP_PORT || "587");
    const user = process.env.SMTP_USER || process.env.SMTP_USERNAME || "";
    const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD || "";

    if (!host && user.includes("@gmail.com")) {
      host = "smtp.gmail.com";
    }

    const currentConfigStr = `${host}:${port}:${user}:${pass}`;

    if (transporterInstance && cachedConfigStr === currentConfigStr) {
      return transporterInstance;
    }

    if (!user || !pass || !host) {
      return null;
    }

    cachedConfigStr = currentConfigStr;
    transporterInstance = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: false // Often needed for STARTTLS on port 587 in some environments
      },
      connectionTimeout: 10000 // 10 second timeout to prevent silent hanging
    });

    return transporterInstance;
  };

  // Modern unified sending helper supporting SMTP, Brevo, and Resend APIs
  const sendMailViaService = async (options: {
    from: string;
    to: string;
    replyTo?: string;
    subject: string;
    text: string;
    html: string;
  }) => {
    const errors: string[] = [];
    const brevoKey = process.env.BREVO_API_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    const smtpUser = process.env.SMTP_USER || process.env.SMTP_USERNAME;
    const smtpPass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;

    // Helper to parse "From Name <email@domain.com>"
    const parseAddress = (address: string) => {
      const match = address.match(/^(?:["']?([^"']*)["']?\s)?<?([^>]*)>?$/);
      if (match) {
        return { name: match[1]?.trim() || "", email: match[2]?.trim() || address };
      }
      return { name: "", email: address };
    };

    const fromObj = parseAddress(options.from);

    const hasAnyConfig = (brevoKey && brevoKey.trim() !== "" && !brevoKey.startsWith("YOUR_")) ||
                         (resendKey && resendKey.trim() !== "") ||
                         (smtpUser && smtpPass && smtpPass.trim() !== "");

    if (!hasAnyConfig) {
      console.log("=========================================");
      console.log("📧 [EMAIL SIMULATION FALLBACK] (No active credentials configured in environment)");
      console.log(`FROM:    ${options.from}`);
      console.log(`TO:      ${options.to}`);
      console.log(`SUBJECT: ${options.subject}`);
      console.log("-----------------------------------------");
      console.log(`HTML CONTENT PREVIEW:\n${options.html.replace(/<[^>]*>/g, '').substring(0, 300)}...`);
      console.log("=========================================");
      return { success: true, service: "Email Simulation Fallback" };
    }

    // 1. BREVO API (Preferred for high deliverability)
    if (brevoKey && brevoKey.trim() !== "" && !brevoKey.startsWith("YOUR_") && brevoKey !== "undefined") {
      try {
        console.log("Attempting to send email via Brevo HTTP API...");
        // Use verified single sender email from env if present
        const bSenderEmail = process.env.BREVO_SENDER_EMAIL || process.env.SENDER_EMAIL || fromObj.email || "info@oneearth.eco";
        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "accept": "application/json",
            "api-key": brevoKey,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            sender: { name: fromObj.name || "One Earth", email: bSenderEmail },
            to: [{ email: options.to }],
            replyTo: options.replyTo ? { email: options.replyTo } : undefined,
            subject: options.subject,
            textContent: options.text,
            htmlContent: options.html
          })
        });

        if (response.ok) {
          console.log("Email sent successfully via Brevo!");
          return { success: true, service: "Brevo API" };
        } else {
          const errText = await response.text();
          console.warn("Brevo API error:", response.status, errText);
          errors.push(`Brevo: ${response.status} - ${errText}`);
        }
      } catch (err: any) {
        console.warn("Brevo fetch thrown exception:", err.message);
        errors.push(`Brevo Exception: ${err.message}`);
      }
    }

    // 2. RESEND API (Disabled as per user request)
    /*
    if (resendKey && resendKey.trim() !== "" && !resendKey.startsWith("YOUR_") && resendKey !== "undefined") {
      try {
        console.log("Attempting to send email via Resend API...");
        const rSenderEmail = process.env.RESEND_SENDER_EMAIL || process.env.SENDER_EMAIL || fromObj.email || "info@oneearth.eco";
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: `${fromObj.name || "One Earth"} <${rSenderEmail}>`,
            to: [options.to],
            reply_to: options.replyTo,
            subject: options.subject,
            text: options.text,
            html: options.html
          })
        });

        if (response.ok) {
          console.log("Email sent successfully via Resend!");
          return { success: true, service: "Resend API" };
        } else {
          const errText = await response.text();
          console.warn("Resend API error:", response.status, errText);
          errors.push(`Resend: ${response.status} - ${errText}`);
        }
      } catch (err: any) {
        console.warn("Resend fetch thrown exception:", err.message);
        errors.push(`Resend Exception: ${err.message}`);
      }
    }
    */

    // 3. SMTP NODEMAILER
    const transporter = getTransporter();
    const user = smtpUser;
    if (transporter && user && smtpPass && smtpPass.trim() !== "") {
      try {
        console.log("Sending email via SMTP direct connection...");
        await transporter.sendMail({
          from: options.from,
          to: options.to,
          replyTo: options.replyTo,
          subject: options.subject,
          text: options.text,
          html: options.html
        });
        return { success: true, service: "Direct SMTP Server" };
      } catch (err: any) {
        console.warn("SMTP attempt with custom FROM failed. Retrying with raw envelope...", err.message);
        try {
          await transporter.sendMail({
            from: user, // force authenticated account as sender envelope
            to: options.to,
            replyTo: options.replyTo,
            subject: options.subject,
            text: options.text,
            html: options.html
          });
          return { success: true, service: "Direct SMTP Server (envelope fallback)" };
        } catch (retryErr: any) {
          console.error("SMTP fallback send failed:", retryErr);
          errors.push(`SMTP Fail: ${err.message} | SMTP Fallback Fail: ${retryErr.message}`);
        }
      }
    } else {
      errors.push("SMTP service not configured (missing host, user, or pass).");
    }

    // If we reached here, all configured services failed, but we want to log the details beautifully
    console.error("All email delivery methods failed. Falling back to log print:", errors.join(" || "));
    console.log("=========================================");
    console.log("📧 [FAILOVER LOG PRINT]");
    console.log(`TO:      ${options.to}`);
    console.log(`SUBJECT: ${options.subject}`);
    console.log("=========================================");
    
    throw new Error(`Email delivery failed! Tried: [${errors.join(" | ")}]`);
  };

  // API Route for sending emails
  app.post("/api/send-email-v2", async (req, res) => {
    console.log("Received POST to /api/send-email-v2");
    console.log("Body:", JSON.stringify(req.body));
    const { business_name, user_email, phone, subject, message, to_email, website_verify, eventDate, eventTime, eventService } = req.body;

    // Honeypot check: If the hidden field is filled, it's likely a bot
    if (website_verify) {
      console.warn("Honeypot triggered. Blocking request.");
      return res.status(200).json({ success: true, note: "Bot detected" });
    }

    const user = process.env.SMTP_USER || process.env.SMTP_USERNAME || "info@oneearth.eco";
    const brevoKey = process.env.BREVO_API_KEY;
    const resendKey = process.env.RESEND_API_KEY;
    const smtpPass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;

    const hasAnyConfig = (brevoKey && brevoKey.trim() !== "" && !brevoKey.startsWith("YOUR_")) ||
                         (resendKey && resendKey.trim() !== "") ||
                         (user && smtpPass && smtpPass.trim() !== "");

    // Generates a robust calendar link
    let calendarLinkHtml = "";
    let calendarLinkText = "";
    if (eventDate && eventTime) {
      console.log(`DEBUG: Attempting to generate calendar link for ${eventDate} at ${eventTime}`);
      const title = eventService || "Free Consultation";
      const gcalUrl = getGoogleCalendarUrl(eventDate, eventTime, title);
      console.log(`DEBUG: GCal URL: ${gcalUrl}`);
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
    } else {
      console.log(`DEBUG: Skipping calendar link generation. eventDate: ${eventDate}, eventTime: ${eventTime}`);
    }

    // Execute concurrently using Promise.allSettled so that a failure in one email (e.g. admin inbox down)
    // never stalls/cancels the delivery of the other email (e.g. client auto-confirmation with calendar link)
    console.log("Dispatching admin inquiry and customer automated confirmation...");
    
    const adminEmailPayload = {
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
        ${calendarLinkHtml ? `<hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 25px 0;"> ${calendarLinkHtml}` : ""}
      `,
    };

    const customerEmailPayload = {
      from: `"One Earth Limited" <${user}>`,
      to: user_email,
      subject: "We've received your inquiry - One Earth Limited",
      text: `Thank you for reaching out!\n\nHi ${business_name},\n\nWe've received your inquiry regarding "${subject}".\nYour phone number on file: ${phone || "N/A"}\n\nWe aim to get back to you within 24 hours.\n\n"Because we all share one planet — and every action counts."\n\nBest regards,\nThe One Earth Team\n${calendarLinkText}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e5e7eb; border-radius: 20px;">
          <h2 style="color: #2d3436; font-size: 24px; font-weight: bold; margin-bottom: 20px; font-family: sans-serif;">Thank you for reaching out!</h2>
          <p style="font-size: 15px; color: #2d3436;">Hi ${business_name},</p>
          <p style="font-size: 15px; color: #333333; line-height: 1.5; margin-bottom: 20px;">We've received your inquiry regarding <strong>"${subject}"</strong> and our team is currently reviewing your message.</p>
          <p style="font-size: 15px; color: #333333; line-height: 1.5; margin-bottom: 20px;">Your phone number on file: <strong>${phone || "N/A"}</strong></p>
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
    };

    const results = await Promise.allSettled([
      sendMailViaService(adminEmailPayload),
      sendMailViaService(customerEmailPayload)
    ]);

    const adminResult = results[0];
    const customerResult = results[1];

    let adminSucceeded = adminResult.status === "fulfilled";
    let customerSucceeded = customerResult.status === "fulfilled";
    let adminError = adminResult.status === "rejected" ? adminResult.reason?.message : "";
    let customerError = customerResult.status === "rejected" ? customerResult.reason?.message : "";

    console.log(`Email results -> Admin Sent: ${adminSucceeded}, Customer Sent: ${customerSucceeded}`);

    if (adminSucceeded || customerSucceeded || !hasAnyConfig) {
      // If at least one email succeeded, we count the overall transaction as successful.
      // If no config, simulation succeeded anyway.
      return res.status(200).json({
        success: true,
        simulation: !hasAnyConfig,
        adminSucceeded,
        customerSucceeded,
        adminError: adminError || undefined,
        customerError: customerError || undefined
      });
    }

    // Both failed with real configuration credentials
    res.status(500).json({
      error: `Both emails failed to dispatch. Admin Error: ${adminError} | Customer Error: ${customerError}`
    });
  });

  // Contact & Delivery Configuration Diagnostic Endpoint
  app.get("/api/test-email-config", async (req, res) => {
    const host = process.env.SMTP_HOST || "mail.privateemail.com";
    const port = parseInt(process.env.SMTP_PORT || "587");
    const user = process.env.SMTP_USER || process.env.SMTP_USERNAME;
    const pass = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
    const brevoKey = process.env.BREVO_API_KEY;
    const resendKey = process.env.RESEND_API_KEY;

    const errors: string[] = [];

    const isValidKey = (key: string | undefined): boolean => {
      if (!key) return false;
      const k = key.trim();
      return k !== "" && !k.startsWith("YOUR_") && !k.startsWith("MY_") && k !== "undefined";
    };

    // 1. Try Brevo Diagnostic if configured (Preempts Resend, matching sending precedence)
    if (isValidKey(brevoKey)) {
      try {
        console.log("Testing Brevo Key...");
        const response = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "accept": "application/json",
            "api-key": brevoKey!,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            sender: { name: "One Earth Admin", email: "info@oneearth.eco" },
            to: [{ email: "info@oneearth.eco" }],
            subject: "Brevo Diagnostic Connection Test",
            textContent: "Checking service availability over HTTPS API."
          })
        });

        if (response.status === 401 || response.status === 403) {
          errors.push(`Brevo Diagnostic: Authentication failed (Status ${response.status}). Key may be invalid.`);
        } else if (!response.ok) {
          const errText = await response.text();
          errors.push(`Brevo Diagnostic: API error (Status ${response.status}): ${errText}`);
        } else {
          return res.status(200).json({
            success: true,
            message: "Brevo HTTP API verified successfully over Port 443! Mail delivery is active and online.",
            config: { host: "api.brevo.com", port: 443, user: "Brevo API Key", hasPassword: true }
          });
        }
      } catch (err: any) {
        errors.push(`Brevo Diagnostic: Connection failed: ${err.message}`);
      }
    }

    // 2. Try Resend Diagnostic if configured
    if (isValidKey(resendKey)) {
      try {
        console.log("Testing Resend Key...");
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: `One Earth Diagnostics <onboarding@resend.dev>`,
            to: ["info@oneearth.eco"],
            subject: "Resend Diagnostic Test Connection",
            text: "Testing API access connection."
          })
        });

        if (response.status === 401 || response.status === 403) {
          errors.push(`Resend Diagnostic: Authentication failed (Status ${response.status}). Key may be invalid or restricted.`);
        } else if (!response.ok) {
          const errText = await response.text();
          errors.push(`Resend Diagnostic: API error (Status ${response.status}): ${errText}`);
        } else {
          return res.status(200).json({
            success: true,
            message: "Resend HTTP API key verified successfully! Port 443 HTTPS routing is active and mail delivery is online.",
            config: { host: "api.resend.com", port: 443, user: "Resend API Key", hasPassword: true }
          });
        }
      } catch (err: any) {
        errors.push(`Resend Diagnostic: Connection failed: ${err.message}`);
      }
    }

    // 3. Fallback to direct SMTP diagnostics if credentials are configured
    const hasSmtpUser = user && user.trim() !== "";
    const hasSmtpPass = pass && pass.trim() !== "";

    if (hasSmtpUser && hasSmtpPass) {
      try {
        console.log("Testing SMTP connection & credentials...");
        const testTransporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
          tls: { rejectUnauthorized: false },
          connectionTimeout: 10000
        });

        await testTransporter.verify();
        
        console.log("SMTP connection verified! Initiating dynamic test email dispatch...");
        
        try {
          await testTransporter.sendMail({
            from: `"One Earth Diagnostics" <${user}>`,
            to: user,
            subject: "One Earth SMTP Diagnostic Connection Test",
            text: `SMTP Configuration is healthy!\nHost: ${host}\nPort: ${port}\nUser: ${user}\n\nConnection and mail dispatch verified successfully at ${new Date().toISOString()}.`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #788c78; border-radius: 12px;">
                <h2 style="color: #4CAF50;">✅ SMTP Diagnostic Success</h2>
                <p>Hello,</p>
                <p>This is an automated connection test confirming your SMTP server dispatch is fully functional!</p>
                <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
                  <tr style="background: #f9f9f9;"><td style="padding: 8px; font-weight: bold;">SMTP Host</td><td style="padding: 8px;">${host}</td></tr>
                  <tr><td style="padding: 8px; font-weight: bold;">SMTP Port</td><td style="padding: 8px;">${port}</td></tr>
                  <tr style="background: #f9f9f9;"><td style="padding: 8px; font-weight: bold;">SMTP User</td><td style="padding: 8px;">${user}</td></tr>
                  <tr><td style="padding: 8px; font-weight: bold;">Timestamp</td><td style="padding: 8px;">${new Date().toISOString()}</td></tr>
                </table>
                <p>Mail is actively sending and fully functional.</p>
              </div>
            `
          });

          return res.status(200).json({
            success: true,
            message: "SMTP verified and test email dispatched successfully! Your credentials and mail delivery are 100% active and healthy.",
            config: { host, port, user, hasPassword: true }
          });
        } catch (sendErr: any) {
          console.error("SMTP verification succeeded, but mail send failed:", sendErr);
          errors.push(`SMTP authenticated successfully, but test email delivery failed. Reason: ${sendErr.message || "Unknown write error"} (Code: ${sendErr.code || "N/A"})`);
        }
      } catch (err: any) {
        errors.push(`SMTP Diagnostic (Host: ${host}:${port}) failed connection/auth check. Code: ${err.code || "N/A"}. Reason: ${err.message || "Unknown error"}`);
      }
    }

    // compile and return failures if we reach this point
    if (errors.length > 0) {
      return res.status(500).json({
        success: false,
        error: errors.join(" | "),
        config: {
          host: isValidKey(brevoKey) ? "api.brevo.com" : (isValidKey(resendKey) ? "api.resend.com" : host),
          port: isValidKey(brevoKey) || isValidKey(resendKey) ? 443 : port,
          user: isValidKey(brevoKey) ? "Brevo API Integration" : (isValidKey(resendKey) ? "Resend API Integration" : user || "Not configured"),
          hasPassword: isValidKey(brevoKey) || isValidKey(resendKey) || !!pass
        }
      });
    }

    return res.status(400).json({
      success: false,
      error: "No email services configured. Ensure BREVO_API_KEY, RESEND_API_KEY, or SMTP_USER & SMTP_PASS are set in Settings.",
      config: { host, port, user: user || "None", hasPassword: !!pass }
    });
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
