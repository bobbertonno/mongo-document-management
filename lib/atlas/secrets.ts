import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

export interface EncryptedSecret {
  v: 1
  iv: string
  tag: string
  data: string
}

const SALT = 'atlas-document-hub/settings'

export function isEncryptionConfigured(): boolean {
  return (process.env.SETTINGS_ENCRYPTION_KEY?.length ?? 0) >= 32
}

function key(info: string): Buffer {
  const secret = process.env.SETTINGS_ENCRYPTION_KEY
  if (!secret || secret.length < 32) throw new Error('SETTINGS_ENCRYPTION_KEY must be set (at least 32 characters) to store API keys')
  return Buffer.from(hkdfSync('sha256', secret, SALT, info, 32))
}

/** AES-256-GCM. `context` is bound as AAD so a ciphertext cannot be moved to another setting. */
export function encryptSecret(plaintext: string, context: string): EncryptedSecret {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(context), iv)
  cipher.setAAD(Buffer.from(context))
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') }
}

export function decryptSecret(secret: EncryptedSecret, context: string): string {
  const decipher = createDecipheriv('aes-256-gcm', key(context), Buffer.from(secret.iv, 'base64'))
  decipher.setAAD(Buffer.from(context))
  decipher.setAuthTag(Buffer.from(secret.tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(secret.data, 'base64')), decipher.final()]).toString('utf8')
}

export function keyHint(apiKey: string): string {
  return apiKey.length <= 8 ? '••••' : `${apiKey.slice(0, 3)}…${apiKey.slice(-4)}`
}
