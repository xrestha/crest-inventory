// Roster shift templates — colours match the weekly roster board UI
export const SHIFT_TYPES = [
  { code: 'morning',   label: 'Morning',   color: '#3B82F6', start: '07:00', end: '15:00', hours: 8  },
  { code: 'afternoon', label: 'Afternoon', color: '#F59E0B', start: '13:00', end: '21:00', hours: 8  },
  { code: 'evening',   label: 'Evening',   color: '#8B5CF6', start: '17:00', end: '01:00', hours: 8  },
  { code: 'night',     label: 'Night',     color: '#1E293B', start: '21:00', end: '07:00', hours: 8  },
  { code: 'fullday',   label: 'Full Day',  color: '#10B981', start: '09:00', end: '18:00', hours: 9  },
  { code: 'split',     label: 'Split',     color: '#EC4899', start: null,    end: null,     hours: null },
]

export const SHIFT_BY_CODE = Object.fromEntries(SHIFT_TYPES.map(s => [s.code, s]))
