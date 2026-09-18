export const court = {
  name: import.meta.env.VITE_APP_NAME || 'Picklr',
  venue: 'Picklr Cebu • Indoor Pickleball Club',
  location: '88 Archbishop Reyes Avenue, Cebu City',
  shortLocation: 'Cebu City',
  phone: '+63 917 842 2046',
  email: 'play@picklr.ph',
  hours: '5:00 PM – 11:00 PM',
  hourlyRate: 500,
  description: 'Two premium indoor pickleball courts built for after-work games, weekend matches, and community play in the heart of Cebu City.',
  hero: 'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=1600&q=88',
  gallery: [
    'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?auto=format&fit=crop&w=1200&q=85',
    'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?auto=format&fit=crop&w=1200&q=85',
    'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=1200&q=85'
  ],
  rules: ['Non-marking court shoes only', 'Arrive 10 minutes before your booking', 'Cancellations accepted up to 12 hours before play', 'Food is not allowed inside the playing area'],
};

export const courts = [
  { id: 'court-1', name: 'Picklr Court 1', label: 'Court 1', type: 'Indoor', hourlyRate: 500, description: 'Championship surface • Professional lighting' },
  { id: 'court-2', name: 'Picklr Court 2', label: 'Court 2', type: 'Indoor', hourlyRate: 500, description: 'Championship surface • Professional lighting' },
];

export const courtById = (id) => courts.find((item) => item.id === id) || courts[0];
