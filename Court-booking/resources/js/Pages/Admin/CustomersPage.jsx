import { Mail, Search, Smartphone, Users } from 'lucide-react';
import { useState } from 'react';
import AdminLayout from '../../Layouts/AdminLayout';
import { customers } from '../../Data/bookings';
import { peso } from '../../Utils/format';

export default function CustomersPage(){const [q,setQ]=useState('');const shown=customers.filter((c)=>c.name.toLowerCase().includes(q.toLowerCase()));return <AdminLayout title="Customers" subtitle="Player relationships and booking history"><section className="panel"><div className="table-tools"><label><Search/><input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search customers"/></label><span className="record-count"><Users/>{shown.length} customers</span></div><div className="customer-grid">{shown.map((c)=><article key={c.mobile}><div className="customer-avatar">{c.name.split(' ').map((x)=>x[0]).slice(0,2)}</div><div><h3>{c.name}</h3><p><Smartphone/>{c.mobile}</p><p><Mail/>{c.email}</p></div><dl><div><dt>Bookings</dt><dd>{c.bookings}</dd></div><div><dt>Total spent</dt><dd>{peso(c.spent)}</dd></div><div><dt>Last visit</dt><dd>{c.lastVisit}</dd></div></dl><button onClick={()=>alert(`Booking history opened for ${c.name}.`)}>View booking history</button></article>)}</div></section></AdminLayout>}
