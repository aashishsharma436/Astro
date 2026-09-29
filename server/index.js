import "dotenv/config";
import express from "express";
import cors from "cors";
import { InfisicalSDK } from "@infisical/sdk";

const app = express();
const port = Number(process.env.PORT || 4000);
const consultantEmail = process.env.CONSULTANT_EMAIL || "iaastrophilee@gmail.com";

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error("Origin not allowed"));
  }
}));
app.use(express.json({ limit: "50kb" }));

let mailGateway;

async function loadMailGatewayConfig() {
  for (const name of ["INFISICAL_CLIENT_ID", "INFISICAL_CLIENT_SECRET", "INFISICAL_PROJECT_ID"]) {
    if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
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
    secretPath: process.env.INFISICAL_SECRET_PATH || "/astro-email",
    viewSecretValue: true,
    recursive: false
  });

  const values = Object.fromEntries(
    (result?.secrets || []).map(secret => [
      secret.secretKey || secret.key,
      secret.secretValue
    ])
  );

  const missing = ["GOOGLE_APPS_SCRIPT_URL", "GOOGLE_APPS_SCRIPT_TOKEN"]
    .filter(name => !values[name]);

  if (missing.length) {
    throw new Error(`Missing Infisical secrets: ${missing.join(", ")}`);
  }

  mailGateway = {
    url: values.GOOGLE_APPS_SCRIPT_URL,
    token: values.GOOGLE_APPS_SCRIPT_TOKEN
  };

  console.log("Google Apps Script mail gateway configured.");
}

async function sendBookingEmails(booking) {
  if (!mailGateway) throw new Error("Google Apps Script mail gateway is not configured.");

  const response = await fetch(mailGateway.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      token: mailGateway.token,
      action: "booking",
      consultantEmail,
      booking
    })
  });

  const text = await response.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Mail gateway returned HTTP ${response.status} with an invalid response.`);
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.message || `Mail gateway returned HTTP ${response.status}.`);
  }

  return data;
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "astro-consultancy-api",
    emailConfigured: Boolean(mailGateway),
    emailProvider: "google-apps-script-gmail"
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
    console.log(`Sending booking email for ${email}...`);

    await sendBookingEmails({
      name,
      phone,
      email,
      service,
      dateTime,
      birthDetails: birthDetails || "Not provided",
      question: question || "Not provided"
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
  await loadMailGatewayConfig();
  app.listen(port, () => console.log(`Astro Consultancy API listening on port ${port}`));
} catch (error) {
  console.error("Startup configuration failed:", error.message);
  process.exit(1);
}
