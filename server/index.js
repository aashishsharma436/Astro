import "dotenv/config";
import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";

const app = express();
const port = Number(process.env.PORT || 4000);
const consultantEmail = process.env.CONSULTANT_EMAIL || "iaastrophilee@gmail.com";

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error("Origin not allowed"));
  }
}));
app.use(express.json({ limit: "50kb" }));

function createTransporter() {
  const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing email configuration: ${missing.join(", ")}`);
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "astro-consultancy-api" });
});

app.post("/api/bookings", async (req, res) => {
  const { name, phone, email, service, dateTime, birthDetails, question } = req.body || {};

  if (!name || !phone || !email || !service || !dateTime) {
    return res.status(400).json({
      message: "Name, phone, email, service and appointment time are required."
    });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return res.status(400).json({ message: "Please enter a valid email address." });
  }

  try {
    const transporter = createTransporter();

    const details = [
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
      `Service: ${service}`,
      `Appointment: ${dateTime}`,
      `Birth details: ${birthDetails || "Not provided"}`,
      `Question: ${question || "Not provided"}`
    ].join("\n");

    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: consultantEmail,
      replyTo: email,
      subject: `New astrology consultation booking — ${name}`,
      text: `A new consultation request was received.\n\n${details}`
    });

    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: email,
      subject: "Astro Consultancy — booking request received",
      text: `Hi ${name},\n\nThank you for requesting an astrology consultation. We have received your booking request.\n\nService: ${service}\nRequested time: ${dateTime}\n\nThe consultation details will be confirmed separately.\n\nAstro Consultancy`
    });

    return res.status(201).json({
      ok: true,
      message: "Booking request sent. A confirmation email has been sent to you."
    });
  } catch (error) {
    console.error("Booking email failed:", error);
    return res.status(500).json({
      message: "We could not send the booking email. Please try again later."
    });
  }
});

app.listen(port, () => {
  console.log(`Astro Consultancy API listening on port ${port}`);
});