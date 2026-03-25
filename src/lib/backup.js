import { db } from './db'

/**
 * Encrypted backup/restore for the Chinese Study App.
 *
 * Uses AES-GCM (256-bit) with a key derived from a user-provided backup
 * password via PBKDF2.
 *
 * File format: JSON with { salt, iv, ciphertext } - all base64-encoded.
 */

async function deriveKey(password, salt) {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
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
 * Export study data as an AES-GCM encrypted file.
 * @param {string} password - Backup password used to derive the encryption key
 * @returns {Blob} - Encrypted backup file
 */
export async function exportBackup(password) {
  const data = {
    version: 3,
    exportedAt: new Date().toISOString(),
    cards: await db.cards.toArray(),
    decks: await db.decks.toArray(),
    reviewLog: await db.reviewLog.toArray(),
    writingLog: await db.writingLog.toArray()
  }

  const plaintext = new TextEncoder().encode(JSON.stringify(data))

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  )

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
 * @param {string} password - Backup password used to derive the decryption key
 * @param {File|Blob} file - The encrypted backup file
 * @returns {object} - { success, cardCount, message }
 */
export async function importBackup(password, file) {
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
  const key = await deriveKey(password, salt)

  let plaintext
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    )
    plaintext = new TextDecoder().decode(decrypted)
  } catch {
    return { success: false, message: 'Wrong backup password or corrupted backup file.' }
  }

  let data
  try {
    data = JSON.parse(plaintext)
  } catch {
    return { success: false, message: 'Backup data is corrupted.' }
  }

  const tables = [db.cards, db.decks, db.reviewLog, db.writingLog]

  await db.transaction('rw', tables, async () => {
    await db.cards.clear()
    await db.decks.clear()
    await db.reviewLog.clear()
    await db.writingLog.clear()

    if (data.cards?.length) await db.cards.bulkAdd(data.cards)
    if (data.decks?.length) await db.decks.bulkAdd(data.decks)
    if (data.reviewLog?.length) await db.reviewLog.bulkAdd(data.reviewLog)
    if (data.writingLog?.length) await db.writingLog.bulkAdd(data.writingLog)
  })

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
