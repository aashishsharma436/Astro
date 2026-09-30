/**
 * Astro Consultancy - Gmail + Google Calendar booking gateway
 *
 * Deploy as a Web app:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Script Property:
 *   WEBHOOK_TOKEN = same secret stored in Infisical/Render
 *
 * The script uses the owner's primary Google Calendar as the source
 * of truth for appointment availability.
 */

const TOKEN_PROPERTY = "WEBHOOK_TOKEN";
const CALENDAR_ID = "primary";
const TIMEZONE = "Asia/Kolkata";
const START_HOUR = 10;
const END_HOUR = 19;
const SLOT_MINUTES = 30;
const WORKING_DAYS = [1, 2, 3, 4, 5, 6]; // Monday-Saturday

const SERVICE_DURATIONS = {
  "Quick Guidance": 30,
  "Personal Consultation": 60,
  "Detailed Chart Reading": 90
};

function doGet() {
  return jsonResponse_({
    ok: true,
    service: "astro-consultancy-calendar-mail-gateway"
  });
}

function doPost(e) {
  try {
    const expectedToken = PropertiesService.getScriptProperties()
      .getProperty(TOKEN_PROPERTY);

    if (!expectedToken) {
      return jsonResponse_({ ok: false, message: "WEBHOOK_TOKEN is not configured." });
    }

    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");

    if (body.token !== expectedToken) {
      return jsonResponse_({ ok: false, message: "Unauthorized." });
    }

    const action = body.action || "booking";

    if (action === "availability") {
      return jsonResponse_(getAvailability_(body.date, Number(body.duration)));
    }

    if (action !== "booking") {
      return jsonResponse_({ ok: false, message: "Unsupported action." });
    }

    return handleBooking_(body);
  } catch (error) {
    console.error(error);
    return jsonResponse_({
      ok: false,
      message: error && error.message ? error.message : "Request failed."
    });
  }
}

function getAvailability_(dateString, duration) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ""))) {
    return { ok: false, message: "Invalid date." };
  }

  if (!SERVICE_DURATIONS || duration < 1) {
    return { ok: false, message: "Invalid consultation duration." };
  }

  const date = parseDate_(dateString, "00:00");
  const day = date.getDay();

  if (!WORKING_DAYS.includes(day)) {
    return { ok: true, date: dateString, available: [] };
  }

  const events = getCalendarEventsForDate_(date);

  const available = [];

  for (let mins = START_HOUR * 60; mins + duration <= END_HOUR * 60; mins += SLOT_MINUTES) {
    const start = minutesToDate_(date, mins);
    const end = new Date(start.getTime() + duration * 60000);

    if (!hasOverlap_(events, start, end)) {
      available.push({
        key: formatDate_(start) + "T" + formatTime_(start),
        label: formatTimeLabel_(start)
      });
    }
  }

  return {
    ok: true,
    date: dateString,
    available
  };
}

