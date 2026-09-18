import { ArrowRight, CalendarCheck, Check, Clock3, MapPin, Phone, ShieldCheck, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import PublicLayout from '../../Layouts/PublicLayout';
import { court } from '../../Data/court';
import { peso } from '../../Utils/format';

export default function HomePage() {
  return <PublicLayout><div className="home-wrap">
    <section className="hero"><img src={court.hero} alt="Picklr indoor pickleball courts"/><div className="hero-shade"/><div className="hero-copy"><span className="live-pill"><i/> 2 courts • Live schedule</span><h1>Your court.<br/>Your time.</h1><p>Reserve one of Picklr Cebu’s two premium indoor pickleball courts in less than two minutes.</p><Link className="btn btn-primary hero-btn" to="/book">Book your court <ArrowRight size={18}/></Link></div></section>
    <section className="quick-facts"><div><MapPin/><span><small>Location</small><strong>{court.shortLocation}</strong></span></div><div><Clock3/><span><small>Open daily</small><strong>{court.hours}</strong></span></div><div><CalendarCheck/><span><small>Rate</small><strong>{peso(court.hourlyRate)}/hour</strong></span></div></section>
    <section className="story content-section"><div><span className="eyebrow">PLAY IN COMFORT</span><h2>A focused space for better games.</h2><p>{court.description}</p><div className="feature-row"><span><ShieldCheck/> Secure reservations</span><span><Sparkles/> Maintained daily</span></div></div><div className="gallery"><img src={court.gallery[1]} alt="Court equipment and playing area"/><img src={court.gallery[2]} alt="Fresh court lines and net"/></div></section>
    <section className="info-grid content-section"><article className="info-card"><h3>Simple pricing</h3><strong>{peso(court.hourlyRate)}<small> / hour</small></strong><p>One clear rate. Equipment assistance is available at reception.</p><Link to="/book">Check availability <ArrowRight size={16}/></Link></article><article className="info-card"><h3>Before you play</h3><ul>{court.rules.map((rule) => <li key={rule}><Check size={16}/>{rule}</li>)}</ul></article><article className="info-card contact-card"><h3>Questions?</h3><p>Our court team is available during operating hours.</p><a href={`tel:${court.phone}`}><Phone size={17}/>{court.phone}</a><a href={`mailto:${court.email}`}>{court.email}</a></article></section>
    <section className="final-cta"><div><span className="eyebrow">LIVE AVAILABILITY</span><h2>Ready for your next game?</h2><p>Choose a date and see open court times instantly.</p></div><Link className="btn btn-primary" to="/book">Book now <ArrowRight size={18}/></Link></section>
  </div></PublicLayout>;
}
