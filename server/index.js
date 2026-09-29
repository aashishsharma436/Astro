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

let smtpConfig;

async function loadSmtpConfig() {
  const required = [
    "INFISICAL_CLIENT_ID",
    "INFISICAL_CLIENT_SECRET",
    "INFISICAL_PROJECT_ID"
  ];

  for (const name of required) {
    if (!process.env[name]) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
  }

  const client = new InfisicalSDK({
    siteUrl: process.env.INFISICAL_SITE_URL || "https://app.infisical.com"
  });

  console.log("Authenticating with Infisical...");

  await client.auth().universalAuth.login({
    clientId: process.env.INFISICAL_CLIENT_ID,
    clientSecret: process.env.INFISICAL_CLIENT_SECRET
  });

  console.log("Infisical authentication successful.");

  const result = await client.secrets().listSecrets({
    environment: process.env.INFISICAL_ENVIRONMENT || "prod",
    projectId: process.env.INFISICAL_PROJECT_ID,
    secretPath: process.env.INFISICAL_SECRET_PATH || "/",
    viewSecretValue: true,
    recursive: false
  });

  const secrets = result?.secrets || [];

  const values = Object.fromEntries(
    secrets.map(secret => [secret.secretKey || secret.key, secret.secretValue])
  );

  const missing = ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS"]
    .filter(name => !values[name]);

  if (missing.length > 0) {
    throw new Error(`Missing Infisical secrets: ${missing.join(", ")}`);
  }

  smtpConfig = {
    host: values.SMTP_HOST,
    port: Number(values.SMTP_PORT),
    secure: String(values.SMTP_SECURE) === "true",
    auth: {
      user: values.SMTP_USER,
      pass: values.SMTP_PASS
    },
    from: process.env.MAIL_FROM || values.SMTP_USER
  };

  console.log("SMTP configuration loaded from Infisical.");
}

function createTransporter() {
  if (!smtpConfig) {
    throw new Error("SMTP configuration is not loaded.");
  }

  return nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: smtpConfig.auth,
    disableFileAccess: true,
    disableUrlAccess: true
  });
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "astro-consultancy-api",
    emailConfigured: Boolean(smtpConfig)
  });
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

    console.log(`Sending booking email for ${email}...`);

    await transporter.sendMail({
      from: smtpConfig.from,
      to: consultantEmail,
      replyTo: email,
      subject: `New astrology consultation booking — ${name}`,
      text: `A new consultation request was received.\n\n${details}`
    });

    await transporter.sendMail({
      from: smtpConfig.from,
      to: email,
      subject: "Astro Consultancy — booking request received",
      text: `Hi ${name},\n\nThank you for requesting an astrology consultation. We have received your booking request.\n\nService: ${service}\nRequested time: ${dateTime}\n\nThe consultation details will be confirmed separately.\n\nAstro Consultancy`
    });

    console.log(`Booking emails sent successfully for ${email}.`);

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

try {
  await loadSmtpConfig();
  app.listen(port, () => {
    console.log(`Astro Consultancy API listening on port ${port}`);
  });
} catch (error) {
  console.error("Startup configuration failed:", error.message);
  process.exit(1);
}
