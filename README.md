# Astro Consultancy Website

A responsive React/Vite astrology consultancy website with a Node.js booking API.

## Secure booking email flow

The website does **not** use EmailJS and does not contain the SMTP password.

```
Browser
  ↓ booking details
React / GitHub Pages
  ↓ HTTPS
Node.js / Express backend
  ↓ server-only authentication
Infisical
  ↓ SMTP secrets
Gmail SMTP
  ├──→ iaastrophilee@gmail.com
  └──→ customer confirmation email
```

The React frontend never receives, stores, or requests the SMTP password. Infisical is accessed only by the backend using a scoped machine identity. Infisical machine identities are designed for workloads and can be restricted to the required project/environment/path. citeturn0search0turn0search4

## Infisical setup

Create an Infisical project and a production environment. Store these secrets in the backend's allowed secret path:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`

Create a dedicated **Machine Identity** for this backend and give it only read access to those secrets. Infisical's Universal Auth exchanges the machine identity's client ID and client secret for a short-lived access token; those credentials must remain backend-only. citeturn0search0

For Gmail SMTP, use a **Google App Password**, not your normal Google account password.

## Backend environment

The backend needs these environment variables:

```
INFISICAL_SITE_URL=https://app.infisical.com
INFISICAL_CLIENT_ID=...
INFISICAL_CLIENT_SECRET=...
INFISICAL_PROJECT_ID=...
INFISICAL_ENVIRONMENT=prod
INFISICAL_SECRET_PATH=/
FRONTEND_ORIGIN=https://aashishsharma436.github.io
CONSULTANT_EMAIL=iaastrophilee@gmail.com
```

These are backend environment variables. **Do not put them in `src/`, do not expose them through Vite, and do not commit their values to GitHub.**

## Render deployment

The repository includes `render.yaml` for the Node.js backend.

After creating the Render service, configure:

- `INFISICAL_CLIENT_ID`
- `INFISICAL_CLIENT_SECRET`
- `INFISICAL_PROJECT_ID`

in Render's backend environment settings.

The frontend separately needs the GitHub repository secret:

- `VITE_API_URL` = the public URL of the deployed backend

The browser only receives that public API URL. It does **not** receive the Infisical credentials or SMTP secrets.

## Booking API

Health check:

```
GET /health
```

Booking endpoint:

```
POST /api/bookings
```

The API validates the submitted booking details, retrieves SMTP configuration server-side, sends the booking to `iaastrophilee@gmail.com`, and sends an acknowledgement to the customer's email.

Error responses never include secret values, and the backend logs only the error message rather than the SMTP configuration.

## Configure availability

Edit the `SCHEDULE` object in `src/App.jsx`:

- `days`: available weekdays (1 = Monday, 6 = Saturday)
- `startHour` / `endHour`: working hours
- `slotMinutes`: slot increment
- `blockedDates`: dates that should not be bookable
- `bookedSlots`: already reserved slots

For production-grade double-booking protection, the next step is moving availability and reservations into the backend database.

The YouTube video currently integrated is video ID `Q-ELW8tuDgM`.
