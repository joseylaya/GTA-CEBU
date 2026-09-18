import { useState } from 'react';
import { Button, Field, Modal } from './UI';
import { slots } from '../Data/bookings';
import { courtById, courts } from '../Data/court';
import { timeLabel } from '../Utils/format';

export function BookingModal({ onClose, onSave, initial }) {
  const [form,setForm]=useState(initial||{courtId:'court-1',customer:'',mobile:'',email:'',players:1,date:'2026-09-14',start:'17:00',paymentMethod:'Cash',paymentStatus:'Paid',status:'Confirmed',source:'Walk-in',notes:''});
  const set=(key,value)=>setForm((current)=>({...current,[key]:value}));
  return <Modal title={initial?'Edit booking':'Add walk-in booking'} onClose={onClose}><form onSubmit={(event)=>{event.preventDefault();onSave(form)}} className="modal-form"><div className="form-grid two">
    <Field label="Court"><select value={form.courtId} onChange={(event)=>set('courtId',event.target.value)}>{courts.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
    <Field label="Customer"><input required value={form.customer} onChange={(event)=>set('customer',event.target.value)} placeholder="Customer name"/></Field>
    <Field label="Mobile number"><input required value={form.mobile} onChange={(event)=>set('mobile',event.target.value)} placeholder="0917 123 4567"/></Field>
    <Field label="Number of players"><input type="number" min="1" max="30" value={form.players||1} onChange={(event)=>set('players',Number(event.target.value))}/></Field>
    <Field label="Date"><input required type="date" value={form.date} onChange={(event)=>set('date',event.target.value)}/></Field>
    <Field label="Time"><select value={form.start} onChange={(event)=>set('start',event.target.value)}>{slots.map((slot)=><option value={slot} key={slot}>{timeLabel(slot)}</option>)}</select></Field>
    <Field label="Payment method"><select value={form.paymentMethod} onChange={(event)=>set('paymentMethod',event.target.value)}>{['Cash','GCash','Maya','QR Ph','Online Payment'].map((status)=><option key={status}>{status}</option>)}</select></Field>
    <Field label="Payment status"><select value={form.paymentStatus} onChange={(event)=>set('paymentStatus',event.target.value)}>{['Unpaid','Partially Paid','Paid','Refunded'].map((status)=><option key={status}>{status}</option>)}</select></Field>
    <Field label="Booking status"><select value={form.status} onChange={(event)=>set('status',event.target.value)}>{['Pending','Confirmed','Completed','Cancelled','No-show'].map((status)=><option key={status}>{status}</option>)}</select></Field>
    <Field label="Notes"><input value={form.notes} onChange={(event)=>set('notes',event.target.value)} placeholder="Optional booking notes"/></Field>
  </div><div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit">{initial?'Save changes':'Add booking'}</Button></div></form></Modal>;
}

export function BlockModal({ onClose, onSave, date='2026-09-14' }) {
  const [form,setForm]=useState({courtId:'court-1',date,start:'20:00',end:'21:00',reason:'Maintenance'});
  return <Modal title="Block court time" onClose={onClose}><form className="modal-form" onSubmit={(event)=>{event.preventDefault();onSave(form)}}><div className="form-grid two">
    <Field label="Court"><select value={form.courtId} onChange={(event)=>setForm({...form,courtId:event.target.value})}>{courts.map((item)=><option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
    <Field label="Date"><input type="date" value={form.date} onChange={(event)=>setForm({...form,date:event.target.value})}/></Field>
    <Field label="Start time"><input type="time" value={form.start} onChange={(event)=>setForm({...form,start:event.target.value})}/></Field>
    <Field label="End time"><input type="time" value={form.end} onChange={(event)=>setForm({...form,end:event.target.value})}/></Field>
    <Field label="Reason"><select value={form.reason} onChange={(event)=>setForm({...form,reason:event.target.value})}>{['Maintenance','Private event','Tournament','Owner reservation','Court closure'].map((reason)=><option key={reason}>{reason}</option>)}</select></Field>
  </div><div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit">Block {courtById(form.courtId).label}</Button></div></form></Modal>;
}
