// One-time backfill for pos_credit_notes issued before sales_entries' CHECK constraint allowed
// source='pos_credit' (migration 20260706170000_pos_item_comp_atomic_apply.sql). Every credit
// note's revenue-reversal insert has silently failed since Credit Notes shipped — see the
// try/catch around it in src/modules/pos/creditnotes/IssueCreditNoteModal.jsx. This reconstructs
// the missing rows from each note's original pos_order_items (excluding comped=true, matching
// the corrected live logic — a comped item was posted as source='pos_comp', never 'pos', so
// reversing it too would create a negative entry with nothing positive to offset).
//
// Posts each reversal into whichever monthly_periods row was open on the CREDIT NOTE's own
// issuance date (created_at) — replaying history as it should have been recorded, not dumping
// months of corrections into whatever period happens to be open today.
//
// Usage (from the project root):
//   node scripts/backfill-credit-note-reversals.mjs           # dry run — no writes
//   node scripts/backfill-credit-note-reversals.mjs --apply   # actually inserts the rows
//
// Reads REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_SERVICE_ROLE_KEY from .env.local (the same
// file and vars the app itself uses) — no new dependency, no secrets on the command line.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { adToBs } from '../src/utils/bsCalendar.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadEnvLocal() {
  const text = readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8')
  const env = {}
  for (const line of text.split('\n')) {
    const m = line.replace(/\r$/, '').match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

const env = loadEnvLocal()
const url = env.REACT_APP_SUPABASE_URL
const serviceKey = env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Missing REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

const APPLY = process.argv.includes('--apply')

async function main() {
  // Every 'pos_credit' insert has failed since day one (the CHECK constraint made it
  // impossible) — so this table should have zero pos_credit rows before this script's first
  // run. If it doesn't, someone already ran this (or something else wrote pos_credit rows) —
  // abort rather than guess which notes are already covered.
  const { count: existingCount, error: existingErr } = await supabase
    .from('sales_entries')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'pos_credit')
  if (existingErr) throw existingErr
  if (existingCount > 0) {
    console.error(`Found ${existingCount} existing 'pos_credit' row(s) already — this script may have already run. Aborting to avoid duplicate inserts. Review manually before re-running.`)
    process.exit(1)
  }

  const { data: notes, error: notesErr } = await supabase
    .from('pos_credit_notes')
    .select('id, client_id, order_id, created_at, original_invoice_label')
    .order('created_at')
  if (notesErr) throw notesErr

  const { data: periods, error: periodsErr } = await supabase
    .from('monthly_periods')
    .select('id, client_id, bs_year, bs_month')
  if (periodsErr) throw periodsErr

  let insertedRows = 0, notesFixed = 0, skippedNoPeriod = 0, skippedNoItems = 0

  for (const note of notes || []) {
    const label = note.original_invoice_label || note.id
    const bs = adToBs(new Date(note.created_at))
    const period = (periods || []).find(p => p.client_id === note.client_id && p.bs_year === bs.year && p.bs_month === bs.month)
    if (!period) {
      skippedNoPeriod++
      console.log(`SKIP (no monthly_periods row for ${bs.year}-${bs.month}): ${label}`)
      continue
    }

    const { data: items, error: itemsErr } = await supabase
      .from('pos_order_items')
      .select('recipe_id, qty, comped')
      .eq('order_id', note.order_id)
    if (itemsErr) throw itemsErr
    const payable = (items || []).filter(i => i.recipe_id && !i.comped)
    if (payable.length === 0) {
      skippedNoItems++
      console.log(`SKIP (no payable items found for order ${note.order_id}): ${label}`)
      continue
    }

    const rows = payable.map(i => ({
      period_id: period.id, recipe_id: i.recipe_id, bs_day: bs.day, qty_sold: -i.qty, source: 'pos_credit',
    }))

    if (APPLY) {
      const { error } = await supabase.from('sales_entries').insert(rows)
      if (error) { console.error(`FAILED ${label}:`, error.message); continue }
    }
    insertedRows += rows.length
    notesFixed++
    console.log(`${APPLY ? 'INSERTED' : 'WOULD INSERT'} ${rows.length} row(s) for ${label} → BS ${bs.year}-${bs.month}-${bs.day}`)
  }

  console.log('---')
  console.log(`Credit notes ${APPLY ? 'fixed' : 'that would be fixed'}: ${notesFixed}`)
  console.log(`Rows ${APPLY ? 'inserted' : 'that would be inserted'}: ${insertedRows}`)
  console.log(`Skipped (no matching period): ${skippedNoPeriod}`)
  console.log(`Skipped (no payable items): ${skippedNoItems}`)
  if (!APPLY) console.log('\nDry run only — re-run with --apply to actually write these rows.')
}

main().catch(e => { console.error(e); process.exit(1) })
