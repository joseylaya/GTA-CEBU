import { ArrowRight, CalendarDays, CheckCircle2, CloudSun, Lock, MapPin, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PublicLayout from '../../Layouts/PublicLayout';
import { court, courtById, courts } from '../../Data/court';
import { slots } from '../../Data/bookings';
import { useDemo } from '../../App';
import { displayDate, endTime, peso, timeLabel } from '../../Utils/format';

const dates = ['2026-09-14','2026-09-15','2026-09-16','2026-09-17','2026-09-18'];

export default function BookingPage() {
  const { draft, setDraft, bookings, blocks } = useDemo();
  const navigate = useNavigate();
  const selectedCourt = courtById(draft.courtId);
  const state = (slot) => bookings.some((booking) => booking.courtId === draft.courtId && booking.date === draft.date && booking.start === slot && !['Cancelled','No-show'].includes(booking.status)) ? 'booked' : blocks.some((block) => block.courtId === draft.courtId && block.date === draft.date && block.start <= slot && block.end > slot) ? 'blocked' : 'available';

  return <PublicLayout><div className="booking-layout"><div className="booking-main">
    <section className="booking-title"><div><span className="eyebrow">LIVE BOOKING</span><h1>Reserve a Picklr court</h1><p>Select a court, date, and available time.</p></div><span className="live-pill"><i/> Live schedule</span></section>
    <div className="facility-banner"><img src={court.hero} alt="Picklr indoor pickleball facility"/><div/><span><small>FACILITY STATUS</small><strong>Both courts open • 24°C</strong></span><CloudSun/></div>
    <section><div className="section-head"><h2>Select date</h2><span>September 2026</span></div><div className="date-strip">{dates.map((date) => { const d = new Date(`${date}T12:00:00`); return <button key={date} onClick={() => setDraft({ date })} className={draft.date === date ? 'selected' : ''}><small>{d.toLocaleDateString('en-PH',{weekday:'short'})}</small><strong>{d.getDate()}</strong></button>; })}</div></section>
    <section><div className="section-head"><h2>Select court</h2><span>2 indoor courts</span></div><div className="court-options">{courts.map((item) => <button key={item.id} className={`single-court ${draft.courtId === item.id ? 'selected' : ''}`} onClick={() => setDraft({ courtId: item.id })}><div><h3>{item.name}</h3><p>{item.type}</p><small>{item.description}</small></div>{draft.courtId === item.id && <CheckCircle2/>}</button>)}</div></section>
    <section><div className="section-head slot-head"><h2>Available slots</h2><div className="legend"><span><i/>Available</span><span><i className="sel"/>Selected</span><span><i className="busy"/>Booked</span></div></div><div className="slot-grid">{slots.map((slot) => { const slotState = state(slot); const selected = draft.start === slot; return <button key={slot} disabled={slotState !== 'available'} className={`${slotState} ${selected ? 'selected' : ''}`} onClick={() => setDraft({ start: slot, duration: 1 })}><span><strong>{timeLabel(slot)}</strong><small>{slotState === 'available' ? '60 min' : slotState === 'booked' ? 'Reserved' : 'Unavailable'}</small></span>{slotState === 'available' ? <em>{selected ? 'Selected' : `${peso(selectedCourt.hourlyRate)}/hr`}</em> : <Lock size={17}/>}</button>; })}</div></section>
    <div className="amenity"><ShieldCheck/><span><strong>Equipment assistance included</strong><small>Clean changing area and cold drinking water available.</small></span></div>
  </div><aside className="booking-summary"><div className="summary-head"><span><CalendarDays/> Booking summary</span><small>{displayDate(draft.date,{short:true})}</small></div><dl><div><dt>Court selected</dt><dd>{selectedCourt.name} — {selectedCourt.type}</dd></div><div><dt>Time slot</dt><dd>{timeLabel(draft.start)} – {timeLabel(endTime(draft.start))}</dd></div><div className="summary-total"><dt>Court rental total</dt><dd>{peso(selectedCourt.hourlyRate)}</dd></div></dl><button className="btn btn-primary" onClick={() => navigate('/book/details')}>Proceed to details <ArrowRight size={18}/></button><p><MapPin size={14}/>{court.shortLocation}</p></aside></div></PublicLayout>;
}
