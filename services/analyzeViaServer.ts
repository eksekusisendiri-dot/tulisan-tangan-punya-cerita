import { AnalysisResult, ContextualResult } from '../types'

export type ServerAnalysisResponse = AnalysisResult & {
  contextResult?: ContextualResult | null
}

export async function analyzeHandwritingViaServer(
  imageBase64: string,
  language: 'id' | 'en' = 'id',
  context?: string
): Promise<ServerAnalysisResponse> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      imageBase64,
      language,
      context
    })
  })

  if (!res.ok) {
    throw new Error('Gagal memproses analisis tulisan tangan')
  }

  return await res.json()
}
