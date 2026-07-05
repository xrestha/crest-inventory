import { useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { scopedFrom, scopedInsert, scopedUpsert, scopedUpdate, scopedDelete } from '../scopedDb'

// Binds scopedDb's functions to the current session's clientId so call sites don't have to
// thread it through themselves. See scopedDb.js for what each function actually guards.
// Memoized on clientId so the returned functions have a stable identity across renders —
// otherwise any useCallback/useEffect depending on them (as ESLint's exhaustive-deps rule
// will require) would re-run on every render instead of only when clientId actually changes.
export function useScopedDb() {
  const { clientId } = useAuth()
  return useMemo(() => ({
    clientId,
    scopedFrom:   (table, columns) => scopedFrom(table, clientId, columns),
    scopedInsert: (table, row, options) => scopedInsert(table, clientId, row, options),
    scopedUpsert: (table, rows, options) => scopedUpsert(table, clientId, rows, options),
    scopedUpdate: (table, patch) => scopedUpdate(table, clientId, patch),
    scopedDelete: (table) => scopedDelete(table, clientId),
  }), [clientId])
}
