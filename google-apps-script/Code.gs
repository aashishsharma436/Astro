/**
 * Astro Consultancy - Gmail mail gateway
 *
 * Deploy this Apps Script as a Web app:
 *   Execute as: Me
 *   Who has access: Anyone
 *
 * Before deploying, set a Script Property:
 *   WEBHOOK_TOKEN = <same secret stored in Render/Infisical>
 *
 * The Render backend sends POST requests here. This script then sends
 * the booking emails through the Gmail account that owns this script.
 */

const TOKEN_PROPERTY = "WEBHOOK_TOKEN";

function doGet() {
  return jsonResponse_({
    ok: true,
    service: "astro-consultancy-mail-gateway"
  });
}

function doPost(e) {
  try {
    const expectedToken = PropertiesService.getScriptProperties()
      .getProperty(TOKEN_PROPERTY);

    if (!expectedToken) {
      return jsonResponse_({
        ok: false,
        message: "WEBHOOK_TOKEN is not configured."
      });
    }

    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");

    if (body.token !== expectedToken) {
      return jsonResponse_({
        ok: false,
        message: "Unauthorized."
      });
    }

    if ((body.action || "booking") !== "booking") {
      return jsonResponse_({
        ok: false,
        message: "Unsupported action."
      });
    }

    const booking = body.booking || {};
    const consultantEmail = String(body.consultantEmail || "").trim();
    const customerEmail = String(booking.email || "").trim();

    if (!consultantEmail || !customerEmail) {
      return jsonResponse_({
        ok: false,
        message: "Consultant and customer email are required."
      });
    }

    const name = String(booking.name || "Customer").trim();
    const phone = String(booking.phone || "").trim();
    const service = String(booking.service || "").trim();
    const dateTime = String(booking.dateTime || "").trim();
    const birthDetails = String(booking.birthDetails || "Not provided").trim();
    const question = String(booking.question || "Not provided").trim();

    const details = [
      `Name: ${name}`,
      `Email: ${customerEmail}`,
      `Phone: ${phone}`,
      `Service: ${service}`,
      `Appointment: ${dateTime}`,
      `Birth details: ${birthDetails}`,
      `Question: ${question}`
    ].join("\n");

    GmailApp.sendEmail(
      consultantEmail,
      `New astrology consultation booking — ${name}`,
      `A new consultation request was received.\n\n${details}`,
      {
        name: "Astro Consultancy",
        replyTo: customerEmail
      }
    );

    GmailApp.sendEmail(
      customerEmail,
      "Astro Consultancy — booking request received",
      `Hi ${name},\n\nThank you for requesting an astrology consultation. We have received your booking request.\n\nService: ${service}\nRequested time: ${dateTime}\n\nThe consultation details will be confirmed separately.\n\nAstro Consultancy`,
      {
        name: "Astro Consultancy",
        replyTo: consultantEmail
      }
    );

    return jsonResponse_({
      ok: true,
      message: "Booking emails sent."
    });
  } catch (error) {
    console.error(error);
    return jsonResponse_({
      ok: false,
      message: error && error.message ? error.message : "Email delivery failed."
    });
  }
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
