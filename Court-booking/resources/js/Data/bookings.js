export const seedBookings = [
  { id: 'b1', courtId: 'court-1', reference: 'PK7M42', customer: 'Jose Villanueva', mobile: '0917 624 1183', email: 'jose.villanueva@gmail.com', date: '2026-09-14', start: '18:00', end: '19:00', amount: 500, paid: 500, paymentMethod: 'GCash', paymentStatus: 'Paid', status: 'Confirmed', source: 'Online', notes: 'Please prepare two rental paddles.' },
  { id: 'b2', courtId: 'court-2', reference: 'PK4P18', customer: 'Mark Anthony Lim', mobile: '0928 315 7742', email: 'mark.lim@gmail.com', date: '2026-09-14', start: '18:00', end: '19:00', amount: 500, paid: 250, paymentMethod: 'Maya', paymentStatus: 'Partially Paid', status: 'Confirmed', source: 'Online', notes: '' },
  { id: 'b3', courtId: 'court-1', reference: 'PK9R63', customer: 'Cebu Pickleball Club', mobile: '0916 407 8621', email: 'captain@cebusmashers.ph', date: '2026-09-14', start: '21:00', end: '22:00', amount: 500, paid: 0, paymentMethod: 'Cash', paymentStatus: 'Unpaid', status: 'Pending', source: 'Walk-in', notes: 'Club practice, 8 players.' },
  { id: 'b4', courtId: 'court-2', reference: 'PK2V85', customer: 'Angela Dela Cruz', mobile: '0995 831 2047', email: 'angela.dc@gmail.com', date: '2026-09-15', start: '18:00', end: '19:00', amount: 500, paid: 500, paymentMethod: 'QR Ph', paymentStatus: 'Paid', status: 'Confirmed', source: 'Online', notes: '' },
  { id: 'b5', courtId: 'court-1', reference: 'PK6N24', customer: 'Rafael Mendoza', mobile: '0918 773 9025', email: 'rafmendoza@gmail.com', date: '2026-09-15', start: '20:00', end: '21:00', amount: 500, paid: 500, paymentMethod: 'GCash', paymentStatus: 'Paid', status: 'Completed', source: 'Online', notes: '' },
  { id: 'b6', courtId: 'court-2', reference: 'PK3K77', customer: 'Bianca Flores', mobile: '0927 665 4108', email: 'bianca.flores@gmail.com', date: '2026-09-16', start: '17:00', end: '18:00', amount: 500, paid: 0, paymentMethod: 'Online Payment', paymentStatus: 'Unpaid', status: 'Cancelled', source: 'Online', notes: 'Cancelled due to travel changes.' },
];

export const seedBlocks = [
  { id: 'x1', courtId: 'court-1', date: '2026-09-14', start: '20:00', end: '21:00', reason: 'Lighting maintenance' },
  { id: 'x2', courtId: 'court-2', date: '2026-09-14', start: '22:00', end: '23:00', reason: 'Court cleaning' },
  { id: 'x3', courtId: 'court-2', date: '2026-09-17', start: '19:00', end: '21:00', reason: 'Private event' },
];

export const customers = [
  { name: 'Jose Villanueva', mobile: '0917 624 1183', email: 'jose.villanueva@gmail.com', bookings: 12, spent: 6500, lastVisit: 'Sep 14, 2026' },
  { name: 'Mark Anthony Lim', mobile: '0928 315 7742', email: 'mark.lim@gmail.com', bookings: 8, spent: 4000, lastVisit: 'Sep 14, 2026' },
  { name: 'Angela Dela Cruz', mobile: '0995 831 2047', email: 'angela.dc@gmail.com', bookings: 6, spent: 3000, lastVisit: 'Sep 15, 2026' },
  { name: 'Rafael Mendoza', mobile: '0918 773 9025', email: 'rafmendoza@gmail.com', bookings: 5, spent: 2500, lastVisit: 'Sep 15, 2026' },
  { name: 'Cebu Pickleball Club', mobile: '0916 407 8621', email: 'captain@cebupickleball.ph', bookings: 16, spent: 9000, lastVisit: 'Sep 14, 2026' },
];

export const slots = ['17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];
