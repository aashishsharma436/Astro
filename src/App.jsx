import { useCallback, useEffect, useMemo, useState } from "react";

const API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DEFAULT_SERVICES = [
  { name: "Personal Consultation", duration: 60, price: 500, icon: "☾", description: "A focused one-to-one session based on your birth details and questions." },
  { name: "Detailed Chart Reading", duration: 90, price: 800, icon: "✦", description: "More time for a broader reading, themes, timing and specific concerns." },
  { name: "Quick Guidance", duration: 30, price: 300, icon: "◌", description: "A concise session for one or two focused questions." }
];
const DEFAULT_CONFIG = {
  slotMinutes: 30,
  weeklySchedule: { 0: [], 1: [["10:00","17:00"]], 2: [["10:00","17:00"]], 3: [["10:00","17:00"]], 4: [["10:00","17:00"]], 5: [["10:00","17:00"]], 6: [["10:00","17:00"]] },
  services: DEFAULT_SERVICES.map(({name,duration,price}) => ({name,duration,price}))
};
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

function App() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [service, setService] = useState(DEFAULT_SERVICES[0].name);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [availableSlots, setAvailableSlots] = useState([]);
  const [message, setMessage] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminToken, setAdminToken] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [adminDraft, setAdminDraft] = useState(DEFAULT_CONFIG);

  const selectedService = useMemo(
    () => config.services.find(s => s.name === service) || config.services[0] || DEFAULT_CONFIG.services[0],
    [config.services, service]
  );

  const servicesForCards = config.services.map((s, i) => ({
    ...s,
    icon: DEFAULT_SERVICES[i % DEFAULT_SERVICES.length]?.icon || "✦",
    description: DEFAULT_SERVICES.find(x => x.name === s.name)?.description || "A private astrology consultation tailored to your questions."
  }));

  const dates = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    return Array.from({length:21}, (_,i) => {
      const d = new Date(today); d.setDate(today.getDate()+i);
      const date = iso(d);
      return {d,date,available:(config.weeklySchedule[String(d.getDay())] || []).length > 0};
    });
  }, [config.weeklySchedule]);

  const loadAvailability = useCallback(async () => {
    if (!selectedDate || !selectedService || !API_URL) return;
    try {
      const r = await fetch(`${API_URL}/api/availability?date=${selectedDate}&duration=${selectedService.duration}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || "Availability could not be loaded.");
      setAvailableSlots(data.available || []);
      setSelectedTime(current => (data.available || []).some(x => x.key === current) ? current : "");
    } catch (e) {
      setAvailableSlots([]);
      setMessage(e.message || "Could not load live availability.");
    }
  }, [selectedDate, selectedService]);

  useEffect(() => {
    loadAvailability();
    if (!selectedDate) return;
    const id = setInterval(loadAvailability, 10000);
    return () => clearInterval(id);
  }, [loadAvailability, selectedDate]);

  function selectService(name) {
    setService(name); setSelectedTime("");
    document.getElementById("booking")?.scrollIntoView({behavior:"smooth"});
  }

  async function book() {
    const value = id => document.getElementById(id)?.value.trim();
    const name=value("name"), phone=value("phone"), email=value("email"), birth=value("birth"), question=value("question");
    if (!name || !phone || !email) return setMessage("Please enter your name, phone/WhatsApp number and email.");
    if (!selectedDate || !selectedTime) return setMessage("Please select a live available date and time.");
    if (!API_URL) return setMessage("Booking service is not configured yet.");
    setMessage("Confirming your appointment...");
    try {
      const r=await fetch(API_URL+"/api/bookings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        name,phone,email,service,duration:selectedService.duration,dateTime:selectedTime,birthDetails:birth||"Not provided",question:question||"Not provided"
      })});
      const data=await r.json().catch(()=>({}));
      if (r.status===409) {
        setMessage(data.message || "That slot was just booked. Please choose another.");
        await loadAvailability(); return;
      }
      if (!r.ok) throw new Error(data.message || "Booking failed.");
      setMessage(data.message || "Booking confirmed. A confirmation email has been sent.");
      setSelectedTime(""); await loadAvailability();
    } catch(e) { setMessage(e.message || "We couldn't confirm the booking."); }
  }

  async function adminLogin() {
    if (!API_URL || !adminToken) return setAdminMessage("Enter the admin password.");
    setAdminMessage("Checking access...");
    try {
      const r=await fetch(API_URL+"/api/settings/read",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adminToken})});
      const data=await r.json().catch(()=>({}));
      if (!r.ok || !data.ok) throw new Error(data.message || "Invalid admin password.");
      setAdminDraft(data.config); setAdminOpen(true); setAdminMessage("Admin access verified.");
    } catch(e) { setAdminMessage(e.message || "Admin access failed."); }
  }

  function setWindow(day,index,field,value) {
    setAdminDraft(d=>({...d,weeklySchedule:{...d.weeklySchedule,[day]:d.weeklySchedule[day].map((w,i)=>i===index?[field==="start"?value:w[0],field==="end"?value:w[1]]:w)}}));
  }
  function addWindow(day) {
    setAdminDraft(d=>({...d,weeklySchedule:{...d.weeklySchedule,[day]:[...(d.weeklySchedule[day]||[]),["09:00","13:00"]]}}));
  }
  function removeWindow(day,index) {
    setAdminDraft(d=>({...d,weeklySchedule:{...d.weeklySchedule,[day]:d.weeklySchedule[day].filter((_,i)=>i!==index)}}));
  }
  function updateService(index,key,value) {
    setAdminDraft(d=>({...d,services:d.services.map((s,i)=>i===index?{...s,[key]:key==="name"?value:Number(value)}:s)}));
  }
  function addService() {
    setAdminDraft(d=>({...d,services:[...d.services,{name:"New Service",duration:30,price:300}]}));
  }
  function removeService(index) {
    setAdminDraft(d=>({...d,services:d.services.filter((_,i)=>i!==index)}));
  }
  async function saveAdmin() {
    setAdminMessage("Saving...");
    try {
      const r=await fetch(API_URL+"/api/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({adminToken,config:adminDraft})});
      const data=await r.json().catch(()=>({}));
      if(!r.ok || !data.ok) throw new Error(data.message || "Could not save settings.");
      setConfig(data.config); setAdminDraft(data.config); setService(data.config.services[0]?.name || "");
      setAdminMessage("Saved. Public availability and prices are updated.");
    } catch(e) { setAdminMessage(e.message || "Could not save settings."); }
  }

  const summary = selectedDate && selectedTime
    ? `${new Date(selectedDate+"T00:00:00").toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"})} · ${availableSlots.find(x=>x.key===selectedTime)?.label || ""}`
    : "Select a date and time";

  return <>
    <header className="site-header">
      <a className="brand" href="#home"><span className="brand-mark">✦</span><span>Astro<span>Consultancy</span></span></a>
      <nav><a href="#consultations">Consultations</a><a href="#about">About</a><a href="#youtube">YouTube</a><a href="#booking">Book</a><a className="nav-cta" href="#admin">Admin</a></nav>
      <button className="menu-btn" aria-label="Open menu">☰</button>
    </header>

    <main>
      <section id="home" className="hero"><div className="stars"/><div className="hero-copy"><p className="eyebrow">PERSONAL ASTROLOGY CONSULTANCY</p><h1>Find clarity in your <em>stars.</em></h1><p className="hero-text">One-to-one astrology consultations focused on your questions, your chart, and the path ahead.</p><div className="hero-actions"><a className="button primary" href="#booking">Book a Consultation <span>→</span></a><a className="button ghost" href="#youtube">Watch on YouTube</a></div><div className="trust-row"><span>✦ Private 1:1 sessions</span><span>✦ Flexible online consultation</span><span>✦ Appointment-based</span></div></div><div className="hero-orbit" aria-hidden="true"><div className="orbit orbit-1"/><div className="orbit orbit-2"/><div className="planet">☽</div><div className="zodiac">♈︎　♉︎　♊︎　♋︎　♌︎　♍︎<br/>♎︎　♏︎　♐︎　♑︎　♒︎　♓︎</div></div></section>

      <section id="consultations" className="section"><div className="section-heading"><p className="eyebrow">CONSULTATION OPTIONS</p><h2>Choose the session that fits your question.</h2><p>Prices and durations are controlled by the website admin.</p></div><div className="service-grid">{servicesForCards.map(s=><article key={s.name} className={`service-card ${s.name===service?"featured":""}`}><span className="service-icon">{s.icon}</span><h3>{s.name}</h3><p>{s.description}</p><div className="service-meta"><strong>{s.duration} min</strong><span>₹{Number(s.price).toLocaleString("en-IN")}</span></div><button className="text-button" onClick={()=>selectService(s.name)}>Book this session →</button></article>)}</div></section>

      <section id="about" className="section about"><div><p className="eyebrow">A PERSONAL APPROACH</p><h2>Astrology that starts with your questions.</h2></div><div className="about-copy"><p>Every consultation is private and centered around the areas you want to understand better. Choose a live slot from the current schedule and receive a confirmation after the appointment is added to the calendar.</p><div className="about-points"><div><b>01</b><span>Share your birth details and consultation topic.</span></div><div><b>02</b><span>Choose an available date and time from the live calendar.</span></div><div><b>03</b><span>Receive your appointment confirmation by email.</span></div></div></div></section>

      <section id="youtube" className="section youtube-section"><div className="section-heading compact"><p className="eyebrow">WATCH & LEARN</p><h2>Explore the YouTube channel.</h2><p>Watch astrology content before your consultation.</p></div><div className="video-card"><div className="video-wrap"><iframe src="https://www.youtube.com/embed/Q-ELW8tuDgM" title="Astrology video" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen/></div><div className="video-copy"><span className="video-label">FEATURED VIDEO</span><h3>Watch the latest astrology content</h3><p>Explore astrology insights, guidance and educational content.</p><a className="button ghost" href="https://www.youtube.com/watch?v=Q-ELW8tuDgM" target="_blank" rel="noopener">Open on YouTube ↗</a></div></div></section>

      <section id="booking" className="section booking-section"><div className="booking-intro"><p className="eyebrow">BOOK YOUR SESSION</p><h2>Choose an available time.</h2><p>Only live slots from the configured schedule and Google Calendar are shown.</p><div className="schedule-note"><span>●</span><div><strong>Live availability</strong><br/>Refreshes automatically every 10 seconds.</div></div></div><div className="booking-card">
        <div className="booking-step"><span>1</span><div><label>Consultation</label><select value={service} onChange={e=>{setService(e.target.value);setSelectedTime("");}}>{config.services.map(s=><option key={s.name} value={s.name}>{s.name} · {s.duration} min · ₹{Number(s.price).toLocaleString("en-IN")}</option>)}</select></div></div>
        <div className="booking-step"><span>2</span><div><label>Date</label><div className="date-grid">{dates.map(({d,date,available})=><button key={date} type="button" disabled={!available} className={`date-btn ${!available?"disabled":""} ${selectedDate===date?"selected":""}`} onClick={()=>{setSelectedDate(date);setSelectedTime("");}}><small>{d.toLocaleDateString("en-IN",{weekday:"short"})}</small><strong>{d.getDate()}</strong></button>)}</div></div></div>
        <div className="booking-step"><span>3</span><div><label>Available time</label><div className="time-grid">{!selectedDate?<p className="empty-state">Choose a date first.</p>:availableSlots.length?availableSlots.map(t=><button key={t.key} type="button" className={`time-btn ${selectedTime===t.key?"selected":""}`} onClick={()=>setSelectedTime(t.key)}>{t.label}</button>):<p className="empty-state">No live slots are available for this date.</p>}</div></div></div>
        <div className="booking-step"><span>4</span><div><label>Your details</label><div className="form-grid"><input id="name" placeholder="Full name" autoComplete="name"/><input id="phone" type="tel" placeholder="Phone / WhatsApp number" autoComplete="tel"/><input id="email" type="email" placeholder="Email address" autoComplete="email"/><input id="birth" placeholder="Birth date & time (optional)"/></div><textarea id="question" rows="3" placeholder="What would you like guidance on?"/></div></div>
        <div className="booking-summary"><div><span>Selected</span><strong>{summary}</strong></div><button className="button primary" disabled={!selectedDate||!selectedTime} onClick={book}>Confirm Booking</button></div><p className="booking-message" role="status">{message}</p>
      </div></section>

      <section id="admin" className="section admin-section"><div className="section-heading"><p className="eyebrow">WEBSITE ADMIN</p><h2>Manage prices and availability.</h2><p>Admin settings are stored securely in Google Apps Script and are not included in the public website source.</p></div><div className="admin-card"><div className="admin-login"><input type="password" value={adminToken} onChange={e=>setAdminToken(e.target.value)} placeholder="Admin password"/><button className="button primary" onClick={adminLogin}>Unlock Admin</button></div>{adminOpen&&<><div className="admin-toolbar"><label>Slot interval<select value={adminDraft.slotMinutes} onChange={e=>setAdminDraft(d=>({...d,slotMinutes:Number(e.target.value)}))}><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option></select></label></div><div className="admin-days">{DAYS.map((day,i)=><div className="admin-day" key={day}><div className="admin-day-title"><strong>{day}</strong>{(adminDraft.weeklySchedule[String(i)]||[]).length===0&&<span>Closed</span>}</div>{(adminDraft.weeklySchedule[String(i)]||[]).map((w,j)=><div className="window-row" key={j}><input type="time" value={w[0]} onChange={e=>setWindow(String(i),j,"start",e.target.value)}/><span>to</span><input type="time" value={w[1]} onChange={e=>setWindow(String(i),j,"end",e.target.value)}/><button type="button" className="small-danger" onClick={()=>removeWindow(String(i),j)}>Remove</button></div>)}<button type="button" className="small-button" onClick={()=>addWindow(String(i))}>+ Add time window</button></div>)}</div><div className="admin-services"><div className="admin-day-title"><strong>Services & prices</strong><button type="button" className="small-button" onClick={addService}>+ Add service</button></div>{adminDraft.services.map((s,i)=><div className="service-edit-row" key={i}><input value={s.name} onChange={e=>updateService(i,"name",e.target.value)}/><select value={s.duration} onChange={e=>updateService(i,"duration",e.target.value)}><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option><option value="90">90 min</option><option value="120">120 min</option></select><input type="number" min="0" value={s.price} onChange={e=>updateService(i,"price",e.target.value)} placeholder="Price"/><button type="button" className="small-danger" onClick={()=>removeService(i)}>Remove</button></div>)}</div><button className="button primary admin-save" onClick={saveAdmin}>Save Website Settings</button></>}<p className="booking-message">{adminMessage}</p></div></section>
    </main>
    <footer><div className="footer-brand"><span className="brand-mark">✦</span><strong>AstroConsultancy</strong></div><p>© 2026 Astro Consultancy. For guidance and personal reflection.</p><a href="#booking">Book a consultation →</a></footer>
  </>;
}
export default App;
