const BASE = 'https://api.nal.usda.gov/fdc/v1'

// USDA FoodData Central nutrient IDs → our schema keys (all values are per 100 g)
const NUTRIENT_MAP = {
  1008: 'energy_kcal',
  1003: 'protein_g',
  1005: 'carbs_g',
  1004: 'fat_g',
  2000: 'sugar_g',  // SR Legacy / Foundation
  1063: 'sugar_g',  // older SR Legacy alternate ID
  1093: 'sodium_mg',
}

// Search USDA FoodData Central and return a nutrition payload, or null if not found.
// Falls back to DEMO_KEY (30 req/hr) if REACT_APP_USDA_API_KEY is not set.
export async function fetchUsdaNutrition(itemName) {
  const apiKey = process.env.REACT_APP_USDA_API_KEY || 'DEMO_KEY'
  const url =
    `${BASE}/foods/search` +
    `?query=${encodeURIComponent(itemName)}` +
    `&api_key=${apiKey}` +
    `&dataType=Foundation,SR%20Legacy` +
    `&pageSize=3`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const json = await res.json()
    const food = json.foods?.[0]
    if (!food) return null

    const out = { energy_kcal: null, protein_g: null, carbs_g: null, fat_g: null, sugar_g: null, sodium_mg: null }
    ;(food.foodNutrients || []).forEach(fn => {
      const key = NUTRIENT_MAP[fn.nutrientId]
      if (key && out[key] == null && fn.value != null) out[key] = fn.value
    })

    if (out.energy_kcal == null) return null

    return { basis_qty: 100, basis_unit: 'GM', ...out, allergens: '', source: 'USDA FDC' }
  } catch {
    return null
  }
}
