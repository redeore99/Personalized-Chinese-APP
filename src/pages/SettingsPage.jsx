import { useState, useRef } from 'react'
import { exportBackup, importBackup, downloadBlob } from '../lib/backup'

const FAILED_ATTEMPTS_KEY = 'chinestudy_failed_attempts'

export default function SettingsPage() {
  const [backupPassword, setBackupPassword] = useState('')
  const [status, setStatus] = useState(null) // { type: 'success'|'error', message }
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showAttempts, setShowAttempts] = useState(false)
  const fileInputRef = useRef(null)

  const failedAttempts = (() => {
    try {
      return JSON.parse(localStorage.getItem(FAILED_ATTEMPTS_KEY) || '[]')
    } catch {
      return []
    }
  })()

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

  const handleImport = async (file) => {
    if (backupPassword.trim().length < 4) {
      setStatus({ type: 'error', message: 'Enter the backup password that was used to create the backup.' })
      return
    }
    setImporting(true)
    setStatus(null)
    try {
      const result = await importBackup(backupPassword, file)
      if (result.success) {
        setStatus({ type: 'success', message: result.message })
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

  const clearFailedAttempts = () => {
    localStorage.removeItem(FAILED_ATTEMPTS_KEY)
    setShowAttempts(false)
    setStatus({ type: 'success', message: 'Security log cleared.' })
  }

  return (
    <div className="page">
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>Settings</h2>
        <p className="text-secondary" style={{ fontSize: 14 }}>
          Backup, restore, and device security
        </p>
      </div>

      {/* Backup password for export/import */}
      <div style={{ marginBottom: 24 }}>
        <label className="label">Backup password</label>
        <input
          className="input"
          type="password"
          value={backupPassword}
          onChange={e => {
            setBackupPassword(e.target.value)
            setStatus(null)
          }}
          placeholder="Enter a backup password"
          maxLength={128}
          autoComplete="off"
          style={{ maxWidth: 280 }}
        />
        <p className="text-secondary" style={{ fontSize: 13, marginTop: 8, lineHeight: 1.4 }}>
          This is separate from the device PIN. Use any strong password you can also enter on another device when restoring.
        </p>
      </div>

      {/* Export */}
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Export Backup</h3>
        <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.4 }}>
          Downloads an AES-256 encrypted file containing all your cards, review history, and writing logs. The backup password is not tied to the local device PIN, so the file can be restored on another device.
        </p>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? 'Encrypting...' : 'Export Encrypted Backup'}
        </button>
      </div>

      {/* Import */}
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Restore from Backup</h3>
        <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.4 }}>
          Replaces all current study data with the backup. Enter the same backup password that was used when the file was created.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={e => {
            if (e.target.files[0]) handleImport(e.target.files[0])
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

      {/* Security log */}
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Security Log</h3>
        <p className="text-secondary" style={{ fontSize: 13, marginBottom: 12 }}>
          {failedAttempts.length === 0
            ? 'No failed device PIN attempts recorded.'
            : `${failedAttempts.length} failed device PIN attempt${failedAttempts.length !== 1 ? 's' : ''} total.`}
        </p>

        {failedAttempts.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowAttempts(!showAttempts)}
            >
              {showAttempts ? 'Hide' : 'View Log'}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={clearFailedAttempts}
              style={{ color: 'var(--error)' }}
            >
              Clear Log
            </button>
          </div>
        )}

        {showAttempts && failedAttempts.length > 0 && (
          <div className="security-alert-log" style={{ marginTop: 12 }}>
            {failedAttempts.slice().reverse().map((attempt, i) => (
              <div key={i} className="security-alert-entry">
                <span className="security-alert-time">
                  {new Date(attempt.timestamp).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Status message */}
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
