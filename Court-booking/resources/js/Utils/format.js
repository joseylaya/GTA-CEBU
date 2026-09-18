export const peso = (value) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0 }).format(value);

export const displayDate = (value, options = {}) => new Intl.DateTimeFormat('en-PH', {
  weekday: options.short ? undefined : 'long', month: 'long', day: 'numeric', year: 'numeric',
}).format(new Date(`${value}T12:00:00`));

export const shortDate = (value) => new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`));

export const timeLabel = (value) => {
  const [hour, minute] = value.split(':').map(Number);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`;
};

export const endTime = (start, hours = 1) => `${String(Number(start.slice(0, 2)) + hours).padStart(2, '0')}:00`;

export const makeReference = () => `PK${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
