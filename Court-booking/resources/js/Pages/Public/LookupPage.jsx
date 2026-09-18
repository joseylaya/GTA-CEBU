import { Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PublicLayout from '../../Layouts/PublicLayout';
import { Field } from '../../Components/UI';
import { useDemo } from '../../App';

export default function LookupPage(){const {bookings}=useDemo();const nav=useNavigate();const [ref,setRef]=useState('PK7M42');const [mobile,setMobile]=useState('09176241183');const [error,setError]=useState('');const submit=(e)=>{e.preventDefault();const booking=bookings.find((b)=>b.reference.toLowerCase()===ref.trim().toLowerCase()&&b.mobile.replace(/\s/g,'')===mobile.replace(/\s/g,''));if(booking)nav(`/booking/${booking.reference}/manage`);else setError('We could not match that reference and mobile number.');};return <PublicLayout><div className="lookup-page"><div className="lookup-icon"><Search/></div><span className="eyebrow">MY BOOKING</span><h1>Find your Picklr reservation</h1><p>Enter the booking reference and mobile number used during checkout.</p><form className="flow-card" onSubmit={submit}><Field label="Booking reference"><input value={ref} onChange={(e)=>setRef(e.target.value.toUpperCase())}/></Field><Field label="Mobile number"><input value={mobile} onChange={(e)=>setMobile(e.target.value)} inputMode="tel"/></Field>{error&&<p className="form-error">{error}</p>}<button className="btn btn-primary full"><Search/>View booking</button><small className="demo-hint">Demo credentials are pre-filled for presentation.</small></form></div></PublicLayout>}
