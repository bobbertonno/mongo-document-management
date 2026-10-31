import type { Db } from 'mongodb'
import { SETTINGS_COLLECTION } from './client'
import { decryptSecret, encryptSecret, keyHint, type EncryptedSecret } from './secrets'
import {
  DEFAULT_EMBEDDING_PROVIDER,
  getModelOption,
  getProviderOption,
  type EmbeddingConfigInput,
  type EmbeddingProviderId,
} from '@/lib/domain/embedding'

/** Bumped whenever chunk text preparation changes, so stored vectors can be re-embedded. */
export const EMBEDDING_VERSION = 1
const SETTINGS_ID = 'embedding'
const MAX_BATCH = 128

export interface EmbeddingConfig {
  provider: EmbeddingProviderId
  model: string
  dimensions: number
  apiKeys: Partial<Record<Exclude<EmbeddingProviderId, 'atlas-auto'>, { secret: EncryptedSecret; hint: string }>>
  updatedAt: string
}

export class EmbeddingError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export function defaultEmbeddingConfig(): EmbeddingConfig {
  const provider = getProviderOption(DEFAULT_EMBEDDING_PROVIDER)
  return { provider: provider.id, model: provider.defaultModel, dimensions: provider.models[0].dimensions, apiKeys: {}, updatedAt: '' }
}

export async function loadEmbeddingConfig(db: Db): Promise<EmbeddingConfig | null> {
  return (await db.collection(SETTINGS_COLLECTION).findOne({ _id: SETTINGS_ID as never }, { projection: { _id: 0 } })) as EmbeddingConfig | null
}

const secretContext = (provider: string) => `embedding-api-key:${provider}`

/** Validates the requested provider/model, encrypts a new key and returns the config to persist. */
export function buildEmbeddingConfig(input: EmbeddingConfigInput, previous: EmbeddingConfig | null): { config: EmbeddingConfig; apiKey?: string } {
  const option = getProviderOption(input.provider)
  if (option.id !== input.provider) throw new EmbeddingError('Unknown embedding provider', 400)
  const model = getModelOption(input.provider, input.model)
  if (!model) throw new EmbeddingError(`Model "${input.model}" is not available for ${option.label}`, 400)
  const apiKeys = { ...(previous?.apiKeys ?? {}) }
  let apiKey: string | undefined
  if (input.provider !== 'atlas-auto') {
    const submitted = input.apiKey?.trim()
    if (submitted) {
      if (submitted.length < 20 || submitted.length > 512 || /\s/.test(submitted)) throw new EmbeddingError('The API key format is invalid', 400)
      apiKeys[input.provider] = { secret: encryptSecret(submitted, secretContext(input.provider)), hint: keyHint(submitted) }
      apiKey = submitted
    } else {
      const stored = apiKeys[input.provider]
      if (!stored) throw new EmbeddingError(`Enter an API key for ${option.label}`, 400)
      apiKey = decryptSecret(stored.secret, secretContext(input.provider))
    }
  }
  return {
    config: { provider: input.provider, model: model.id, dimensions: model.dimensions, apiKeys, updatedAt: new Date().toISOString() },
    apiKey,
  }
}

export async function saveEmbeddingConfig(db: Db, config: EmbeddingConfig) {
  await db.collection(SETTINGS_COLLECTION).replaceOne({ _id: SETTINGS_ID as never }, config, { upsert: true })
}

export function resolveApiKey(config: EmbeddingConfig): string {
  if (config.provider === 'atlas-auto') throw new EmbeddingError('Atlas automated embedding does not use an API key', 400)
  const stored = config.apiKeys[config.provider]
  if (!stored) throw new EmbeddingError(`No API key is stored for ${getProviderOption(config.provider).label}`, 503)
  try {
    return decryptSecret(stored.secret, secretContext(config.provider))
  } catch {
    throw new EmbeddingError('The stored API key could not be decrypted. Re-enter it in System Settings.', 503)
  }
}

export function publicKeyHints(config: EmbeddingConfig | null): Partial<Record<EmbeddingProviderId, string>> {
  return Object.fromEntries(Object.entries(config?.apiKeys ?? {}).map(([provider, v]) => [provider, v.hint]))
}

type InputType = 'document' | 'query'

async function fetchWithRetry(url: string, init: RequestInit, provider: string, attempt = 0): Promise<Response> {
  const response = await fetch(url, init)
  if (response.status === 429 && attempt < 2) {
    const retryAfter = Number(response.headers.get('retry-after')) || 2 ** attempt * 2
    await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfter, 10) * 1000))
    return fetchWithRetry(url, init, provider, attempt + 1)
  }
  return response
}

function providerError(provider: string, status: number, detail?: string): EmbeddingError {
  if (status === 401 || status === 403) return new EmbeddingError(`${provider} rejected the API key`, 401)
  if (status === 429) return new EmbeddingError(`${provider} rate limit or quota reached. Retry later or check your billing.`, 502)
  return new EmbeddingError(detail ?? `${provider} request failed (${status})`, 502)
}

async function voyageBatch(apiKey: string, model: string, dimensions: number, input: string[], inputType: InputType) {
  const response = await fetchWithRetry(
    'https://api.voyageai.com/v1/embeddings',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ input, model, input_type: inputType, output_dimension: dimensions }),
    },
    'Voyage AI',
  )
  const body = (await response.json().catch(() => ({}))) as { data?: { embedding: number[]; index: number }[]; usage?: { total_tokens?: number }; detail?: string }
  if (!response.ok || !body.data) throw providerError('Voyage AI', response.status, body.detail)
  return { embeddings: [...body.data].sort((a, b) => a.index - b.index).map((d) => d.embedding), tokens: body.usage?.total_tokens ?? 0 }
}

async function openaiBatch(apiKey: string, model: string, input: string[]) {
  const response = await fetchWithRetry(
    'https://api.openai.com/v1/embeddings',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ input: input.map((t) => t || ' '), model, encoding_format: 'float' }),
    },
    'OpenAI',
  )
  const body = (await response.json().catch(() => ({}))) as {
    data?: { embedding: number[]; index: number }[]
    usage?: { total_tokens?: number }
    error?: { message?: string }
  }
  if (!response.ok || !body.data) throw providerError('OpenAI', response.status, body.error?.message)
  return { embeddings: [...body.data].sort((a, b) => a.index - b.index).map((d) => d.embedding), tokens: body.usage?.total_tokens ?? 0 }
}

/** Embeds texts with a customer-supplied provider key. Not used for Atlas automated embedding. */
export async function embedTexts(config: EmbeddingConfig, apiKey: string, texts: string[], inputType: InputType) {
  const embeddings: number[][] = []
  let tokens = 0
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const input = texts.slice(i, i + MAX_BATCH)
    const batch =
      config.provider === 'openai'
        ? await openaiBatch(apiKey, config.model, input)
        : await voyageBatch(apiKey, config.model, config.dimensions, input, inputType)
    embeddings.push(...batch.embeddings)
    tokens += batch.tokens
  }
  return { embeddings, tokens }
}
