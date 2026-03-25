import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'
import { migrateLocalDataToCloud, syncWithCloud } from '../lib/sync'

const SyncContext = createContext(null)

export function SyncProvider({ children }) {
  const { user } = useAuth()
  const [status, setStatus] = useState('idle')
  const [lastSyncedAt, setLastSyncedAt] = useState(null)
  const [lastMigratedAt, setLastMigratedAt] = useState(null)
  const [error, setError] = useState(null)
  const inFlightRef = useRef(false)

  const runExclusive = useCallback(async (mode, task) => {
    if (!user || !isSupabaseConfigured()) {
      return { skipped: true }
    }

    if (inFlightRef.current) {
      return { skipped: true }
    }

    inFlightRef.current = true
    setStatus(mode)
    setError(null)

    try {
      const result = await task()

      if (result?.syncedAt) {
        setLastSyncedAt(result.syncedAt)
      }

      if (result?.migratedAt) {
        setLastMigratedAt(result.migratedAt)
        setLastSyncedAt(result.migratedAt)
      }

      setStatus('idle')
      return result
    } catch (err) {
      console.error('Cloud sync error:', err)
      setError(err.message)
      setStatus('error')
      return { error: err }
    } finally {
      inFlightRef.current = false
    }
  }, [user])

  const syncNow = useCallback(() => {
    if (!user) return Promise.resolve({ skipped: true })
    return runExclusive('syncing', () => syncWithCloud(user.id))
  }, [runExclusive, user])

  const migrateLocalData = useCallback(() => {
    if (!user) return Promise.resolve({ skipped: true })
    return runExclusive('migrating', () => migrateLocalDataToCloud(user.id))
  }, [runExclusive, user])

  useEffect(() => {
    if (!user || !isSupabaseConfigured()) {
      setStatus('idle')
      setLastSyncedAt(null)
      setLastMigratedAt(null)
      setError(null)
      return undefined
    }

    syncNow()

    const intervalId = window.setInterval(() => {
      syncNow()
    }, 30000)

    const handleFocus = () => {
      syncNow()
    }

    window.addEventListener('focus', handleFocus)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', handleFocus)
    }
  }, [syncNow, user])

  return (
    <SyncContext.Provider
      value={{
        status,
        error,
        lastSyncedAt,
        lastMigratedAt,
        syncNow,
        migrateLocalData,
        isConfigured: isSupabaseConfigured()
      }}
    >
      {children}
    </SyncContext.Provider>
  )
}

export function useSync() {
  const context = useContext(SyncContext)

  if (!context) {
    throw new Error('useSync must be used inside SyncProvider')
  }

  return context
}
