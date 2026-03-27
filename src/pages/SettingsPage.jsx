import { useEffect, useRef, useState } from 'react'
import { exportBackup, importBackup, downloadBlob } from '../lib/backup'
import { getLocalDataCounts, refreshPlecoLinkedDecks } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import { useSync } from '../contexts/SyncContext'
import { getCloudDataCounts } from '../lib/sync'
import { parsePlecoImportFile } from '../lib/plecoImport'

function formatTimestamp(value) {
  if (!value) return 'Not yet'
  return new Date(value).toLocaleString()
}

function formatSyncStatus(status, error) {
  if (status === 'syncing') return 'Syncing with the cloud...'
  if (status === 'error') return error || 'Cloud sync failed.'
  return 'Idle'
}

function formatCount(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function buildPlecoImportMessage(parsed, result) {
  const parts = [
    `Read ${formatCount(parsed.cardCount, 'unique Pleco card')}.`
  ]

  if (result.decksCreated) {
    parts.push(`Created ${formatCount(result.decksCreated, 'linked deck')}.`)
  }

  if (result.decksRefreshed) {
    parts.push(`Refreshed ${formatCount(result.decksRefreshed, 'linked deck')}.`)
  }

  if (result.cardsAdded) {
    parts.push(`Added ${formatCount(result.cardsAdded, 'new card')}.`)
  }

  if (result.cardsEnriched) {
    parts.push(`Enriched ${formatCount(result.cardsEnriched, 'existing card')} with missing Pleco details.`)
  }

  if (result.cardsSkipped) {
    parts.push(`Skipped ${formatCount(result.cardsSkipped, 'unchanged duplicate')}.`)
  }

  if (parsed.invalidRowCount) {
    parts.push(`Ignored ${formatCount(parsed.invalidRowCount, 'incomplete row')}.`)
  }

  parts.push('Existing local cards were not deleted or overwritten.')
  parts.push('Run "Sync Now" if you want these refreshed cards uploaded to Supabase.')
  return parts.join(' ')
}

export default function SettingsPage({ onRefresh }) {
  const { user, signOut } = useAuth()
  const { status: syncStatus, error: syncError, lastSyncedAt, lastReconciledAt, syncNow } = useSync()

  const [backupPassword, setBackupPassword] = useState('')
  const [status, setStatus] = useState(null) // { type: 'success'|'error', message }
  const [importing, setImporting] = useState(false)
  const [importingPleco, setImportingPleco] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [syncingNow, setSyncingNow] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [localCounts, setLocalCounts] = useState({
    cards: 0,
    decks: 0,
    reviewLog: 0,
    writingLog: 0
  })
  const [cloudCounts, setCloudCounts] = useState({
    cards: 0,
    decks: 0,
    reviewLog: 0,
    writingLog: 0
  })
  const [loadingCloudCounts, setLoadingCloudCounts] = useState(false)

  const fileInputRef = useRef(null)
  const plecoFileInputRef = useRef(null)

  const refreshLocalCounts = async () => {
    const counts = await getLocalDataCounts()
    setLocalCounts(counts)
  }

  const refreshCloudCounts = async () => {
    setLoadingCloudCounts(true)

    try {
      const counts = await getCloudDataCounts()
      setCloudCounts(counts)
    } catch (err) {
      setStatus(currentStatus => currentStatus ?? {
        type: 'error',
        message: 'Could not load cloud counts: ' + err.message
      })
    }

    setLoadingCloudCounts(false)
  }

  useEffect(() => {
    refreshLocalCounts()
    refreshCloudCounts()
  }, [])

  useEffect(() => {
    refreshLocalCounts()
    refreshCloudCounts()
  }, [lastSyncedAt, lastReconciledAt])

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
          message: `${result.message} If you want these restored records online too, run "Sync Now" after the restore.`
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
      const localAhead = result.localCounts.cards > result.cloudCounts.cards
      const cloudAhead = result.cloudCounts.cards > result.localCounts.cards

      if (result.countsStillDiffer) {
        setStatus({
          type: 'error',
          message: 'Sync finished, but this device and the cloud still disagree on record counts. Refresh the app once and run Sync Now again.'
        })
      } else {
        setStatus({
          type: 'success',
          message: result.fullReconcilePerformed
            ? `Cloud sync complete. A full-library reconcile was also run automatically to repair count drift.${cloudAhead ? ' This device pulled newer cloud data.' : ''}${localAhead ? ' This device also uploaded records the cloud was missing.' : ''}`
            : 'Cloud sync complete.'
        })
      }

      await refreshLocalCounts()
      await refreshCloudCounts()
      onRefresh?.()
    }

    setSyncingNow(false)
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

  const handlePlecoImport = async file => {
    setImportingPleco(true)
    setStatus(null)

    try {
      const parsed = await parsePlecoImportFile(file)
      const result = await refreshPlecoLinkedDecks(parsed.cards)

      setStatus({
        type: 'success',
        message: buildPlecoImportMessage(parsed, result)
      })

      await refreshLocalCounts()
      onRefresh?.()
    } catch (err) {
      setStatus({ type: 'error', message: 'Pleco import failed: ' + err.message })
    }

    setImportingPleco(false)
    if (plecoFileInputRef.current) plecoFileInputRef.current.value = ''
  }

  const countsMatch = (
    localCounts.cards === cloudCounts.cards &&
    localCounts.decks === cloudCounts.decks &&
    localCounts.reviewLog === cloudCounts.reviewLog &&
    localCounts.writingLog === cloudCounts.writingLog
  )

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
          Last full reconcile: {formatTimestamp(lastReconciledAt)}
        </p>

        <div className="card" style={{ padding: 14, marginBottom: 12, background: 'var(--bg-elevated)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>This device currently holds</div>
          <div className="text-secondary" style={{ fontSize: 13, lineHeight: 1.6 }}>
            {localCounts.cards} cards, {localCounts.decks} decks, {localCounts.reviewLog} reviews, {localCounts.writingLog} writing logs
          </div>
        </div>

        <div className="card" style={{ padding: 14, marginBottom: 12, background: 'var(--bg-elevated)' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
            Cloud currently holds {loadingCloudCounts ? '(checking...)' : ''}
          </div>
          <div className="text-secondary" style={{ fontSize: 13, lineHeight: 1.6 }}>
            {cloudCounts.cards} cards, {cloudCounts.decks} decks, {cloudCounts.reviewLog} reviews, {cloudCounts.writingLog} writing logs
          </div>
        </div>

        {!loadingCloudCounts && !countsMatch && (
          <div className="card-message card-message-warning" style={{ marginBottom: 12 }}>
            This device and the cloud do not match yet. `Sync Now` will pull remote changes, push local changes, and automatically run a deeper full-library reconcile if the counts still differ.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSyncNow}
            disabled={syncingNow || syncStatus === 'syncing'}
          >
            {syncingNow || syncStatus === 'syncing' ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>

        <p className="text-secondary" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
          `Sync Now` is now the only sync action: it pulls cloud changes down, uploads local dirty changes, and if local and cloud counts still disagree it automatically performs a full-library reconcile and pulls again.
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
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Import / Refresh From Pleco</h3>
        <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
          Manual linked refresh for Pleco flashcards. Export a Pleco `.txt` file whenever you add more words, then pick it here to union the latest unique cards into this app without creating duplicates.
        </p>
        <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
          Linked Pleco refreshes are additive only: this app never deletes cards just because they are missing from a later Pleco export, and it never overwrites non-empty local data with weaker Pleco data.
        </p>
        <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>
          When Pleco categories are present, each category can refresh its own linked deck. If the same Pleco card appears in multiple categories, this app keeps one card, uses one primary deck, and stores the extra Pleco categories as tags.
        </p>
        <input
          ref={plecoFileInputRef}
          type="file"
          accept=".txt,text/plain"
          style={{ display: 'none' }}
          onChange={event => {
            if (event.target.files[0]) handlePlecoImport(event.target.files[0])
          }}
        />
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => plecoFileInputRef.current?.click()}
          disabled={importingPleco}
        >
          {importingPleco ? 'Refreshing Pleco...' : 'Import / Refresh Pleco .txt'}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Restore from Backup</h3>
        <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.4 }}>
          Replaces the current local study cache with the backup. After restoring, use "Sync Now" if you want the restored data pushed into your account.
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
