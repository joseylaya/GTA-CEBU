import { ArrowLeft, ArrowRight, CalendarDays, Clock3, MapPin, Pencil, UserRound } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import PublicLayout from '../../Layouts/PublicLayout';
import { court, courtById } from '../../Data/court';
import { useDemo } from '../../App';
import { displayDate, endTime, peso, timeLabel } from '../../Utils/format';

export default function ReviewPage() {
  const { draft } = useDemo(); const navigate = useNavigate(); const selectedCourt = courtById(draft.courtId);
  if (!draft.name) return <NavigateBack/>;
  return <PublicLayout compact><div className="narrow-flow"><div className="flow-top"><Link to="/book/details"><ArrowLeft/> Back to details</Link><span>STEP 3 OF 4</span></div><section className="flow-card"><span className="eyebrow">FINAL CHECK</span><h1>Review your booking</h1><p>Confirm the schedule and contact details before payment.</p><div className="review-group"><div><CalendarDays/><span><small>Date</small><strong>{displayDate(draft.date)}</strong></span></div><div><Clock3/><span><small>Time</small><strong>{timeLabel(draft.start)} – {timeLabel(endTime(draft.start))}</strong></span></div><div><MapPin/><span><small>Court</small><strong>{selectedCourt.name} • {selectedCourt.type}</strong><em>{court.location}</em></span></div></div><div className="review-customer"><div><UserRound/><span><small>Customer</small><strong>{draft.name}</strong><em>{draft.mobile}{draft.email && ` • ${draft.email}`} • {draft.players} {draft.players === 1 ? 'player' : 'players'}</em></span></div><Link to="/book/details"><Pencil/> Edit</Link></div>{draft.notes && <div className="notes-box"><small>Booking notes</small><p>{draft.notes}</p></div>}<div className="payment-summary"><div><span>{selectedCourt.name} rental</span><strong>{peso(selectedCourt.hourlyRate)}</strong></div><div><span>Required deposit</span><strong>{peso(250)}</strong></div><div className="due"><span>Total</span><strong>{peso(selectedCourt.hourlyRate)}</strong></div><p>The remaining balance can be paid at the court before play.</p></div><button className="btn btn-primary full" onClick={() => navigate('/checkout')}>Continue to payment <ArrowRight/></button></section></div></PublicLayout>;
}
function NavigateBack(){ return <PublicLayout><div className="empty"><h2>Start with a schedule</h2><p>Select your preferred court time before entering details.</p><Link className="btn btn-primary" to="/book">View schedule</Link></div></PublicLayout>; }
