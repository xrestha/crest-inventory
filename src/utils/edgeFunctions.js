import { supabase } from '../supabaseClient'

// Generalizes the action-dispatch invoke + error-unwrap pattern that was previously
// duplicated ad hoc as a private `edgeOp()` in Login.js (scoped to the admin-user-ops
// function only). New Edge Functions should call this instead of copy-pasting a third time.
export async function invokeEdge(functionName, action, params = {}) {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: { action, ...params },
  })
  if (error) {
    let detail = error.message || 'Error'
    try { const b = await error.context.json(); detail = b?.error?.message || b?.error || b?.message || detail } catch (_) {}
    throw new Error(detail)
  }
  if (data?.error) throw new Error(data.error.message || data.error || 'Failed')
  return data
}
