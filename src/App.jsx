import { useMemo, useState } from "react";
import emailjs from "@emailjs/browser";

const SCHEDULE = {
  timezone: "Asia/Kolkata",
  days: [1, 2, 3, 4, 5, 6],
  startHour: 10,
  endHour: 19,
  slotMinutes: 30,
  blockedDates: [],
  bookedSlots: []
};

const EMAIL_CONFIG = {
  publicKey: "YOUR_EMAILJS_PUBLIC_KEY",
  serviceId: "YOUR_EMAILJS_SERVICE_ID",
  bookingTemplateId: "YOUR_BOOKING_TEMPLATE_ID",
  confirmationTemplateId: "YOUR_CONFIRMATION_TEMPLATE_ID",
  consultancyEmail: "iaastrophilee@gmail.com"
};

const SERVICES = [
  { name: "Personal Consultation", duration: 60, price: "₹1,500", icon: "☾", description: "Discuss your most important questions with a focused reading based on your birth details." },
  { name: "Detailed Chart Reading", duration: 90, price: "₹2,000", icon: "✦", description: "A longer session for a broader look at your chart, themes, timing and specific concerns." },
  { name: "Quick Guidance", duration: 30, price: "₹900", icon: "◌", description: "A concise session for one or two focused questions when you need a shorter consultation." }
];

const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

