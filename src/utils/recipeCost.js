// Shared recipe-costing helpers (pure, no React/Supabase deps).

// Suggested menu price to hit a target food-cost %, VAT-inclusive and rounded up to the
// nearest NPR 5. `cost` is the per-portion food cost (ex-VAT), `targetFcPct` is a fraction
// (0.30 = 30%). Used by the Recipe Costing page and the Menu Repricing report.
export function getSuggestedPrice(cost, vatRate = 0.13, targetFcPct = 0.30) {
  const basePrice = cost / targetFcPct
  return Math.ceil((basePrice * (1 + vatRate)) / 5) * 5
}

// Food cost per portion for a set of recipes, including one level of sub-recipe nesting.
// Mirrors the cost calculation in src/pages/MenuPricing.js, scoped to an arbitrary recipe id
// list — used e.g. to value a complimentary/comp item at cost rather than menu price. Requires
// a live Supabase client since it fetches recipe_ingredients/items rates directly.
export async function computeRecipeCosts(supabase, recipeIds) {
  if (!recipeIds || recipeIds.length === 0) return {}

  const { data: ing } = await supabase
    .from('recipe_ingredients')
    .select('recipe_id, qty_per_portion, item_id, sub_recipe_id, items(per_uom_rate, yield_pct)')
    .in('recipe_id', recipeIds)

  const subIds = [...new Set((ing || []).map(r => r.sub_recipe_id).filter(Boolean))]
  let subRecipes = [], subIng = []
  if (subIds.length > 0) {
    const [{ data: sr }, { data: si }] = await Promise.all([
      supabase.from('recipes').select('id, yield_qty').in('id', subIds),
      supabase.from('recipe_ingredients').select('recipe_id, qty_per_portion, item_id, sub_recipe_id, items(per_uom_rate, yield_pct)').in('recipe_id', subIds),
    ])
    subRecipes = sr || []
    subIng = si || []
  }

  function subCostPerUnit(srId, depth) {
    if (depth > 5) return 0 // guard against runaway/cyclic sub-recipe refs
    const sr = subRecipes.find(r => r.id === srId)
    if (!sr) return 0
    let total = 0
    for (const r of subIng.filter(x => x.recipe_id === srId)) {
      if (r.item_id && r.items) {
        const yf = (parseFloat(r.items.yield_pct) || 100) / 100
        total += (parseFloat(r.qty_per_portion || 0) / yf) * parseFloat(r.items.per_uom_rate || 0)
      } else if (r.sub_recipe_id) {
        total += parseFloat(r.qty_per_portion || 0) * subCostPerUnit(r.sub_recipe_id, depth + 1)
      }
    }
    return total / (parseFloat(sr.yield_qty) || 1)
  }

  const costMap = {}
  for (const r of (ing || [])) {
    if (r.item_id && r.items) {
      const yf = (parseFloat(r.items.yield_pct) || 100) / 100
      costMap[r.recipe_id] = (costMap[r.recipe_id] || 0) + (parseFloat(r.qty_per_portion || 0) / yf) * parseFloat(r.items.per_uom_rate || 0)
    } else if (r.sub_recipe_id) {
      costMap[r.recipe_id] = (costMap[r.recipe_id] || 0) + parseFloat(r.qty_per_portion || 0) * subCostPerUnit(r.sub_recipe_id, 1)
    }
  }
  return costMap
}
