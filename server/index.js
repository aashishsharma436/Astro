import "dotenv/config";
import express from "express";
import cors from "cors";
import { InfisicalSDK } from "@infisical/sdk";
import { google } from "googleapis";

const app = express();
const port = Number(process.env.PORT || 4000);
const consultantEmail = process.env.CONSULTANT_EMAIL || "iaastrophilee@gmail.com";

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",").map(origin => origin.trim()).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error("Origin not allowed"));
  }
}));
app.use(express.json({ limit: "50kb" }));

let gmailClient;
let gmailUser;

async function loadGmailConfig() {
  for (const name of ["INFISICAL_CLIENT_ID", "INFISICAL_CLIENT_SECRET", "INFISICAL_PROJECT_ID"]) {
    if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
  }

  const client = new InfisicalSDK({ siteUrl: process.env.INFISICAL_SITE_URL || "https://app.infisical.com" });
  console.log("Authenticating with Infisical...");

  await client.auth().universalAuth.login({
    clientId: process.env.INFISICAL_CLIENT_ID,
    clientSecret: process.env.INFISICAL_CLIENT_SECRET
  });

  console.log("Infisical authentication successful.");

  const result = await client.secrets().listSecrets({
    environment: process.env.INFISICAL_ENVIRONMENT || "prod",
    projectId: process.env.INFISICAL_PROJECT_ID,
    secretPath: process.env.INFISICAL_SECRET_PATH || "/astro-email",
    viewSecretValue: true,
    recursive: false
  });

  const values = Object.fromEntries(
    (result?.secrets || []).map(secret => [secret.secretKey || secret.key, secret.secretValue])
  );

  const missing = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]
    .filter(name => !values[name]);

  if (missing.length) throw new Error(`Missing Infisical secrets: ${missing.join(", ")}`);

  gmailUser = values.GMAIL_USER || consultantEmail;

  const auth = new google.auth.OAuth2(values.GOOGLE_CLIENT_ID, values.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: values.GOOGLE_REFRESH_TOKEN });

  gmailClient = google.gmail({ version: "v1", auth });

  const profile = await gmailClient.users.getProfile({ userId: "me" });
  if (profile.data.emailAddress?.toLowerCase() !== gmailUser.toLowerCase()) {
    throw new Error(`Gmail account mismatch. OAuth account is ${profile.data.emailAddress}, expected ${gmailUser}.`);
  }

  console.log(`Gmail API authenticated for ${gmailUser}.`);
}

function encodeMessage({ to, from, replyTo, subject, text }) {
  const headers = [
    `From: Astro Consultancy <${from}>`,
    `To: ${to}`,
    replyTo ? `Reply-To: ${replyTo}` : null,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8"
  ].filter(Boolean);

  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${text}`)
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sendGmail({ to, replyTo, subject, text }) {
  if (!gmailClient || !gmailUser) throw new Error("Gmail API is not configured.");

  return gmailClient.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodeMessage({ to, from: gmailUser, replyTo, subject, text })
    }
  });
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "astro-consultancy-api",
    emailConfigured: Boolean(gmailClient),
    emailProvider: "gmail-api"
  });
});

app.post("/api/bookings", async (req, res) => {
  const { name, phone, email, service, dateTime, birthDetails, question } = req.body || {};

  if (!name || !phone || !email || !service || !dateTime) {
    return res.status(400).json({ message: "Name, phone, email, service and appointment time are required." });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return res.status(400).json({ message: "Please enter a valid email address." });
  }

  try {
    if (!gmailClient) throw new Error("Gmail API is not configured.");

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

    await sendGmail({
      to: consultantEmail,
      replyTo: email,
      subject: `New astrology consultation booking — ${name}`,
      text: `A new consultation request was received.\n\n${details}`
    });

    await sendGmail({
      to: email,
      subject: "Astro Consultancy — booking request received",
      text: `Hi ${name},\n\nThank you for requesting an astrology consultation. We have received your booking request.\n\nService: ${service}\nRequested time: ${dateTime}\n\nThe consultation details will be confirmed separately.\n\nAstro Consultancy`
    });

    console.log(`Booking emails sent successfully for ${email}.`);
    return res.status(201).json({ ok: true, message: "Booking request sent. A confirmation email has been sent to you." });
  } catch (error) {
    console.error("Booking email failed:", error.message);
    return res.status(500).json({ message: "We could not send the booking email. Please try again later." });
  }
});

try {
  await loadGmailConfig();
  app.listen(port, () => console.log(`Astro Consultancy API listening on port ${port}`));
} catch (error) {
  console.error("Startup configuration failed:", error.message);
  process.exit(1);
}
