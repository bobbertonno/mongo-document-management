export type EmbeddingProviderId = 'atlas-auto' | 'voyage' | 'openai'

export interface EmbeddingModelOption {
  id: string
  label: string
  dimensions: number
}

export interface EmbeddingProviderOption {
  id: EmbeddingProviderId
  label: string
  description: string
  requiresApiKey: boolean
  keyPlaceholder?: string
  models: EmbeddingModelOption[]
  defaultModel: string
}

export const EMBEDDING_PROVIDERS: EmbeddingProviderOption[] = [
  {
    id: 'atlas-auto',
    label: 'MongoDB Atlas automated embedding',
    description:
      'Atlas generates and maintains Voyage AI embeddings for every chunk at index time and for every query. No API key or embedding code is needed.',
    requiresApiKey: false,
    models: [
      { id: 'voyage-4', label: 'voyage-4 (recommended)', dimensions: 1024 },
      { id: 'voyage-4-lite', label: 'voyage-4-lite (lower latency and cost)', dimensions: 1024 },
      { id: 'voyage-4-large', label: 'voyage-4-large (highest quality)', dimensions: 1024 },
      { id: 'voyage-code-4', label: 'voyage-code-4 (code retrieval)', dimensions: 1024 },
    ],
    defaultModel: 'voyage-4',
  },
  {
    id: 'voyage',
    label: 'Voyage AI (your API key)',
    description: 'Other Voyage AI models, embedded by this app with your own key and stored on document_chunks.embedding.',
    requiresApiKey: true,
    keyPlaceholder: 'pa-...',
    models: [
      { id: 'voyage-3.5', label: 'voyage-3.5', dimensions: 1024 },
      { id: 'voyage-3.5-lite', label: 'voyage-3.5-lite', dimensions: 1024 },
      { id: 'voyage-3-large', label: 'voyage-3-large', dimensions: 1024 },
      { id: 'voyage-code-3', label: 'voyage-code-3', dimensions: 1024 },
      { id: 'voyage-finance-2', label: 'voyage-finance-2', dimensions: 1024 },
      { id: 'voyage-law-2', label: 'voyage-law-2', dimensions: 1024 },
    ],
    defaultModel: 'voyage-3.5',
  },
  {
    id: 'openai',
    label: 'OpenAI (your API key)',
    description: 'OpenAI embedding models, embedded by this app with your own key and stored on document_chunks.embedding.',
    requiresApiKey: true,
    keyPlaceholder: 'sk-...',
    models: [
      { id: 'text-embedding-3-small', label: 'text-embedding-3-small', dimensions: 1536 },
      { id: 'text-embedding-3-large', label: 'text-embedding-3-large', dimensions: 3072 },
    ],
    defaultModel: 'text-embedding-3-small',
  },
]

export const DEFAULT_EMBEDDING_PROVIDER: EmbeddingProviderId = 'atlas-auto'

export function getProviderOption(id: EmbeddingProviderId): EmbeddingProviderOption {
  return EMBEDDING_PROVIDERS.find((p) => p.id === id) ?? EMBEDDING_PROVIDERS[0]
}

export function getModelOption(provider: EmbeddingProviderId, model: string): EmbeddingModelOption | undefined {
  return getProviderOption(provider).models.find((m) => m.id === model)
}

export interface EmbeddingConfigInput {
  provider: EmbeddingProviderId
  model: string
  /** Only sent for custom providers. Omit to keep the key already stored for that provider. */
  apiKey?: string
}
