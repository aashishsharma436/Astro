# Astro Consultancy Website

A responsive astrology consultancy website with:

- Consultation service cards
- Schedule-based date/time selection
- Booking details form
- WhatsApp booking request flow
- Integrated YouTube video
- Mobile responsive design

## Configure availability

Edit `app.js`:

- `days`: available weekdays (1 = Monday, 6 = Saturday)
- `startHour` / `endHour`: working hours
- `slotMinutes`: slot increment
- `blockedDates`: dates that should not be bookable
- `bookedSlots`: already reserved slots

Also replace `whatsappNumber` with the actual WhatsApp number.

## Next production steps

1. Store bookings in a database.
2. Add an admin schedule dashboard.
3. Connect Google Calendar so booked times are automatically blocked.
4. Add Razorpay payment before confirmation.
5. Send confirmation/reminder notifications by email or WhatsApp.
6. Add proper authentication and server-side validation.

The YouTube video currently integrated is video ID `Q-ELW8tuDgM`.
