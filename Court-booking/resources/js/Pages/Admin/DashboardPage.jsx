import { CalendarDays, CircleDollarSign, Clock3, CreditCard, Plus, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../Layouts/AdminLayout';
import { Metric, StatusBadge } from '../../Components/UI';
import { BookingModal } from '../../Components/BookingModal';
import BookingDetailModal from '../../Components/BookingDetailModal';
import { useDemo } from '../../App';
import { courts } from '../../Data/court';
import { peso, timeLabel } from '../../Utils/format';

const today = '2026-09-14';
const times = ['17:00','18:00','19:00','20:00','21:00','22:00'];

export default function DashboardPage() {
  const {bookings,blocks,addBooking,updateBooking}=useDemo();
  const [adding,setAdding]=useState(false);
  const [selected,setSelected]=useState(null);
  const day=bookings.filter((booking)=>booking.date===today&&booking.status!=='Cancelled');
  const revenue=day.reduce((sum,booking)=>sum+booking.paid,0);
  const occupied=new Set(day.map((booking)=>`${booking.courtId}-${booking.start}`));
  const blockedHours=blocks.filter((block)=>block.date===today).reduce((sum,block)=>sum+(Number(block.end.slice(0,2))-Number(block.start.slice(0,2))),0);
  const available=Math.max(0,(times.length*courts.length)-occupied.size-blockedHours);
  const action=<button className="btn btn-primary" onClick={()=>setAdding(true)}><Plus/>Add booking</button>;

  return <AdminLayout title="Good afternoon, Mia" subtitle="Monday, September 14 • Both Picklr courts at a glance" action={action}>
    <div className="metrics-grid"><Metric icon={CalendarDays} label="Today's bookings" value={day.length} detail={`${day.filter((booking)=>booking.source==='Online').length} online • ${day.filter((booking)=>booking.source==='Walk-in').length} walk-in`}/><Metric icon={CircleDollarSign} label="Today's revenue" value={peso(revenue)} detail="Across both courts"/><Metric icon={Clock3} label="Available court-hours" value={available} detail="Across Court 1 and Court 2"/><Metric icon={CreditCard} label="Pending payments" value={day.filter((booking)=>booking.paymentStatus!=='Paid').length} detail={`${peso(day.reduce((sum,booking)=>sum+booking.amount-booking.paid,0))} outstanding`}/></div>
    <div className="admin-two-col"><section className="panel"><div className="panel-head"><div><span className="eyebrow">TODAY</span><h2>Both court schedules</h2></div><Link to="/admin/schedule">View full schedule</Link></div><div className="timeline">{courts.flatMap((item)=>times.map((slot)=>{const booking=day.find((entry)=>entry.courtId===item.id&&entry.start===slot);const block=blocks.find((entry)=>entry.courtId===item.id&&entry.date===today&&entry.start<=slot&&entry.end>slot);return <button key={`${item.id}-${slot}`} className={booking?'timeline-booked':block?'timeline-blocked':'timeline-open'} onClick={()=>booking&&setSelected(booking)}><time>{timeLabel(slot)}</time><span>{booking?<><strong>{booking.customer}</strong><small>{item.label} • {booking.source}</small></>:block?<><strong>BLOCKED</strong><small>{item.label} • {block.reason}</small></>:<><strong>AVAILABLE</strong><small>{item.label}</small></>}</span>{booking&&<StatusBadge value={booking.status}/>}</button>}))}</div></section>
      <aside><section className="panel"><div className="panel-head"><div><span className="eyebrow">PERFORMANCE</span><h2>This week</h2></div><TrendingUp/></div><div className="week-stats"><strong>{peso(12500)}</strong><span>25 booked court-hours</span><div><i style={{width:'52%'}}/></div><small>52% combined court utilization</small></div></section><section className="panel compact-panel"><h3>Needs attention</h3><button onClick={()=>setSelected(day.find((booking)=>booking.paymentStatus==='Unpaid'))}><CreditCard/><span><strong>Unpaid reservation</strong><small>Picklr Court 1 • 9:00 PM</small></span></button><button onClick={()=>alert('Demo reminder queued for Mark Anthony Lim.')}><Clock3/><span><strong>Deposit balance due</strong><small>Picklr Court 2 • {peso(250)}</small></span></button></section></aside>
    </div>
    {adding&&<BookingModal onClose={()=>setAdding(false)} onSave={(data)=>{addBooking({...data,duration:1,paid:data.paymentStatus==='Paid'?500:0});setAdding(false)}}/>}
    {selected&&<BookingDetailModal booking={selected} onClose={()=>setSelected(null)} onEdit={()=>alert('Open Bookings to edit this reservation.')} onUpdate={(changes)=>{updateBooking(selected.id,changes);setSelected({...selected,...changes})}}/>}
  </AdminLayout>;
}
