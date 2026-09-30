import "dotenv/config";
import express from "express";
import cors from "cors";
import { InfisicalSDK } from "@infisical/sdk";

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

let gateway;

async function loadGatewayConfig() {
  for (const name of ["INFISICAL_CLIENT_ID", "INFISICAL_CLIENT_SECRET", "INFISICAL_PROJECT_ID"]) {
    if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
  }

  const client = new InfisicalSDK({ siteUrl: process.env.INFISICAL_SITE_URL || "https://app.infisical.com" });
  await client.auth().universalAuth.login({
    clientId: process.env.INFISICAL_CLIENT_ID,
    clientSecret: process.env.INFISICAL_CLIENT_SECRET
  });

  const result = await client.secrets().listSecrets({
    environment: process.env.INFISICAL_ENVIRONMENT || "prod",
    projectId: process.env.INFISICAL_PROJECT_ID,
    secretPath: process.env.INFISICAL_SECRET_PATH || "/astro-email",
    viewSecretValue: true,
    recursive: false
  });

  const values = Object.fromEntries((result?.secrets || []).map(secret => [
    secret.secretKey || secret.key, secret.secretValue
  ]));

  const missing = ["GOOGLE_APPS_SCRIPT_URL", "GOOGLE_APPS_SCRIPT_TOKEN"].filter(name => !values[name]);
  if (missing.length) throw new Error(`Missing Infisical secrets: ${missing.join(", ")}`);

  gateway = { url: values.GOOGLE_APPS_SCRIPT_URL, token: values.GOOGLE_APPS_SCRIPT_TOKEN };
}

async function callGateway(action, payload = {}) {
  if (!gateway) throw new Error("Google Apps Script gateway is not configured.");

  const response = await fetch(gateway.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: gateway.token, action, ...payload })
  });

  const text = await response.text();
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error(`Gateway returned HTTP ${response.status} with an invalid response.`); }

  if (!response.ok || !data.ok) {
    const error = new Error(data.message || `Gateway returned HTTP ${response.status}.`);
    error.code = data.code;
    throw error;
  }
  return data;
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "astro-consultancy-api",
    emailConfigured: Boolean(gateway),
    provider: "google-apps-script-gmail-calendar"
  });
});

app.get("/api/availability", async (req, res) => {
  const date = String(req.query.date || "");
  const duration = Number(req.query.duration);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(duration)) {
    return res.status(400).json({ message: "Date and duration are required." });
  }

  try {
    const data = await callGateway("availability", { date, duration });
    return res.json(data);
  } catch (error) {
    console.error("Availability failed:", error.message);
    return res.status(502).json({ message: "We could not load live availability. Please try again." });
  }
});

app.post("/api/settings/read", async (req, res) => {
  const adminToken = String(req.body?.adminToken || "");
  if (!adminToken) return res.status(400).json({ message: "Admin password is required." });

  try {
    return res.json(await callGateway("adminGetConfig", { adminToken }));
  } catch (error) {
    console.error("Settings read failed:", error.message);
    return res.status(401).json({ message: "Invalid admin password or settings unavailable." });
  }
});

app.post("/api/settings", async (req, res) => {
  const adminToken = String(req.body?.adminToken || "");
  const config = req.body?.config;

  if (!adminToken || !config) {
    return res.status(400).json({ message: "Admin password and configuration are required." });
  }

  try {
    return res.json(await callGateway("adminSaveConfig", { adminToken, config }));
  } catch (error) {
    console.error("Settings save failed:", error.message);
    return res.status(401).json({ message: error.message || "Could not save booking settings." });
  }
});

app.post("/api/bookings", async (req, res) => {
  const { name, phone, email, service, duration, dateTime, birthDetails, question } = req.body || {};

  if (!name || !phone || !email || !service || !duration || !dateTime) {
    return res.status(400).json({ message: "Name, phone, email, service, duration and appointment time are required." });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Please enter a valid email address." });
  }

  try {
    const normalizedDateTime = /[+-]\d{2}:\d{2}$/.test(dateTime)
      ? dateTime
      : `${dateTime}:00+05:30`;

    const data = await callGateway("booking", {
      consultantEmail,
      booking: {
        name, phone, email, service,
        duration: Number(duration),
        dateTime: normalizedDateTime,
        birthDetails: birthDetails || "Not provided",
        question: question || "Not provided"
      }
    });

    return res.status(201).json(data);
  } catch (error) {
    console.error("Booking failed:", error.message);

    if (error.code === "SLOT_UNAVAILABLE") {
      return res.status(409).json({
        code: "SLOT_UNAVAILABLE",
        message: "That slot was just booked. Please choose another available time."
      });
    }

    return res.status(500).json({ message: "We could not confirm the booking. Please try again later." });
  }
});

try {
  await loadGatewayConfig();
  app.listen(port, () => console.log(`Astro Consultancy API listening on port ${port}`));
} catch (error) {
  console.error("Startup configuration failed:", error.message);
  process.exit(1);
}
