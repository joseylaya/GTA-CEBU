import { createContext, useContext, useMemo, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { seedBookings, seedBlocks } from './Data/bookings';
import HomePage from './Pages/Public/HomePage';
import BookingPage from './Pages/Public/BookingPage';
import DetailsPage from './Pages/Public/DetailsPage';
import ReviewPage from './Pages/Public/ReviewPage';
import CheckoutPage from './Pages/Public/CheckoutPage';
import ConfirmationPage from './Pages/Public/ConfirmationPage';
import LookupPage from './Pages/Public/LookupPage';
import ManageBookingPage from './Pages/Public/ManageBookingPage';
import LoginPage from './Pages/Admin/LoginPage';
import DashboardPage from './Pages/Admin/DashboardPage';
import SchedulePage from './Pages/Admin/SchedulePage';
import BookingsPage from './Pages/Admin/BookingsPage';
import CustomersPage from './Pages/Admin/CustomersPage';
import PaymentsPage from './Pages/Admin/PaymentsPage';
import SettingsPage from './Pages/Admin/SettingsPage';
import { endTime, makeReference } from './Utils/format';
import ChatSupport from './Components/ChatSupport';

const DemoContext = createContext(null);
export const useDemo = () => useContext(DemoContext);

function DemoProvider({ children }) {
  const [bookings, setBookings] = useState(seedBookings);
  const [blocks, setBlocks] = useState(seedBlocks);
  const [draft, setDraft] = useState({ courtId: 'court-1', date: '2026-09-15', start: '19:00', duration: 1, name: '', mobile: '', email: '', players: 1, notes: '', paymentMethod: 'QR Ph' });
  const [confirmation, setConfirmation] = useState(null);
  const addBooking = (input) => {
    const booking = { id: crypto.randomUUID(), reference: makeReference(), amount: 500 * (input.duration || 1), paid: input.paid ?? 0, end: input.end || endTime(input.start, input.duration || 1), paymentMethod: input.paymentMethod || 'Cash', paymentStatus: input.paymentStatus || 'Unpaid', status: input.status || 'Pending', source: input.source || 'Online', notes: input.notes || '', email: input.email || '', ...input };
    setBookings((all) => [booking, ...all]); setConfirmation(booking); return booking;
  };
  const updateBooking = (id, changes) => setBookings((all) => all.map((b) => b.id === id ? { ...b, ...changes } : b));
  const value = useMemo(() => ({ bookings, blocks, draft, confirmation, setDraft: (changes) => setDraft((d) => ({ ...d, ...changes })), setConfirmation, addBooking, updateBooking, addBlock: (block) => setBlocks((all) => [{ id: crypto.randomUUID(), ...block }, ...all]), removeBlock: (id) => setBlocks((all) => all.filter((b) => b.id !== id)) }), [bookings, blocks, draft, confirmation]);
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export default function App() {
  return <DemoProvider><Routes>
    <Route path="/" element={<HomePage />} />
    <Route path="/book" element={<BookingPage />} />
    <Route path="/book/details" element={<DetailsPage />} />
    <Route path="/book/review" element={<ReviewPage />} />
    <Route path="/checkout" element={<CheckoutPage />} />
    <Route path="/confirmation" element={<ConfirmationPage />} />
    <Route path="/booking/lookup" element={<LookupPage />} />
    <Route path="/booking/:reference/manage" element={<ManageBookingPage />} />
    <Route path="/admin/login" element={<LoginPage />} />
    <Route path="/admin" element={<DashboardPage />} />
    <Route path="/admin/schedule" element={<SchedulePage />} />
    <Route path="/admin/bookings" element={<BookingsPage />} />
    <Route path="/admin/customers" element={<CustomersPage />} />
    <Route path="/admin/payments" element={<PaymentsPage />} />
    <Route path="/admin/settings" element={<SettingsPage />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes><ChatSupport /></DemoProvider>;
}
