import type { Db } from 'mongodb'
import { COLLECTIONS } from './client'
import { EMBEDDING_DIMENSIONS, VOYAGE_MODEL, isVoyageConfigured } from './voyage'

export const VECTOR_INDEX_NAME = 'document_chunks_vector'
const chunks = (db: Db) => db.collection(COLLECTIONS.documentChunks.name)

export interface VectorIndexInfo {
  name: string
  status: string
  queryable: boolean
}

export interface VectorStatus {
  voyageConfigured: boolean
  model: string
  dimensions: number
  index: VectorIndexInfo | null
  chunks: { total: number; embedded: number }
}

export async function getVectorIndex(db: Db): Promise<VectorIndexInfo | null> {
  try {
    const [index] = await chunks(db).listSearchIndexes(VECTOR_INDEX_NAME).toArray()
    if (!index) return null
    return { name: VECTOR_INDEX_NAME, status: String(index.status ?? 'UNKNOWN'), queryable: !!index.queryable }
  } catch (error) {
    if ((error as { code?: number }).code === 26) return null
    throw error
  }
}

export async function getVectorStatus(db: Db): Promise<VectorStatus> {
  const [index, total, embedded] = await Promise.all([
    getVectorIndex(db),
    chunks(db).countDocuments({}),
    chunks(db).countDocuments({ embedding: { $exists: true } }),
  ])
  return { voyageConfigured: isVoyageConfigured(), model: VOYAGE_MODEL, dimensions: EMBEDDING_DIMENSIONS, index, chunks: { total, embedded } }
}

export async function ensureVectorIndex(db: Db): Promise<void> {
  const exists = await db.listCollections({ name: COLLECTIONS.documentChunks.name }, { nameOnly: true }).hasNext()
  if (!exists) await db.createCollection(COLLECTIONS.documentChunks.name)
  if (await getVectorIndex(db)) return
  await chunks(db).createSearchIndex({
    name: VECTOR_INDEX_NAME,
    type: 'vectorSearch',
    definition: {
      fields: [
        { type: 'vector', path: 'embedding', numDimensions: EMBEDDING_DIMENSIONS, similarity: 'cosine' },
        { type: 'filter', path: 'tenantId' },
        { type: 'filter', path: 'documentId' },
        { type: 'filter', path: 'versionId' },
      ],
    },
  })
}
