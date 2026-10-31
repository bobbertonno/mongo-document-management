const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings'

export const VOYAGE_MODEL = process.env.VOYAGE_MODEL || 'voyage-4-lite'
export const EMBEDDING_DIMENSIONS = 1024
/** Bumped whenever the model, dimensions or chunk text preparation changes. */
export const EMBEDDING_VERSION = 1
const MAX_BATCH = 128

export function isVoyageConfigured(): boolean {
  return !!process.env.VOYAGE_API_KEY
}

export class VoyageError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function requestEmbeddings(input: string[], inputType: 'document' | 'query', attempt = 0): Promise<{ embeddings: number[][]; tokens: number }> {
  const apiKey = process.env.VOYAGE_API_KEY
  if (!apiKey) throw new VoyageError('VOYAGE_API_KEY is not configured', 503)
  const response = await fetch(VOYAGE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ input, model: VOYAGE_MODEL, input_type: inputType, output_dimension: EMBEDDING_DIMENSIONS }),
  })
  if (response.status === 429 && attempt < 2) {
    const retryAfter = Number(response.headers.get('retry-after')) || 2 ** attempt * 2
    await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfter, 10) * 1000))
    return requestEmbeddings(input, inputType, attempt + 1)
  }
  const body = (await response.json().catch(() => ({}))) as {
    data?: { embedding: number[]; index: number }[]
    usage?: { total_tokens?: number }
    detail?: string
  }
  if (!response.ok || !body.data) {
    const reason =
      response.status === 401
        ? 'Voyage AI rejected the API key'
        : response.status === 429
          ? 'Voyage AI rate limit reached. Add a payment method to your Voyage account or retry later.'
          : (body.detail ?? `Voyage AI request failed (${response.status})`)
    throw new VoyageError(reason, response.status === 401 ? 401 : 502)
  }
  const embeddings = [...body.data].sort((a, b) => a.index - b.index).map((d) => d.embedding)
  return { embeddings, tokens: body.usage?.total_tokens ?? 0 }
}

export async function embedTexts(texts: string[], inputType: 'document' | 'query') {
  const embeddings: number[][] = []
  let tokens = 0
  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch = await requestEmbeddings(texts.slice(i, i + MAX_BATCH), inputType)
    embeddings.push(...batch.embeddings)
    tokens += batch.tokens
  }
  return { embeddings, tokens }
}
