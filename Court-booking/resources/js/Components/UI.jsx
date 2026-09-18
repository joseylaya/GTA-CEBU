import { LoaderCircle, X } from 'lucide-react';

export function Button({ children, variant = 'primary', className = '', ...props }) {
  return <button className={`btn btn-${variant} ${className}`} {...props}>{children}</button>;
}

export function Badge({ children, tone = 'neutral' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatusBadge({ value }) {
  const tone = ({ Confirmed: 'green', Paid: 'green', Completed: 'blue', Pending: 'amber', 'Partially Paid': 'amber', Unpaid: 'red', Cancelled: 'neutral', Refunded: 'purple', 'No-show': 'red' })[value] || 'neutral';
  return <Badge tone={tone}>{value}</Badge>;
}

export function Metric({ icon: Icon, label, value, detail }) {
  return <div className="metric"><div className="metric-icon"><Icon size={20} /></div><div><p>{label}</p><strong>{value}</strong>{detail && <small>{detail}</small>}</div></div>;
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return <div className="empty"><Icon size={32} /><h3>{title}</h3><p>{text}</p>{action}</div>;
}

export function Modal({ title, children, onClose, wide = false }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className={`modal ${wide ? 'modal-wide' : ''}`}><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={20} /></button></div>{children}</div></div>;
}

export function LoadingState({ label = 'Loading schedule…' }) {
  return <div className="loading"><LoaderCircle className="spin" size={24} /><span>{label}</span></div>;
}

export function Field({ label, children, hint }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
