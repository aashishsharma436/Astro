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
const ADMIN_TOKEN_PROPERTY = "ADMIN_TOKEN";
const CALENDAR_ID = "primary";
const TIMEZONE = "Asia/Kolkata";
const DEFAULT_CONFIG = {
  slotMinutes: 30,
  weeklySchedule: {
    "0": [], "1": [["10:00", "17:00"]], "2": [["10:00", "17:00"]],
    "3": [["10:00", "17:00"]], "4": [["10:00", "17:00"]],
    "5": [["10:00", "17:00"]], "6": [["10:00", "17:00"]]
  },
  services: [
    { name: "Quick Guidance", duration: 30, price: 300 },
    { name: "Personal Consultation", duration: 60, price: 500 },
    { name: "Detailed Chart Reading", duration: 90, price: 800 }
  ]
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

    if (action === "adminGetConfig") {
      return handleAdminGetConfig_(body);
    }

    if (action === "adminSaveConfig") {
      return handleAdminSaveConfig_(body);
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

  const config = getConfig_();
  if (duration < 1 || !config.services.some(service => Number(service.duration) === duration)) {
    return { ok: false, message: "Invalid consultation duration." };
  }

  const date = parseDate_(dateString, "00:00");
  const day = date.getDay();

  const windows = config.weeklySchedule[String(day)] || [];
  if (!windows.length) {
    return { ok: true, date: dateString, available: [] };
  }

  const events = getCalendarEventsForDate_(date);
  const available = [];

  windows.forEach(window => {
    const startMinutes = toMinutes_(window[0]);
    const endMinutes = toMinutes_(window[1]);

    for (let mins = startMinutes; mins + duration <= endMinutes; mins += config.slotMinutes) {
      const start = minutesToDate_(date, mins);
      const end = new Date(start.getTime() + duration * 60000);

      if (!hasOverlap_(events, start, end)) {
        available.push({
          key: formatDate_(start) + "T" + formatTime_(start),
          label: formatTimeLabel_(start)
        });
      }
    }
  });

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

  const config = getConfig_();
  const serviceConfig = config.services.find(item => item.name === service);
  if (!serviceConfig || duration !== Number(serviceConfig.duration)) {
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

function getConfig_() {
  const raw = PropertiesService.getScriptProperties().getProperty("BOOKING_CONFIG");
  if (!raw) return JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  try {
    const parsed = JSON.parse(raw);
    return {
      slotMinutes: Number(parsed.slotMinutes) || DEFAULT_CONFIG.slotMinutes,
      weeklySchedule: parsed.weeklySchedule || DEFAULT_CONFIG.weeklySchedule,
      services: Array.isArray(parsed.services) && parsed.services.length
        ? parsed.services
        : DEFAULT_CONFIG.services
    };
  } catch (error) {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
}

function isAdmin_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty(ADMIN_TOKEN_PROPERTY);
  return Boolean(expected && token && token === expected);
}

function handleAdminGetConfig_(body) {
  if (!isAdmin_(body.adminToken)) {
    return jsonResponse_({ ok: false, message: "Unauthorized admin access." });
  }
  return jsonResponse_({ ok: true, config: getConfig_() });
}

function handleAdminSaveConfig_(body) {
  if (!isAdmin_(body.adminToken)) {
    return jsonResponse_({ ok: false, message: "Unauthorized admin access." });
  }

  const config = body.config || {};
  const normalized = validateConfig_(config);

  PropertiesService.getScriptProperties()
    .setProperty("BOOKING_CONFIG", JSON.stringify(normalized));

  return jsonResponse_({
    ok: true,
    message: "Booking settings saved.",
    config: normalized
  });
}

function validateConfig_(config) {
  const slotMinutes = Number(config.slotMinutes);
  if (![15, 30, 60].includes(slotMinutes)) {
    throw new Error("Slot interval must be 15, 30 or 60 minutes.");
  }

  const weeklySchedule = {};
  for (let day = 0; day <= 6; day++) {
    const windows = Array.isArray(config.weeklySchedule && config.weeklySchedule[String(day)])
      ? config.weeklySchedule[String(day)]
      : [];

    weeklySchedule[String(day)] = windows.map(window => {
      if (!Array.isArray(window) || window.length !== 2) throw new Error("Invalid schedule window.");
      const start = String(window[0]);
      const end = String(window[1]);
      if (!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(start) ||
          !/^([01]\\d|2[0-3]):[0-5]\\d$/.test(end) ||
          toMinutes_(start) >= toMinutes_(end)) {
        throw new Error("Invalid schedule time window.");
      }
      return [start, end];
    });
  }

  const services = Array.isArray(config.services) ? config.services : [];
  if (!services.length) throw new Error("At least one service is required.");

  return {
    slotMinutes,
    weeklySchedule,
    services: services.map(item => {
      const name = String(item.name || "").trim();
      const duration = Number(item.duration);
      const price = Number(item.price);
      if (!name || ![15, 30, 45, 60, 90, 120].includes(duration) || !Number.isFinite(price) || price < 0) {
        throw new Error("Invalid service configuration.");
      }
      return { name, duration, price };
    })
  };
}

function toMinutes_(value) {
  const parts = String(value).split(":").map(Number);
  return parts[0] * 60 + parts[1];
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
