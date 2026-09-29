# Astro Consultancy Website

A responsive React/Vite astrology consultancy website with:

- Consultation service cards
- Schedule-based date/time selection
- Booking details form
- Node.js/Express booking API
- SMTP email notifications
- Automatic customer acknowledgement email
- Integrated YouTube video
- Mobile responsive design

## Booking email flow

The website does **not** use EmailJS.

When a visitor submits a booking:

1. The React frontend sends the booking details to the Node.js API.
2. The API sends the booking details to **iaastrophilee@gmail.com**.
3. The API sends an acknowledgement email to the customer's submitted email address.

The backend uses SMTP through Nodemailer. Gmail SMTP is preconfigured as the example.

## Backend setup

The backend lives in `server/`.

Install and run locally:

```bash
cd server
npm install
cp .env.example .env
npm start
```

Set the SMTP values in `server/.env`. For Gmail, use a Google App Password rather than your normal Gmail password.

The API health endpoint is:

```
GET /health
```

The booking endpoint is:

```
POST /api/bookings
```

## Deploy the backend

`render.yaml` is included for a Render deployment.

After deploying the API, copy its public URL and configure the GitHub repository secret:

- `VITE_API_URL` = your deployed backend URL

Then the existing GitHub Pages workflow builds the React frontend with that API URL.

The backend's `FRONTEND_ORIGIN` environment variable should be:

```
https://aashishsharma436.github.io
```

## Configure availability

Edit the `SCHEDULE` object in `src/App.jsx`:

- `days`: available weekdays (1 = Monday, 6 = Saturday)
- `startHour` / `endHour`: working hours
- `slotMinutes`: slot increment
- `blockedDates`: dates that should not be bookable
- `bookedSlots`: already reserved slots

For a production booking system, the next step is moving availability/booked slots into the backend database so two visitors cannot reserve the same slot.

The YouTube video currently integrated is video ID `Q-ELW8tuDgM`.
