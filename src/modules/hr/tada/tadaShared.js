// Shared between the manager view (TadaClaims.jsx) and the Self-Service submit tab
// (SelfServiceHome.jsx) so the expense-line/vehicle-rate UI logic isn't duplicated.

export const CATEGORIES = ['Transport', 'Lodging', 'Daily Allowance', 'Other']
export const VEHICLE_TYPES = [
  { key: '2w', label: '2-Wheeler' },
  { key: '4w', label: '4-Wheeler' },
  { key: 'ev', label: 'EV' },
]
export const DEFAULT_PURPOSE_OPTIONS = ['Vendor site visit', 'Purchase', 'Bank errand', 'Client meeting', 'Delivery', 'Site inspection', 'Training / Conference']
export const OTHER_PURPOSE = '__other__'

// vehicle/distanceKm are UI-only — they drive the auto-computed Amount but are never persisted
// (hr_tada_claim_items only has category/description/amount).
export const EMPTY_TADA_ITEM = () => ({ category: 'Transport', description: '', amount: '', vehicle: '2w', distanceKm: '' })

// Live-recompute Amount whenever Distance or Vehicle changes on a Transport line — only
// overwrites Amount when both a distance and a configured rate exist, so it never clobbers a
// manually-typed Amount just because the rate isn't set up yet for that vehicle.
export function recomputeTadaAmount(it, distanceKm, vehicle, vehicleRates) {
  const dist = parseFloat(distanceKm) || 0
  const rate = vehicleRates[vehicle]
  return (dist > 0 && rate != null) ? String(Math.round(dist * rate)) : it.amount
}