function handleBooking_(body) {
  const booking = body.booking || {};
  const consultantEmail = String(body.consultantEmail || "").trim();
  const customerEmail = String(booking.email || "").trim();

  if (!consultantEmail || !customerEmail) {
    return jsonResponse_({
      ok: false,
      code: "INVALID_BOOKING",
      message: "Consultant and customer email are required."
    });
  }

  const name = String(booking.name || "Customer").trim();
  const phone = String(booking.phone || "").trim();
  const service = String(booking.service || "").trim();
  const dateTime = String(booking.dateTime || "").trim();
  const duration = Number(booking.duration);
  const birthDetails = String(booking.birthDetails || "Not provided").trim();
  const question = String(booking.question || "Not provided").trim();

  if (!SERVICE_DURATIONS[service] || duration !== SERVICE_DURATIONS[service]) {
    return jsonResponse_({
      ok: false,
      code: "INVALID_SERVICE",
      message: "Invalid consultation service or duration."
    });
  }

  const start = new Date(dateTime);
  if (isNaN(start.getTime())) {
    return jsonResponse_({
      ok: false,
      code: "INVALID_TIME",
      message: "Invalid appointment time."
    });
  }

  const end = new Date(start.getTime() + duration * 60000);

  // The lock makes the final check + event creation atomic enough to prevent
  // two simultaneous booking requests from taking the same slot.
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const events = getCalendarEventsForDate_(start);

    if (hasOverlap_(events, start, end)) {
      return jsonResponse_({
        ok: false,
        code: "SLOT_UNAVAILABLE",
        message: "This time was just booked by another customer. Please select another available time."
      });
    }

    const details = [
      "Customer: " + name,
      "Email: " + customerEmail,
      "Phone: " + phone,
      "Service: " + service,
      "Duration: " + duration + " minutes",
      "Appointment: " + formatDateTime_(start),
      "Birth details: " + birthDetails,
      "Question: " + question
    ].join("\n");

    const event = CalendarApp.getCalendarById(CALENDAR_ID).createEvent(
      "Astrology Consultation — " + name,
      start,
      end,
      {
        description: details,
        guests: customerEmail,
        sendInvites: false
      }
    );

    console.log("Calendar event created: " + event.getId());

    sendBookingEmails_({
      consultantEmail,
      customerEmail,
      name,
      phone,
      service,
      dateTime: formatDateTime_(start),
      duration,
      birthDetails,
      question
    });

    return jsonResponse_({
      ok: true,
      message: "Booking confirmed. Your appointment has been added to the calendar.",
      eventId: event.getId()
    });
  } finally {
    lock.releaseLock();
  }
}

function sendBookingEmails_(booking) {
  const details = [
    "Name: " + booking.name,
    "Email: " + booking.customerEmail,
    "Phone: " + booking.phone,
    "Service: " + booking.service,
    "Duration: " + booking.duration + " minutes",
    "Appointment: " + booking.dateTime,
    "Birth details: " + booking.birthDetails,
    "Question: " + booking.question
  ].join("\n");

  GmailApp.sendEmail(
    booking.consultantEmail,
    "New astrology consultation booking — " + booking.name,
    "A new consultation has been confirmed and added to Google Calendar.\n\n" + details,
    {
      name: "Astro Consultancy",
      replyTo: booking.customerEmail
    }
  );

  GmailApp.sendEmail(
    booking.customerEmail,
    "Astro Consultancy — booking confirmed",
    "Hi " + booking.name + ",\n\n" +
      "Your astrology consultation has been confirmed.\n\n" +
      "Service: " + booking.service + "\n" +
      "Duration: " + booking.duration + " minutes\n" +
      "Appointment: " + booking.dateTime + "\n\n" +
      "The appointment has been added to the consultant's calendar.\n\n" +
      "Astro Consultancy",
    {
      name: "Astro Consultancy",
      replyTo: booking.consultantEmail
    }
  );
}

function getCalendarEventsForDate_(date) {
  const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  return calendar.getEvents(dayStart, dayEnd);
}

function hasOverlap_(events, start, end) {
  return events.some(event => {
    if (event.isAllDayEvent()) return true;

    const eventStart = event.getStartTime();
    const eventEnd = event.getEndTime();

    return start < eventEnd && end > eventStart;
  });
}

function parseDate_(dateString, timeString) {
  const parts = dateString.split("-").map(Number);
  const time = timeString.split(":").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], time[0], time[1], 0, 0);
}

function minutesToDate_(date, minutes) {
  const result = new Date(date);
  result.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return result;
}

function formatDate_(date) {
  return Utilities.formatDate(date, TIMEZONE, "yyyy-MM-dd");
}

function formatTime_(date) {
  return Utilities.formatDate(date, TIMEZONE, "HH:mm");
}

function formatTimeLabel_(date) {
  return Utilities.formatDate(date, TIMEZONE, "h:mm a");
}

function formatDateTime_(date) {
  return Utilities.formatDate(date, TIMEZONE, "EEE, d MMM yyyy, h:mm a");
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
