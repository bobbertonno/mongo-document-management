import { NextResponse, type NextRequest } from 'next/server'
import { getDb, isAtlasConfigured } from '@/lib/atlas/client'
import { EmbeddingError, buildEmbeddingConfig, embedTexts, loadEmbeddingConfig, saveEmbeddingConfig } from '@/lib/atlas/embeddings'
import { isEncryptionConfigured } from '@/lib/atlas/secrets'
import { applyVectorIndex, getVectorStatus } from '@/lib/atlas/vector'
import type { EmbeddingConfigInput, EmbeddingProviderId } from '@/lib/domain/embedding'

export const dynamic = 'force-dynamic'

const notConfigured = () => NextResponse.json({ error: 'MongoDB Atlas is not configured' }, { status: 503 })
const PROVIDERS: EmbeddingProviderId[] = ['atlas-auto', 'voyage', 'openai']

export async function GET() {
  if (!isAtlasConfigured()) return notConfigured()
  try {
    return NextResponse.json(await getVectorStatus(await getDb()))
  } catch (error) {
    console.error('[vector] status failed', error)
    return NextResponse.json({ error: 'Failed to read Atlas Vector Search status' }, { status: 502 })
  }
}

function parseInput(body: unknown): EmbeddingConfigInput | null {
  if (typeof body !== 'object' || body === null) return null
  const { provider, model, apiKey } = body as Record<string, unknown>
  if (typeof provider !== 'string' || !PROVIDERS.includes(provider as EmbeddingProviderId)) return null
  if (typeof model !== 'string' || !model) return null
  if (apiKey !== undefined && typeof apiKey !== 'string') return null
  return { provider: provider as EmbeddingProviderId, model, apiKey }
}

/**
 * Saves the embedding provider (API keys are encrypted at rest and never returned), verifies
 * custom keys with a live call, and creates the matching Atlas Vector Search index.
 */
export async function POST(request: NextRequest) {
  if (!isAtlasConfigured()) return notConfigured()
  const input = parseInput(await request.json().catch(() => null))
  if (!input) return NextResponse.json({ error: 'Invalid embedding configuration' }, { status: 400 })
  if (input.provider !== 'atlas-auto' && !isEncryptionConfigured()) {
    return NextResponse.json(
      { error: 'SETTINGS_ENCRYPTION_KEY is not set, so API keys cannot be stored securely. Use Atlas automated embedding or add the variable.' },
      { status: 503 },
    )
  }

  const db = await getDb()
  let built: ReturnType<typeof buildEmbeddingConfig>
  try {
    built = buildEmbeddingConfig(input, await loadEmbeddingConfig(db))
    if (built.apiKey) {
      const { embeddings } = await embedTexts(built.config, built.apiKey, ['Atlas Document Hub connectivity check'], 'query')
      if (embeddings[0]?.length !== built.config.dimensions) {
        throw new EmbeddingError(`The model returned ${embeddings[0]?.length ?? 0} dimensions, expected ${built.config.dimensions}`, 502)
      }
    }
  } catch (error) {
    const status = error instanceof EmbeddingError ? error.status : 500
    if (status === 500) console.error('[vector] config validation failed', error)
    return NextResponse.json({ error: status === 500 ? 'Could not validate the embedding configuration' : (error as Error).message }, { status })
  }

  try {
    await applyVectorIndex(db, built.config)
    await saveEmbeddingConfig(db, built.config)
    return NextResponse.json(await getVectorStatus(db))
  } catch (error) {
    console.error('[vector] index creation failed', error)
    const hint = input.provider === 'atlas-auto' ? ' Automated embedding requires a cluster where Atlas auto-embedding is available.' : ''
    return NextResponse.json({ error: `Could not create the Atlas Vector Search index: ${(error as Error).message}.${hint}` }, { status: 502 })
  }
}
