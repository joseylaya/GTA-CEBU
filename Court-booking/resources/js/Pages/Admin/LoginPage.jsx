import { CalendarCheck, LockKeyhole } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { court } from '../../Data/court';
import { Field } from '../../Components/UI';

export default function LoginPage(){const nav=useNavigate();const [email,setEmail]=useState('owner@picklr.ph');const [password,setPassword]=useState('demo1234');return <div className="login-page"><Link className="login-brand" to="/"><span className="brand-court">PK</span><strong>{court.name}</strong></Link><section><div className="login-icon"><CalendarCheck/></div><span className="eyebrow">OWNER PORTAL</span><h1>Welcome back</h1><p>Manage both court schedules, bookings, and payments.</p><form onSubmit={(e)=>{e.preventDefault();nav('/admin')}}><Field label="Email"><input type="email" value={email} onChange={(e)=>setEmail(e.target.value)}/></Field><Field label="Password"><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)}/></Field><button className="btn btn-primary full"><LockKeyhole/>Sign in to dashboard</button><small>Demo access is pre-filled. No real authentication is performed.</small></form></section></div>}
