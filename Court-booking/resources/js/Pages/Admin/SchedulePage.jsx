import { Ban, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Fragment, useState } from 'react';
import AdminLayout from '../../Layouts/AdminLayout';
import { BookingModal, BlockModal } from '../../Components/BookingModal';
import BookingDetailModal from '../../Components/BookingDetailModal';
import { Badge } from '../../Components/UI';
import { useDemo } from '../../App';
import { slots } from '../../Data/bookings';
import { shortDate, timeLabel } from '../../Utils/format';
import { courts } from '../../Data/court';

const dates = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'];

export default function SchedulePage() {
  const { bookings, blocks, addBooking, addBlock, removeBlock, updateBooking } = useDemo();
  const [view, setView] = useState('Week');
  const [courtId, setCourtId] = useState('court-1');
  const [adding, setAdding] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [selected, setSelected] = useState(null);
  const cell = (date, slot) => {
    const booking = bookings.find((item) => item.courtId === courtId && item.date === date && item.start === slot && item.status !== 'Cancelled');
    const block = blocks.find((item) => item.courtId === courtId && item.date === date && item.start <= slot && item.end > slot);
    if (booking) return <button className={`schedule-event status-${booking.status.toLowerCase()}`} onClick={() => setSelected(booking)}><strong>{booking.customer}</strong><small>{timeLabel(booking.start)} • {booking.paymentStatus}</small></button>;
    if (block) return <button className="schedule-event blocked" onClick={() => confirm('Unblock this time?') && removeBlock(block.id)}><strong>BLOCKED</strong><small>{block.reason}</small></button>;
    return <button className="schedule-add" onClick={() => setAdding(true)}>+</button>;
  };
  const action = <div className="action-row"><button className="btn btn-secondary" onClick={() => setBlocking(true)}><Ban />Block slot</button><button className="btn btn-primary" onClick={() => setAdding(true)}><Plus />Add booking</button></div>;
  return <AdminLayout title="Schedule" subtitle="Manage Picklr Court 1 and Court 2 reservations" action={action}>
    <section className="panel schedule-panel"><div className="calendar-toolbar"><div className="cal-nav"><button onClick={() => alert('Previous week loaded in the demo.')}><ChevronLeft /></button><button>Today</button><button onClick={() => alert('Next week loaded in the demo.')}><ChevronRight /></button><strong>September 14–20, 2026</strong></div><div className="view-toggle"><button className={view === 'Day' ? 'active' : ''} onClick={() => setView('Day')}>Day</button><button className={view === 'Week' ? 'active' : ''} onClick={() => setView('Week')}>Week</button></div></div>
      <div className="calendar-legend"><select aria-label="Court schedule" value={courtId} onChange={(event)=>setCourtId(event.target.value)}>{courts.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select><Badge tone="green">Confirmed</Badge><Badge tone="amber">Pending</Badge><Badge>Blocked</Badge></div>
      {view === 'Week' ? <div className="week-calendar"><div className="corner" />{dates.map((date) => <div className="day-head" key={date}><small>{new Date(`${date}T12:00`).toLocaleDateString('en-PH', { weekday: 'short' })}</small><strong>{new Date(`${date}T12:00`).getDate()}</strong></div>)}{slots.map((slot) => <Fragment key={slot}><time>{timeLabel(slot)}</time>{dates.map((date) => <div className="schedule-cell" key={`${date}-${slot}`}>{cell(date, slot)}</div>)}</Fragment>)}</div> : <div className="day-calendar"><h3>{shortDate(dates[0])}</h3>{slots.map((slot) => <div key={slot}><time>{timeLabel(slot)}</time>{cell(dates[0], slot)}</div>)}</div>}
    </section>
    {adding && <BookingModal onClose={() => setAdding(false)} onSave={(data) => { addBooking({ ...data, duration: 1, paid: data.paymentStatus === 'Paid' ? 500 : 0 }); setAdding(false); }} />}
    {blocking && <BlockModal onClose={() => setBlocking(false)} onSave={(data) => { addBlock(data); setBlocking(false); }} />}
    {selected && <BookingDetailModal booking={selected} onClose={() => setSelected(null)} onEdit={() => alert('Edit this booking from the Bookings page.')} onUpdate={(changes) => { updateBooking(selected.id, changes); setSelected({ ...selected, ...changes }); }} />}
  </AdminLayout>;
}
