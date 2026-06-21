const DB_NAME = 'crest-offline'
const DB_VERSION = 1

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('items_cache'))      db.createObjectStore('items_cache',      { keyPath: 'client_id' })
      if (!db.objectStoreNames.contains('categories_cache')) db.createObjectStore('categories_cache', { keyPath: 'client_id' })
      if (!db.objectStoreNames.contains('periods_cache'))    db.createObjectStore('periods_cache',    { keyPath: 'client_id' })
      if (!db.objectStoreNames.contains('stock_cache'))      db.createObjectStore('stock_cache',      { keyPath: 'period_id' })
      if (!db.objectStoreNames.contains('sync_queue'))       db.createObjectStore('sync_queue',       { keyPath: 'id', autoIncrement: true })
    }
    req.onsuccess = e => resolve(e.target.result)
    req.onerror  = e => reject(e.target.error)
  })
}

async function idbPut(storeName, record) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).put(record)
    tx.oncomplete = () => resolve()
    tx.onerror    = e => reject(e.target.error)
  })
}

async function idbGet(storeName, key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).get(key)
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}

async function idbGetAll(storeName) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).getAll()
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}

async function idbDelete(storeName, key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    tx.objectStore(storeName).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror    = e => reject(e.target.error)
  })
}

// ── Item / category / period caches ────────────────────────────────────────

export async function cacheItems(clientId, items) {
  await idbPut('items_cache', { client_id: clientId, items, updated_at: Date.now() })
}
export async function getCachedItems(clientId) {
  const rec = await idbGet('items_cache', clientId)
  return rec?.items || null
}

export async function cacheCategories(clientId, categories) {
  await idbPut('categories_cache', { client_id: clientId, categories, updated_at: Date.now() })
}
export async function getCachedCategories(clientId) {
  const rec = await idbGet('categories_cache', clientId)
  return rec?.categories || null
}

export async function cachePeriods(clientId, periods) {
  await idbPut('periods_cache', { client_id: clientId, periods, updated_at: Date.now() })
}
export async function getCachedPeriods(clientId) {
  const rec = await idbGet('periods_cache', clientId)
  return rec?.periods || null
}

// ── Stock data cache ────────────────────────────────────────────────────────

export async function cacheStockData(periodId, payload) {
  await idbPut('stock_cache', { period_id: periodId, ...payload, updated_at: Date.now() })
}
export async function getCachedStockData(periodId) {
  return await idbGet('stock_cache', periodId)
}

// ── Sync queue ──────────────────────────────────────────────────────────────

export async function enqueue(op) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx  = db.transaction('sync_queue', 'readwrite')
    const req = tx.objectStore('sync_queue').add({ ...op, timestamp: Date.now() })
    req.onsuccess = e => resolve(e.target.result)
    tx.onerror    = e => reject(e.target.error)
  })
}
export async function getQueue() {
  return await idbGetAll('sync_queue')
}
export async function dequeue(id) {
  await idbDelete('sync_queue', id)
}
