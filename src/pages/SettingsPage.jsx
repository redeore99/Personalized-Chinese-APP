import { useEffect, useRef, useState } from 'react'
import { exportBackup, importBackup, downloadBlob } from '../lib/backup'
import { getLocalDataCounts } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import { useSync } from '../contexts/SyncContext'

function formatTimestamp(value) {
  if (!value) return 'Not yet'
  return new Date(value).toLocaleString()
}

function formatSyncStatus(status, error) {
  if (status === 'syncing') return 'Syncing with the cloud...'
  if (status === 'migrating') return 'Uploading this device data to the cloud...'
  if (status === 'error') return error || 'Cloud sync failed.'
  return 'Idle'
}

export default function SettingsPage({ onRefresh }) {
  const { user, signOut } = useAuth()
  const { status: syncStatus, error: syncError, lastSyncedAt, lastMigratedAt, syncNow, migrateLocalData } = useSync()

  const [backupPassword, setBackupPassword] = useState('')
  const [status, setStatus] = useState(null) // { type: 'success'|'error', message }
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [syncingNow, setSyncingNow] = useState(false)
  const [migratingNow, setMigratingNow] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [localCounts, setLocalCounts] = useState({
    cards: 0,
    decks: 0,
    reviewLog: 0,
    writingLog: 0
  })

  const fileInputRef = useRef(null)

  const refreshLocalCounts = async () => {
    const counts = await getLocalDataCounts()
    setLocalCounts(counts)
  }

  useEffect(() => {
    refreshLocalCounts()
  }, [])

  useEffect(() => {
    refreshLocalCounts()
  }, [lastSyncedAt, lastMigratedAt])

  const handleExport = async () => {
    if (backupPassword.trim().length < 4) {
      setStatus({ type: 'error', message: 'Enter a backup password to encrypt the backup.' })
      return
    }

    setExporting(true)
    setStatus(null)

    try {
      const blob = await exportBackup(backupPassword)
      const date = new Date().toISOString().slice(0, 10)
      downloadBlob(blob, `hanzi-backup-${date}.json`)
      setStatus({ type: 'success', message: 'Backup downloaded. Store it somewhere safe.' })
      setBackupPassword('')
    } catch (err) {
      setStatus({ type: 'error', message: 'Export failed: ' + err.message })
    }

    setExporting(false)
  }

  const handleImport = async file => {
    if (backupPassword.trim().length < 4) {
      setStatus({ type: 'error', message: 'Enter the backup password that was used to create the backup.' })
      return
    }

    setImporting(true)
    setStatus(null)

    try {
      const result = await importBackup(backupPassword, file)
      if (result.success) {
        setStatus({
          type: 'success',
          message: `${result.message} If you want these restored records online too, run "Upload Local Data to Cloud" below.`
        })
        await refreshLocalCounts()
        onRefresh?.()
      } else {
        setStatus({ type: 'error', message: result.message })
      }

      setBackupPassword('')
    } catch (err) {
      setStatus({ type: 'error', message: 'Import failed: ' + err.message })
    }

    setImporting(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSyncNow = async () => {
    setSyncingNow(true)
    setStatus(null)

    const result = await syncNow()
    if (result?.error) {
      setStatus({ type: 'error', message: result.error.message })
    } else if (!result?.skipped) {
      setStatus({ type: 'success', message: 'Cloud sync complete.' })
      await refreshLocalCounts()
      onRefresh?.()
    }

    setSyncingNow(false)
  }

  const handleMigrateLocalData = async () => {
    setMigratingNow(true)
    setStatus(null)

    const result = await migrateLocalData()
    if (result?.error) {
      setStatus({ type: 'error', message: result.error.message })
    } else if (!result?.skipped) {
      const counts = result.localCounts
      setStatus({
        type: 'success',
        message: `Uploaded local data to the cloud: ${counts.cards} cards, ${counts.decks} decks, ${counts.reviewLog} reviews, ${counts.writingLog} writing logs.`
      })
      await refreshLocalCounts()
      onRefresh?.()
    }

    setMigratingNow(false)
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    setStatus(null)

    const result = await signOut()
    if (result.error) {
      setStatus({ type: 'error', message: result.error.message })
    }

    setSigningOut(false)
  }

  return (
    <div className="page">
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>Settings</h2>
        <p className="text-secondary" style={{ fontSize: 14 }}>
          Account, cloud sync, backups, and device security
        </p>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Account</h3>
        <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.4 }}>
          Signed in as <strong>{user?.email || 'Unknown user'}</strong>.
        </p>
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleSignOut}
          disabled={signingOut}
          style={{ color: 'var(--error)' }}
        >
          {signingOut ? 'Signing out...' : 'Sign Out'}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Cloud Sync</h3>
        <p className="text-secondary" style={{ fontSize: 13, marginBottom: 8, lineHeight: 1.4 }}>
          {formatSyncStatus(syncStatus, syncError)}
        </p>
        <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
          Last sync: {formatTimestamp(lastSyncedAt)}<br />
          Local migration upload: {formatTimestamp(lastMigratedAt)}
        </p>

        <div className="card" style={{ padding: 14, marginBottom: 12, background: 'var(--bg-elevated)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>This device currently holds</div>
          <div className="text-secondary" style={{ fontSize: 13, lineHeight: 1.6 }}>
            {localCounts.cards} cards, {localCounts.decks} decks, {localCounts.reviewLog} reviews, {localCounts.writingLog} writing logs
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSyncNow}
            disabled={syncingNow || syncStatus === 'syncing' || syncStatus === 'migrating'}
          >
            {syncingNow || syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}
          </button>

          <button
            className="btn btn-secondary btn-sm"
            onClick={handleMigrateLocalData}
            disabled={migratingNow || syncStatus === 'syncing' || syncStatus === 'migrating'}
          >
            {migratingNow || syncStatus === 'migrating' ? 'Uploading...' : 'Upload Local Data to Cloud'}
          </button>
        </div>

        <p className="text-secondary" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
          Use the upload button once on each old device that already has local study data. It merges this browser&apos;s local records into your account.
        </p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <label className="label">Backup password</label>
        <input
          className="input"
          type="password"
          value={backupPassword}
          onChange={event => {
            setBackupPassword(event.target.value)
            setStatus(null)
          }}
          placeholder="Enter a backup password"
          maxLength={128}
          autoComplete="off"
          style={{ maxWidth: 280 }}
        />
        <p className="text-secondary" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.4 }}>
          This is separate from your account password. Use any strong password you can also enter on another device when restoring.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Export Backup</h3>
        <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.4 }}>
          Downloads an AES-256 encrypted file containing your local study data cache. This is still useful as an offline fallback even after cloud sync is enabled.
        </p>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? 'Encrypting...' : 'Export Encrypted Backup'}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Restore from Backup</h3>
        <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.4 }}>
          Replaces the current local study cache with the backup. After restoring, use "Upload Local Data to Cloud" if you want the restored data pushed into your account.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={event => {
            if (event.target.files[0]) handleImport(event.target.files[0])
          }}
        />
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
        >
          {importing ? 'Restoring...' : 'Import Backup File'}
        </button>
      </div>

      {status && (
        <div
          className="fade-in"
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            marginTop: 16,
            fontSize: 14,
            fontWeight: 500,
            background: status.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            color: status.type === 'success' ? 'var(--success)' : 'var(--error)'
          }}
        >
          {status.message}
        </div>
      )}
    </div>
  )
}
