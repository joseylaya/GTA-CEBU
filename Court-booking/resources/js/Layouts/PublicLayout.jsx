import { CalendarDays, CircleUserRound, Home, Search } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { court } from '../Data/court';

export default function PublicLayout({ children, compact = false }) {
  const location = useLocation();
  return <div className="public-shell">
    <header className="public-header"><Link to="/" className="brand-mark"><span className="brand-court">PK</span><span><strong>{compact ? 'Picklr Booking' : court.name}</strong><small>{court.shortLocation} • 2 Indoor Courts</small></span></Link><Link to="/admin/login" className="avatar" aria-label="Owner portal"><CircleUserRound size={19} /></Link></header>
    <main className="public-main">{children}</main>
    <nav className="mobile-nav"><Link className={location.pathname === '/' ? 'active' : ''} to="/"><Home /><span>Home</span></Link><Link className={location.pathname.startsWith('/book') || location.pathname === '/checkout' ? 'active' : ''} to="/book"><CalendarDays /><span>Book Court</span></Link><Link className={location.pathname.includes('booking') ? 'active' : ''} to="/booking/lookup"><Search /><span>My Booking</span></Link></nav>
  </div>;
}
