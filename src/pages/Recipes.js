import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabaseClient'

const EMPTY_RECIPE = { name: '', category: 'Food', selling_price: '', vat_rate: '0.13' }
const RECIPE_CATS = ['Food', 'Beverage', 'Dessert', 'Snack', 'Other']

export default function Recipes() {
  const { clientId } = useAuth()
  const [recipes, setRecipes] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list') // list | edit | detail
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [recipeForm, setRecipeForm] = useState(EMPTY_RECIPE)
  const [ingredients, setIngredients] = useState([]) // [{ item_id, qty_per_portion, _key }]
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => { if (clientId) init() }, [clientId])

  async function init() {
    setLoading(true)
    const [{ data: r }, { data: i }] = await Promise.all([
      supabase.from('recipes').select('*, recipe_ingredients(*, items(name, uom, per_uom_rate))').eq('client_id', clientId).order('name'),
      supabase.from('items').select('*').eq('client_id', clientId).eq('is_active', true).order('name')
    ])
    setRecipes(r || [])
    setItems(i || [])
    setLoading(false)
  }

  function openNew() {
    setSelectedRecipe(null)
    setRecipeForm(EMPTY_RECIPE)
    setIngredients([{ _key: Date.now(), item_id: '', qty_per_portion: '' }])
    setError('')
    setView('edit')
  }

  function openEdit(recipe) {
    setSelectedRecipe(recipe)
    setRecipeForm({
      name: recipe.name,
      category: recipe.category || 'Food',
      selling_price: recipe.selling_price || '',
      vat_rate: recipe.vat_rate || '0.13'
    })
    const ings = (recipe.recipe_ingredients || []).map(ri => ({
      _key: ri.id,
      item_id: ri.item_id,
      qty_per_portion: ri.qty_per_portion
    }))
    setIngredients(ings.length > 0 ? ings : [{ _key: Date.now(), item_id: '', qty_per_portion: '' }])
    setError('')
    setView('edit')
  }

  function openDetail(recipe) {
    setSelectedRecipe(recipe)
    setView('detail')
  }

  function addIngredientRow() {
    setIngredients(prev => [...prev, { _key: Date.now(), item_id: '', qty_per_portion: '' }])
  }

  function removeIngredientRow(key) {
    setIngredients(prev => prev.filter(r => r._key !== key))
  }

  function updateIngredient(key, field, value) {
    setIngredients(prev => prev.map(r => r._key === key ? { ...r, [field]: value } : r))
  }

  // Calculate food cost from current ingredient inputs
  function calcFoodCost(ingList, itemsList) {
    let total = 0
    ingList.forEach(ing => {
      const item = itemsList.find(i => i.id === ing.item_id)
      if (!item || !ing.qty_per_portion) return
      total += parseFloat(ing.qty_per_portion) * parseFloat(item.per_uom_rate || 0)
    })
    return total
  }

  async function save() {
    if (!recipeForm.name.trim()) { setError('Recipe name is required.'); return }
    const validIngs = ingredients.filter(i => i.item_id && i.qty_per_portion > 0)
    if (validIngs.length === 0) { setError('Add at least one ingredient with qty.'); return }

    setSaving(true)
    setError('')

    const recipePayload = {
      client_id: clientId,
      name: recipeForm.name.trim(),
      category: recipeForm.category,
      selling_price: recipeForm.selling_price ? parseFloat(recipeForm.selling_price) : null,
      vat_rate: parseFloat(recipeForm.vat_rate) || 0.13,
      is_active: true
    }

    let recipeId
    if (selectedRecipe) {
      const { error } = await supabase.from('recipes').update(recipePayload).eq('id', selectedRecipe.id)
      if (error) { setError(error.message); setSaving(false); return }
      recipeId = selectedRecipe.id
      // Delete old ingredients
      await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipeId)
    } else {
      const { data, error } = await supabase.from('recipes').insert(recipePayload).select().single()
      if (error) { setError(error.message); setSaving(false); return }
      recipeId = data.id
    }

    // Insert ingredients
    const ingPayload = validIngs.map(ing => ({
      recipe_id: recipeId,
      item_id: ing.item_id,
      qty_per_portion: parseFloat(ing.qty_per_portion)
    }))
    const { error: ingError } = await supabase.from('recipe_ingredients').insert(ingPayload)
    if (ingError) { setError(ingError.message); setSaving(false); return }

    setSaving(false)
    setView('list')
    init()
  }

  async function toggleActive(recipe) {
    await supabase.from('recipes').update({ is_active: !recipe.is_active }).eq('id', recipe.id)
    init()
  }

  async function deleteRecipe(recipe) {
    if (!window.confirm(`Delete recipe "${recipe.name}"? This cannot be undone.`)) return
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipe.id)
    await supabase.from('recipes').delete().eq('id', recipe.id)
    init()
  }

  // Food cost calculation for a saved recipe
  function getRecipeCost(recipe) {
    return (recipe.recipe_ingredients || []).reduce((sum, ri) => {
      return sum + (parseFloat(ri.qty_per_portion) * parseFloat(ri.items?.per_uom_rate || 0))
    }, 0)
  }

  function getFoodCostPct(recipe) {
    const cost = getRecipeCost(recipe)
    const price = parseFloat(recipe.selling_price)
    if (!price) return null
    return (cost / price) * 100
  }

  function getSuggestedPrice(cost, vatRate = 0.13, targetFcPct = 0.30) {
    const basePrice = cost / targetFcPct
    return Math.ceil((basePrice * (1 + vatRate)) / 5) * 5 // round up to nearest 5
  }

  const filtered = recipes.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))

  // Live food cost in edit mode
  const liveCost = calcFoodCost(ingredients, items)
  const livePrice = parseFloat(recipeForm.selling_price) || 0
  const liveVat = parseFloat(recipeForm.vat_rate) || 0.13
  const liveFcPct = livePrice > 0 ? (liveCost / livePrice) * 100 : null
  const livePriceWithVat = livePrice * (1 + liveVat)
  const suggestedPrice = liveCost > 0 ? getSuggestedPrice(liveCost, liveVat) : null

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Recipe Costing</h1>
          <p className="page-subtitle">
            {view === 'list' && `${recipes.length} recipe${recipes.length !== 1 ? 's' : ''} — live food cost % per dish`}
            {view === 'edit' && (selectedRecipe ? `Editing: ${selectedRecipe.name}` : 'New Recipe')}
            {view === 'detail' && selectedRecipe?.name}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {view !== 'list' && (
            <button className="btn btn-ghost" onClick={() => setView('list')}>← Back</button>
          )}
          {view === 'list' && (
            <button className="btn btn-primary" onClick={openNew}>+ New Recipe</button>
          )}
        </div>
      </div>

      {/* LIST VIEW */}
      {view === 'list' && (
        <>
          <div style={{ marginBottom: 16 }}>
            <input
              style={{ background: '#181c27', border: '1px solid #2a2f3d', borderRadius: 6, padding: '8px 12px', fontSize: 13, color: '#e8e0d0', outline: 'none', width: 260 }}
              placeholder="Search recipes…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="card">
            {loading ? (
              <p style={{ color: '#6b7280', fontSize: 13 }}>Loading…</p>
            ) : filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">◈</div>
                <p className="empty-state-text">No recipes yet. Click + New Recipe to build your first costed dish.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Recipe</th>
                      <th>Category</th>
                      <th>Ingredients</th>
                      <th style={{ textAlign: 'right' }}>Food Cost</th>
                      <th style={{ textAlign: 'right' }}>Selling Price</th>
                      <th style={{ textAlign: 'right' }}>FC %</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(recipe => {
                      const cost = getRecipeCost(recipe)
                      const fcPct = getFoodCostPct(recipe)
                      const fcColor = fcPct == null ? '#6b7280' : fcPct <= 30 ? '#34d399' : fcPct <= 38 ? '#c9a84c' : '#f87171'
                      return (
                        <tr key={recipe.id}>
                          <td style={{ fontWeight: 600, color: '#e8e0d0', cursor: 'pointer' }}
                            onClick={() => openDetail(recipe)}>{recipe.name}</td>
                          <td><span className="badge badge-yellow">{recipe.category}</span></td>
                          <td style={{ color: '#6b7280' }}>{(recipe.recipe_ingredients || []).length} items</td>
                          <td style={{ textAlign: 'right', color: '#c9a84c' }}>
                            NPR {cost.toLocaleString('en-NP', { maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {recipe.selling_price
                              ? `NPR ${Number(recipe.selling_price).toLocaleString()}`
                              : <span style={{ color: '#4b5563' }}>—</span>}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: fcColor }}>
                            {fcPct != null ? `${fcPct.toFixed(1)}%` : '—'}
                          </td>
                          <td>
                            <span className={`badge ${recipe.is_active ? 'badge-green' : 'badge-gray'}`}>
                              {recipe.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }}
                                onClick={() => openEdit(recipe)}>Edit</button>
                              <button className="btn btn-danger" style={{ fontSize: 11, padding: '4px 8px' }}
                                onClick={() => deleteRecipe(recipe)}>Del</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* EDIT VIEW */}
      {view === 'edit' && (
        <div>
          {/* Recipe details */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ margin: '0 0 18px', fontSize: 14, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recipe Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 16 }}>
              <div className="form-field">
                <label>Recipe / Dish Name *</label>
                <input value={recipeForm.name}
                  onChange={e => setRecipeForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Mango Sticky Rice" autoFocus />
              </div>
              <div className="form-field">
                <label>Category</label>
                <select value={recipeForm.category}
                  onChange={e => setRecipeForm(f => ({ ...f, category: e.target.value }))}>
                  {RECIPE_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Selling Price (NPR, excl. VAT)</label>
                <input type="number" value={recipeForm.selling_price}
                  onChange={e => setRecipeForm(f => ({ ...f, selling_price: e.target.value }))}
                  placeholder="0" />
              </div>
              <div className="form-field">
                <label>VAT Rate</label>
                <select value={recipeForm.vat_rate}
                  onChange={e => setRecipeForm(f => ({ ...f, vat_rate: e.target.value }))}>
                  <option value="0.13">13% (VAT)</option>
                  <option value="0">0% (No VAT)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Live cost panel */}
          {liveCost > 0 && (
            <div style={{
              background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)',
              borderRadius: 8, padding: '16px 20px', marginBottom: 20,
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16
            }}>
              <div>
                <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Food Cost</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#c9a84c' }}>NPR {liveCost.toFixed(2)}</div>
              </div>
              {livePrice > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Food Cost %</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: liveFcPct <= 30 ? '#34d399' : liveFcPct <= 38 ? '#c9a84c' : '#f87171' }}>
                    {liveFcPct?.toFixed(1)}%
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                    {liveFcPct <= 30 ? '✓ Good' : liveFcPct <= 38 ? '⚠ Acceptable' : '✗ Too high'}
                  </div>
                </div>
              )}
              {livePrice > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Menu Price (incl. VAT)</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#e8e0d0' }}>NPR {livePriceWithVat.toFixed(0)}</div>
                </div>
              )}
              {suggestedPrice && (
                <div>
                  <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>Suggested Price @ 30% FC</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#34d399' }}>NPR {suggestedPrice}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>incl. {(liveVat * 100).toFixed(0)}% VAT, rounded</div>
                </div>
              )}
            </div>
          )}

          {/* Ingredients */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 14, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ingredients</h3>
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={addIngredientRow}>+ Add Row</button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', fontSize: 11, color: '#6b7280', padding: '0 0 10px', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ingredient</th>
                  <th style={{ textAlign: 'right', fontSize: 11, color: '#6b7280', padding: '0 12px 10px', letterSpacing: '0.08em', textTransform: 'uppercase', width: 130 }}>Qty per Portion</th>
                  <th style={{ textAlign: 'left', fontSize: 11, color: '#6b7280', padding: '0 12px 10px', letterSpacing: '0.08em', textTransform: 'uppercase', width: 60 }}>UOM</th>
                  <th style={{ textAlign: 'right', fontSize: 11, color: '#6b7280', padding: '0 12px 10px', letterSpacing: '0.08em', textTransform: 'uppercase', width: 100 }}>Cost</th>
                  <th style={{ width: 36 }}></th>
                </tr>
              </thead>
              <tbody>
                {ingredients.map(ing => {
                  const item = items.find(i => i.id === ing.item_id)
                  const cost = item && ing.qty_per_portion
                    ? parseFloat(ing.qty_per_portion) * parseFloat(item.per_uom_rate || 0)
                    : null
                  return (
                    <tr key={ing._key}>
                      <td style={{ padding: '6px 0' }}>
                        <select
                          value={ing.item_id}
                          onChange={e => updateIngredient(ing._key, 'item_id', e.target.value)}
                          style={{ background: '#0f1117', border: '1px solid #2a2f3d', borderRadius: 5, padding: '7px 10px', fontSize: 13, color: '#e8e0d0', outline: 'none', width: '100%' }}
                        >
                          <option value="">— Select ingredient —</option>
                          {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '6px 12px', textAlign: 'right' }}>
                        <input
                          type="number" min="0"
                          value={ing.qty_per_portion}
                          onChange={e => updateIngredient(ing._key, 'qty_per_portion', e.target.value)}
                          placeholder="0"
                          style={{ background: '#0f1117', border: '1px solid #2a2f3d', borderRadius: 5, padding: '7px 10px', fontSize: 13, color: '#e8e0d0', outline: 'none', width: 100, textAlign: 'right' }}
                        />
                      </td>
                      <td style={{ padding: '6px 12px', color: '#6b7280', fontSize: 13 }}>
                        {item?.uom || '—'}
                      </td>
                      <td style={{ padding: '6px 12px', textAlign: 'right', color: '#c9a84c', fontSize: 13, fontWeight: 600 }}>
                        {cost != null ? `NPR ${cost.toFixed(2)}` : '—'}
                      </td>
                      <td style={{ padding: '6px 0', textAlign: 'right' }}>
                        <button
                          onClick={() => removeIngredientRow(ing._key)}
                          style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
                        >×</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {error && <p style={{ color: '#f87171', fontSize: 13, margin: '0 0 16px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setView('list')}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : selectedRecipe ? 'Update Recipe' : 'Save Recipe'}
            </button>
          </div>
        </div>
      )}

      {/* DETAIL VIEW */}
      {view === 'detail' && selectedRecipe && (() => {
        const cost = getRecipeCost(selectedRecipe)
        const fcPct = getFoodCostPct(selectedRecipe)
        const price = parseFloat(selectedRecipe.selling_price) || 0
        const vat = parseFloat(selectedRecipe.vat_rate) || 0.13
        const priceWithVat = price * (1 + vat)
        const suggested = getSuggestedPrice(cost, vat)
        const fcColor = fcPct == null ? '#6b7280' : fcPct <= 30 ? '#34d399' : fcPct <= 38 ? '#c9a84c' : '#f87171'

        return (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 24 }}>
              {[
                { label: 'Food Cost', value: `NPR ${cost.toFixed(2)}`, color: '#c9a84c' },
                { label: 'Food Cost %', value: fcPct != null ? `${fcPct.toFixed(1)}%` : '—', color: fcColor },
                { label: 'Selling Price (ex. VAT)', value: price ? `NPR ${price.toLocaleString()}` : '—', color: '#e8e0d0' },
                { label: `Menu Price (incl. ${(vat*100).toFixed(0)}% VAT)`, value: price ? `NPR ${priceWithVat.toFixed(0)}` : '—', color: '#e8e0d0' },
                { label: 'Suggested @ 30% FC', value: `NPR ${suggested}`, color: '#34d399' },
              ].map(s => (
                <div key={s.label} className="stat-card">
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value" style={{ fontSize: 18, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div className="card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ingredient</th>
                    <th style={{ textAlign: 'right' }}>Qty per Portion</th>
                    <th>UOM</th>
                    <th style={{ textAlign: 'right' }}>Per UOM Rate</th>
                    <th style={{ textAlign: 'right' }}>Cost</th>
                    <th style={{ textAlign: 'right' }}>% of Dish Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedRecipe.recipe_ingredients || []).map(ri => {
                    const itemCost = parseFloat(ri.qty_per_portion) * parseFloat(ri.items?.per_uom_rate || 0)
                    const pctOfDish = cost > 0 ? (itemCost / cost) * 100 : 0
                    return (
                      <tr key={ri.id}>
                        <td style={{ fontWeight: 600, color: '#e8e0d0' }}>{ri.items?.name}</td>
                        <td style={{ textAlign: 'right' }}>{ri.qty_per_portion}</td>
                        <td style={{ color: '#6b7280' }}>{ri.items?.uom}</td>
                        <td style={{ textAlign: 'right', color: '#6b7280' }}>
                          NPR {parseFloat(ri.items?.per_uom_rate || 0).toFixed(4)}
                        </td>
                        <td style={{ textAlign: 'right', color: '#c9a84c', fontWeight: 600 }}>
                          NPR {itemCost.toFixed(2)}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                            <div style={{ width: 60, height: 4, background: '#2a2f3d', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(pctOfDish, 100)}%`, height: '100%', background: '#c9a84c', borderRadius: 2 }} />
                            </div>
                            <span style={{ fontSize: 12, color: '#9ca3af', minWidth: 36 }}>{pctOfDish.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  <tr style={{ borderTop: '2px solid #2a2f3d' }}>
                    <td colSpan={4} style={{ fontWeight: 700, color: '#9ca3af', paddingTop: 12 }}>Total Food Cost</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#c9a84c', fontSize: 15, paddingTop: 12 }}>
                      NPR {cost.toFixed(2)}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => openEdit(selectedRecipe)}>Edit Recipe</button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
