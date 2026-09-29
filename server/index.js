import "dotenv/config";
import express from "express";
import cors from "cors";
import { InfisicalSDK } from "@infisical/sdk";
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

let infisicalClient;

function getInfisicalClient() {
  if (!infisicalClient) {
    if (!process.env.INFISICAL_CLIENT_ID || !process.env.INFISICAL_CLIENT_SECRET || !process.env.INFISICAL_PROJECT_ID) {
      throw new Error("Infisical configuration is missing.");
    }

    infisicalClient = new InfisicalSDK({
      siteUrl: process.env.INFISICAL_SITE_URL || "https://app.infisical.com"
    });
  }

  return infisicalClient;
}

async function getSecret(secretName) {
  const client = getInfisicalClient();

  await client.auth().universalAuth.login({
    clientId: process.env.INFISICAL_CLIENT_ID,
    clientSecret: process.env.INFISICAL_CLIENT_SECRET
  });

  const secret = await client.secrets().getSecret({
    environment: process.env.INFISICAL_ENVIRONMENT || "prod",
    projectId: process.env.INFISICAL_PROJECT_ID,
    secretName,
    secretPath: process.env.INFISICAL_SECRET_PATH || "/"
  });

  if (!secret?.secretValue) {
    throw new Error(`Infisical secret "${secretName}" was empty or unavailable.`);
  }

  return secret.secretValue;
}

async function createTransporter() {
  const smtpHost = await getSecret("SMTP_HOST");
  const smtpPort = await getSecret("SMTP_PORT");
  const smtpSecure = await getSecret("SMTP_SECURE");
  const smtpUser = await getSecret("SMTP_USER");
  const smtpPass = await getSecret("SMTP_PASS");
  const mailFrom = process.env.MAIL_FROM || smtpUser;

  return nodemailer.createTransport({
    host: smtpHost,
    port: Number(smtpPort),
    secure: String(smtpSecure) === "true",
    auth: {
      user: smtpUser,
      pass: smtpPass
    },
    disableFileAccess: true,
    disableUrlAccess: true
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
    const transporter = await createTransporter();

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
      from: process.env.MAIL_FROM || (await getSecret("SMTP_USER")),
      to: consultantEmail,
      replyTo: email,
      subject: `New astrology consultation booking — ${name}`,
      text: `A new consultation request was received.\n\n${details}`
    });

    await transporter.sendMail({
      from: process.env.MAIL_FROM || (await getSecret("SMTP_USER")),
      to: email,
      subject: "Astro Consultancy — booking request received",
      text: `Hi ${name},\n\nThank you for requesting an astrology consultation. We have received your booking request.\n\nService: ${service}\nRequested time: ${dateTime}\n\nThe consultation details will be confirmed separately.\n\nAstro Consultancy`
    });

    return res.status(201).json({
      ok: true,
      message: "Booking request sent. A confirmation email has been sent to you."
    });
  } catch (error) {
    console.error("Booking email failed:", error.message);
    return res.status(500).json({
      message: "We could not send the booking email. Please try again later."
    });
  }
});

app.listen(port, () => {
  console.log(`Astro Consultancy API listening on port ${port}`);
});