function App() {
  const [service, setService] = useState(SERVICES[0].name);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [message, setMessage] = useState("");

  const dates = useMemo(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    return Array.from({ length: 21 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const date = iso(d);
      return { d, date, available: SCHEDULE.days.includes(d.getDay()) && !SCHEDULE.blockedDates.includes(date) };
    });
  }, []);

  const selectedService = SERVICES.find(s => s.name === service) || SERVICES[0];

  const times = useMemo(() => {
    if (!selectedDate) return [];
    const result = [];
    for (let mins = SCHEDULE.startHour * 60; mins + selectedService.duration <= SCHEDULE.endHour * 60; mins += SCHEDULE.slotMinutes) {
      const h = Math.floor(mins / 60), m = mins % 60;
      const key = `${selectedDate}T${pad(h)}:${pad(m)}`;
      if (!SCHEDULE.bookedSlots.includes(key)) result.push({ key, label: `${h % 12 || 12}:${pad(m)} ${h >= 12 ? "PM" : "AM"}` });
    }
    return result;
  }, [selectedDate, selectedService]);

  const summary = selectedDate && selectedTime
    ? `${new Date(selectedDate + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} · ${times.find(t => t.key === selectedTime)?.label || ""}`
    : "Select a date and time";

  function selectService(name) {
    setService(name);
    setSelectedTime("");
    document.getElementById("booking")?.scrollIntoView({ behavior: "smooth" });
  }

  async function book() {
    const name = document.getElementById("name").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const email = document.getElementById("email").value.trim();
    const birth = document.getElementById("birth").value.trim();
    const question = document.getElementById("question").value.trim();

    if (!name || !phone || !email) {
      setMessage("Please enter your name, phone/WhatsApp number and email.");
      return;
    }

    if (EMAIL_CONFIG.publicKey.startsWith("YOUR_") || EMAIL_CONFIG.serviceId.startsWith("YOUR_")) {
      setMessage("Email booking is not configured yet. Add the EmailJS keys in src/App.jsx.");
      return;
    }

    setMessage("Sending your booking request...");

    const templateParams = {
      name,
      email,
      phone,
      service,
      date_time: summary,
      birth_details: birth || "Not provided",
      question: question || "Not provided",
      consultancy_email: EMAIL_CONFIG.consultancyEmail
    };

    try {
      emailjs.init({ publicKey: EMAIL_CONFIG.publicKey });

      await emailjs.send(
        EMAIL_CONFIG.serviceId,
        EMAIL_CONFIG.bookingTemplateId,
        templateParams
      );

      await emailjs.send(
        EMAIL_CONFIG.serviceId,
        EMAIL_CONFIG.confirmationTemplateId,
        templateParams
      );

      setMessage("Booking request sent successfully. A confirmation email has been sent to your email address.");
    } catch (error) {
      console.error("Email booking failed:", error);
      setMessage("We couldn't send the booking email. Please try again in a moment.");
    }
  }
  return (
    <>
      <header className="site-header">
        <a className="brand" href="#home"><span className="brand-mark">✦</span><span>Astro<span>Consultancy</span></span></a>
        <nav>
          <a href="#consultations">Consultations</a><a href="#about">About</a><a href="#youtube">YouTube</a><a className="nav-cta" href="#booking">Book a Session</a>
        </nav>
        <button className="menu-btn" aria-label="Open menu">☰</button>
      </header>

      <main>
        <section id="home" className="hero">
          <div className="stars" />
          <div className="hero-copy">
            <p className="eyebrow">PERSONAL ASTROLOGY CONSULTANCY</p>
            <h1>Find clarity in your <em>stars.</em></h1>
            <p className="hero-text">One-to-one astrology consultations focused on your questions, your chart, and the path ahead.</p>
            <div className="hero-actions"><a className="button primary" href="#booking">Book a Consultation <span>→</span></a><a className="button ghost" href="#youtube">Watch on YouTube</a></div>
            <div className="trust-row"><span>✦ Private 1:1 sessions</span><span>✦ Flexible online consultation</span><span>✦ Appointment-based</span></div>
          </div>
          <div className="hero-orbit" aria-hidden="true"><div className="orbit orbit-1"/><div className="orbit orbit-2"/><div className="planet">☽</div><div className="zodiac">♈︎　♉︎　♊︎　♋︎　♌︎　♍︎<br/>♎︎　♏︎　♐︎　♑︎　♒︎　♓︎</div></div>
        </section>

        <section id="consultations" className="section">
          <div className="section-heading"><p className="eyebrow">CONSULTATION OPTIONS</p><h2>Choose the session that fits your question.</h2><p>Start with a focused consultation or choose a deeper reading when you need more time.</p></div>
          <div className="service-grid">{SERVICES.map(s => <article key={s.name} className={`service-card ${s.name === "Personal Consultation" ? "featured" : ""}`}><span className="service-icon">{s.icon}</span><h3>{s.name}</h3><p>{s.description}</p><div className="service-meta"><strong>{s.duration} min</strong><span>{s.price}</span></div><button className="text-button" onClick={() => selectService(s.name)}>Book this session →</button></article>)}</div>
        </section>

        <section id="about" className="section about">
          <div><p className="eyebrow">A PERSONAL APPROACH</p><h2>Astrology that starts with your questions.</h2></div>
          <div className="about-copy"><p>Every consultation is private and centered around the areas you want to understand better. Share your birth details and questions before the session so the consultation can be prepared around you.</p><div className="about-points"><div><b>01</b><span>Share your birth details and consultation topic.</span></div><div><b>02</b><span>Choose an available date and time from the schedule.</span></div><div><b>03</b><span>Receive your appointment confirmation.</span></div></div></div>
        </section>

        <section id="youtube" className="section youtube-section">
          <div className="section-heading compact"><p className="eyebrow">WATCH & LEARN</p><h2>Explore the YouTube channel.</h2><p>Watch astrology content before your consultation and stay connected with new videos.</p></div>
          <div className="video-card"><div className="video-wrap"><iframe src="https://www.youtube.com/embed/Q-ELW8tuDgM" title="Astrology video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div><div className="video-copy"><span className="video-label">FEATURED VIDEO</span><h3>Watch the latest astrology content</h3><p>Explore the channel for astrology insights, guidance and educational content.</p><a className="button ghost" href="https://www.youtube.com/watch?v=Q-ELW8tuDgM" target="_blank" rel="noopener">Open on YouTube ↗</a></div></div>
        </section>

        <section id="booking" className="section booking-section">
          <div className="booking-intro"><p className="eyebrow">BOOK YOUR SESSION</p><h2>Choose an available time.</h2><p>The calendar below only shows slots configured as available. Select a session, date and time, then submit your details.</p><div className="schedule-note"><span>●</span><div><strong>Availability</strong><br/>Monday–Saturday · 10:00 AM–7:00 PM</div></div></div>
          <div className="booking-card">
            <div className="booking-step"><span>1</span><div><label>Consultation</label><select value={service} onChange={e => {setService(e.target.value);setSelectedTime("");}}>{SERVICES.map(s=><option key={s.name}>{s.name} · {s.duration} min · {s.price}</option>)}</select></div></div>
            <div className="booking-step"><span>2</span><div><label>Date</label><div className="date-grid">{dates.map(({d,date,available}) => <button key={date} type="button" disabled={!available} className={`date-btn ${!available ? "disabled" : ""} ${selectedDate === date ? "selected" : ""}`} onClick={() => {setSelectedDate(date);setSelectedTime("");}}><small>{d.toLocaleDateString("en-IN",{weekday:"short"})}</small><strong>{d.getDate()}</strong></button>)}</div></div></div>
            <div className="booking-step"><span>3</span><div><label>Available time</label><div className="time-grid">{!selectedDate ? <p className="empty-state">Choose a date first.</p> : times.length ? times.map(t=><button key={t.key} type="button" className={`time-btn ${selectedTime === t.key ? "selected" : ""}`} onClick={()=>setSelectedTime(t.key)}>{t.label}</button>) : <p className="empty-state">No slots are available for this date.</p>}</div></div></div>
            <div className="booking-step"><span>4</span><div><label>Your details</label><div className="form-grid"><input id="name" placeholder="Full name" autoComplete="name"/><input id="phone" type="tel" placeholder="Phone / WhatsApp number" autoComplete="tel"/><input id="email" type="email" placeholder="Email address" autoComplete="email"/><input id="birth" placeholder="Birth date & time (optional)"/></div><textarea id="question" rows="3" placeholder="What would you like guidance on?"/></div></div>
            <div className="booking-summary"><div><span>Selected</span><strong>{summary}</strong></div><button className="button primary" disabled={!selectedDate || !selectedTime} onClick={book}>Send Booking Request</button></div>
            <p className="booking-message" role="status">{message}</p>
          </div>
        </section>
      </main>

      <footer><div className="footer-brand"><span className="brand-mark">✦</span><strong>AstroConsultancy</strong></div><p>© 2026 Astro Consultancy. For guidance and personal reflection.</p><a href="#booking">Book a consultation →</a></footer>
    </>
  );
}

export default App;