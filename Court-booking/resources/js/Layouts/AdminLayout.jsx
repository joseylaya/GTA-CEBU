import { CalendarDays, CreditCard, LayoutDashboard, LogOut, Menu, Settings, Users, X, BookOpen } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { court } from '../Data/court';

const links = [
  ['Dashboard', '/admin', LayoutDashboard], ['Schedule', '/admin/schedule', CalendarDays], ['Bookings', '/admin/bookings', BookOpen], ['Customers', '/admin/customers', Users], ['Payments', '/admin/payments', CreditCard], ['Settings', '/admin/settings', Settings],
];

export default function AdminLayout({ title, subtitle, action, children }) {
  const [open, setOpen] = useState(false); const location = useLocation(); const navigate = useNavigate();
  return <div className="admin-shell">
    <aside className={`sidebar ${open ? 'open' : ''}`}><div className="side-brand"><span className="brand-court">PK</span><span><strong>{court.name}</strong><small>2-court owner workspace</small></span><button className="icon-btn side-close" onClick={() => setOpen(false)}><X /></button></div><nav>{links.map(([label, path, Icon]) => <Link key={path} to={path} onClick={() => setOpen(false)} className={(path === '/admin' ? location.pathname === path : location.pathname.startsWith(path)) ? 'active' : ''}><Icon size={19}/><span>{label}</span></Link>)}</nav><button className="side-logout" onClick={() => navigate('/')}><LogOut size={18}/> Exit demo</button></aside>
    {open && <button aria-label="Close menu" className="side-overlay" onClick={() => setOpen(false)} />}
    <section className="admin-content"><header className="admin-header"><button className="menu-btn" onClick={() => setOpen(true)}><Menu /></button><div><h1>{title}</h1><p>{subtitle}</p></div>{action && <div className="admin-action">{action}</div>}<div className="owner-avatar">MR</div></header><main className="admin-main">{children}</main></section>
  </div>;
}
