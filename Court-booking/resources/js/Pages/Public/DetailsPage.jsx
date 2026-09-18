import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import PublicLayout from '../../Layouts/PublicLayout';
import { Field } from '../../Components/UI';
import { useDemo } from '../../App';

export default function DetailsPage() {
  const { draft, setDraft } = useDemo(); const navigate = useNavigate();
  const valid = draft.name.trim().length > 2 && /^09\d{9}$/.test(draft.mobile.replace(/\s/g,''));
  return <PublicLayout compact><div className="narrow-flow"><div className="flow-top"><Link to="/book"><ArrowLeft/> Back to schedule</Link><span>STEP 2 OF 4</span></div><section className="flow-card"><span className="eyebrow">PLAYER DETAILS</span><h1>Who is this booking for?</h1><p>We’ll use these details for your confirmation and booking management.</p><div className="form-grid"><Field label="Full name"><input value={draft.name} onChange={(e) => setDraft({name:e.target.value})} placeholder="Juan Dela Cruz" autoFocus/></Field><Field label="Mobile number" hint="Use an active Philippine mobile number."><input value={draft.mobile} onChange={(e) => setDraft({mobile:e.target.value})} placeholder="0917 123 4567" inputMode="tel"/></Field><Field label="Email address (optional)"><input value={draft.email} onChange={(e) => setDraft({email:e.target.value})} placeholder="juan@email.com" type="email"/></Field><Field label="Number of players"><input value={draft.players} onChange={(e) => setDraft({players:Math.max(1, Number(e.target.value))})} type="number" inputMode="numeric" min="1" max="30"/></Field><Field label="Notes (optional)"><textarea value={draft.notes} onChange={(e) => setDraft({notes:e.target.value})} placeholder="Anything the court team should prepare?" rows="3"/></Field></div><div className="privacy-note"><ShieldCheck/><span><strong>Your details stay private.</strong><small>Used only for this reservation and court updates.</small></span></div><button disabled={!valid} className="btn btn-primary full" onClick={() => navigate('/book/review')}>Review booking <ArrowRight/></button></section></div></PublicLayout>;
}
