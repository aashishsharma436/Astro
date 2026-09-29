// Schedule configuration — change these values to match the astrologer's real availability.
const SCHEDULE = {
  timezone: "Asia/Kolkata",
  days: [1,2,3,4,5,6], // Monday-Saturday
  startHour: 10,
  endHour: 19,
  slotMinutes: 30,
  blockedDates: [], // e.g. ["2026-10-02", "2026-10-05"]
  bookedSlots: []   // e.g. ["2026-10-03T11:00"]
};

const service = document.getElementById("service");
const dateGrid = document.getElementById("date-grid");
const timeGrid = document.getElementById("time-grid");
const summary = document.getElementById("summary");
const bookBtn = document.getElementById("book-btn");
const message = document.getElementById("booking-message");

let selectedDate = null;
let selectedTime = null;

const pad = n => String(n).padStart(2,"0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const displayDate = d => d.toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"});

function buildDates(){
  dateGrid.innerHTML = "";
  const today = new Date();
  today.setHours(0,0,0,0);
  for(let i=0;i<21;i++){
    const d = new Date(today);
    d.setDate(today.getDate()+i);
    const date = iso(d);
    const available = SCHEDULE.days.includes(d.getDay()) && !SCHEDULE.blockedDates.includes(date);
    const btn = document.createElement("button");
    btn.type="button";
    btn.className="date-btn"+(available?"":" disabled");
    btn.disabled=!available;
    btn.innerHTML=`<small>${d.toLocaleDateString("en-IN",{weekday:"short"})}</small><strong>${d.getDate()}</strong>`;
    if(available) btn.addEventListener("click",()=>selectDate(d,btn));
    dateGrid.appendChild(btn);
  }
}

function selectDate(d,btn){
  document.querySelectorAll(".date-btn").forEach(x=>x.classList.remove("selected"));
  btn.classList.add("selected");
  selectedDate=iso(d);
  selectedTime=null;
  renderTimes();
  updateSummary();
}

function renderTimes(){
  timeGrid.innerHTML="";
  if(!selectedDate){timeGrid.innerHTML='<p class="empty-state">Choose a date first.</p>';return}
  const duration = service.value==="Detailed Chart Reading"?90:service.value==="Personal Consultation"?60:30;
  const slots=[];
  for(let mins=SCHEDULE.startHour*60; mins+duration<=SCHEDULE.endHour*60; mins+=SCHEDULE.slotMinutes){
    const h=Math.floor(mins/60), m=mins%60;
    const key=`${selectedDate}T${pad(h)}:${pad(m)}`;
    if(!SCHEDULE.bookedSlots.includes(key)) slots.push({key,h,m});
  }
  if(!slots.length){timeGrid.innerHTML='<p class="empty-state">No slots are available for this date.</p>';return}
  slots.forEach(s=>{
    const btn=document.createElement("button");
    btn.type="button";btn.className="time-btn";
    const suffix=s.h>=12?"PM":"AM"; const h12=s.h%12||12;
    btn.textContent=`${h12}:${pad(s.m)} ${suffix}`;
    btn.addEventListener("click",()=>{
      document.querySelectorAll(".time-btn").forEach(x=>x.classList.remove("selected"));
      btn.classList.add("selected"); selectedTime=s.key; updateSummary();
    });
    timeGrid.appendChild(btn);
  });
}

function updateSummary(){
  if(selectedDate&&selectedTime){
    const d=new Date(selectedDate+"T00:00:00");
    const [_,h,m]=selectedTime.match(/T(\d+):(\d+)/);
    const hour=Number(h), suffix=hour>=12?"PM":"AM", h12=hour%12||12;
    summary.textContent=`${displayDate(d)} · ${h12}:${m} ${suffix}`;
    bookBtn.disabled=false;
  }else{
    summary.textContent="Select a date and time";
    bookBtn.disabled=true;
  }
}

service.addEventListener("change",()=>{selectedTime=null;renderTimes();updateSummary()});

document.querySelectorAll(".select-service").forEach(btn=>{
  btn.addEventListener("click",()=>{
    service.value=btn.dataset.service;
    document.getElementById("booking").scrollIntoView({behavior:"smooth"});
    renderTimes(); updateSummary();
  });
});

bookBtn.addEventListener("click",()=>{
  const name=document.getElementById("name").value.trim();
  const phone=document.getElementById("phone").value.trim();
  const email=document.getElementById("email").value.trim();
  const birth=document.getElementById("birth").value.trim();
  const question=document.getElementById("question").value.trim();
  if(!name||!phone||!email){message.textContent="Please enter your name, phone/WhatsApp number and email.";return}
  const text=[
    "Hello, I would like to book an astrology consultation.",
    `Service: ${service.value}`,
    `Date & time: ${summary.textContent}`,
    `Name: ${name}`,
    `Phone: ${phone}`,
    `Email: ${email}`,
    birth?`Birth details: ${birth}`:null,
    question?`Question/topic: ${question}`:null
  ].filter(Boolean).join("\n");
  // Replace this number with the astrologer's WhatsApp number.
  const whatsappNumber="919999999999";
  window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(text)}`,"_blank","noopener");
  message.textContent="Your booking request has been prepared. Complete the WhatsApp message to confirm the appointment.";
});

buildDates();
renderTimes();
