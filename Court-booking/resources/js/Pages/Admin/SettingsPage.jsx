import { Check, Clock3, Image, MapPin, Save, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import AdminLayout from '../../Layouts/AdminLayout';
import { Field } from '../../Components/UI';
import { court, courts } from '../../Data/court';

export default function SettingsPage() {
  const [saved,setSaved]=useState(false);
  const save=(event)=>{event.preventDefault();setSaved(true);setTimeout(()=>setSaved(false),2200)};
  return <AdminLayout title="Picklr settings" subtitle="Manage the venue and both courts"><form className="settings-form" onSubmit={save}>
    <section className="panel settings-section"><div className="settings-title"><MapPin/><div><h2>Venue information</h2><p>Shown on the official booking website.</p></div></div><div className="form-grid two"><Field label="Venue name"><input defaultValue={court.name}/></Field><Field label="Contact number"><input defaultValue={court.phone}/></Field><Field label="Address"><input defaultValue={court.location}/></Field><Field label="Contact email"><input defaultValue={court.email}/></Field><Field label="Description"><textarea rows="3" defaultValue={court.description}/></Field><Field label="Venue photo"><button type="button" className="upload-btn" onClick={()=>alert('Photo picker opened — demo action.')}><Image/>Replace cover photo</button></Field></div></section>
    <section className="panel settings-section"><div className="settings-title"><MapPin/><div><h2>Courts</h2><p>Configure each bookable court independently.</p></div></div><div className="form-grid two">{courts.map((item)=><div className="field" key={item.id}><label>{item.name}</label><input defaultValue={item.description}/><small>{item.type} • ₱{item.hourlyRate} per hour • Active</small></div>)}</div></section>
    <section className="panel settings-section"><div className="settings-title"><Clock3/><div><h2>Operating hours</h2><p>Default availability for both courts.</p></div></div><div className="hours-list">{['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map((day)=><div key={day}><strong>{day}</strong><label><input type="checkbox" defaultChecked/><span>Open</span></label><input type="time" defaultValue="17:00"/><span>to</span><input type="time" defaultValue="23:00"/></div>)}</div></section>
    <section className="panel settings-section"><div className="settings-title"><ShieldCheck/><div><h2>Booking rules & pricing</h2><p>Default rules for Picklr Court 1 and Court 2.</p></div></div><div className="form-grid two"><Field label="Default hourly rate"><input type="number" defaultValue="500"/></Field><Field label="Required deposit"><input type="number" defaultValue="250"/></Field><Field label="Advance booking limit"><select defaultValue="30"><option value="14">14 days</option><option value="30">30 days</option><option value="60">60 days</option></select></Field><Field label="Cancellation window"><select defaultValue="12"><option value="6">6 hours</option><option value="12">12 hours</option><option value="24">24 hours</option></select></Field></div></section>
    <div className="settings-save"><span>{saved&&<><Check/>Picklr settings saved for this demo session.</>}</span><button className="btn btn-primary"><Save/>Save settings</button></div>
  </form></AdminLayout>;
}
