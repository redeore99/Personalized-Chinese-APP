import { db } from './db'

/**
 * Encrypted backup/restore for the Chinese Study App.
 *
 * Uses AES-GCM (256-bit) with a key derived from the user's PIN via PBKDF2.
 * The backup file contains NO plaintext data — everything is encrypted.
 *
 * File format: JSON with { salt, iv, ciphertext } — all base64-encoded.
 */

async function deriveKey(pin, salt) {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBuffer(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

/**
 * Export all app data as an AES-GCM encrypted file.
 * @param {string} pin - The user's PIN (used to derive the encryption key)
 * @returns {Blob} - Encrypted backup file
 */
export async function exportBackup(pin) {
  // Collect all data from Dexie
  const securityEntries = await db.security.toArray().catch(() => [])
  const data = {
    version: 2,
    exportedAt: new Date().toISOString(),
    cards: await db.cards.toArray(),
    decks: await db.decks.toArray(),
    reviewLog: await db.reviewLog.toArray(),
    writingLog: await db.writingLog.toArray(),
    // Security metadata (encrypted alongside everything else)
    security: {
      pinHash: localStorage.getItem('chinestudy_pin_hash'),
      failedAttempts: JSON.parse(localStorage.getItem('chinestudy_failed_attempts') || '[]'),
      lastLogin: localStorage.getItem('chinestudy_last_login'),
      idbSecurity: securityEntries
    }
  }

  const plaintext = new TextEncoder().encode(JSON.stringify(data))

  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  // Derive key from PIN
  const key = await deriveKey(pin, salt)

  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  )

  // Package as JSON
  const backup = {
    format: 'hanzi-study-backup',
    version: 1,
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertext)
  }

  return new Blob([JSON.stringify(backup)], { type: 'application/json' })
}

/**
 * Import and restore from an encrypted backup file.
 * @param {string} pin - The user's PIN (used to derive the decryption key)
 * @param {File|Blob} file - The encrypted backup file
 * @returns {object} - { success, cardCount, message }
 */
export async function importBackup(pin, file) {
  const text = await file.text()
  let backup

  try {
    backup = JSON.parse(text)
  } catch {
    return { success: false, message: 'Invalid backup file format.' }
  }

  if (backup.format !== 'hanzi-study-backup') {
    return { success: false, message: 'Not a valid backup file.' }
  }

  const salt = new Uint8Array(base64ToBuffer(backup.salt))
  const iv = new Uint8Array(base64ToBuffer(backup.iv))
  const ciphertext = base64ToBuffer(backup.ciphertext)

  // Derive key from PIN
  const key = await deriveKey(pin, salt)

  let plaintext
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    )
    plaintext = new TextDecoder().decode(decrypted)
  } catch {
    return { success: false, message: 'Wrong PIN or corrupted backup file.' }
  }

  let data
  try {
    data = JSON.parse(plaintext)
  } catch {
    return { success: false, message: 'Backup data is corrupted.' }
  }

  // Restore data — clear existing and replace
  const tables = [db.cards, db.decks, db.reviewLog, db.writingLog]
  if (db.security) tables.push(db.security)

  await db.transaction('rw', tables, async () => {
    await db.cards.clear()
    await db.decks.clear()
    await db.reviewLog.clear()
    await db.writingLog.clear()

    if (data.cards?.length) await db.cards.bulkAdd(data.cards)
    if (data.decks?.length) await db.decks.bulkAdd(data.decks)
    if (data.reviewLog?.length) await db.reviewLog.bulkAdd(data.reviewLog)
    if (data.writingLog?.length) await db.writingLog.bulkAdd(data.writingLog)

    // Restore security metadata to IndexedDB
    if (db.security && data.security?.idbSecurity?.length) {
      await db.security.clear()
      await db.security.bulkAdd(data.security.idbSecurity)
    }
  })

  // Restore security metadata to localStorage
  if (data.security) {
    if (data.security.pinHash) {
      localStorage.setItem('chinestudy_pin_hash', data.security.pinHash)
    }
    if (data.security.failedAttempts?.length) {
      localStorage.setItem('chinestudy_failed_attempts', JSON.stringify(data.security.failedAttempts))
    }
    if (data.security.lastLogin) {
      localStorage.setItem('chinestudy_last_login', data.security.lastLogin)
    }
  }

  return {
    success: true,
    cardCount: data.cards?.length || 0,
    message: `Restored ${data.cards?.length || 0} cards, ${data.reviewLog?.length || 0} reviews, ${data.writingLog?.length || 0} writing logs.`
  }
}

/**
 * Trigger a file download in the browser.
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
