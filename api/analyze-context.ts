import type { VercelRequest, VercelResponse } from '@vercel/node'
import { GoogleGenAI, Type } from '@google/genai'

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!
})

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { baseAnalysis, context, language } = req.body

  if (!baseAnalysis || !context) {
    return res.status(400).json({ error: 'Base analysis & context required' })
  }

  const langPrompt = language === 'en' ? 'English' : 'Bahasa Indonesia'

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          text: `
You are a graphology analyst.

IMPORTANT:
- Output strictly in ${langPrompt}
- Output must be valid JSON

BASE ANALYSIS:
${JSON.stringify(baseAnalysis, null, 2)}

USER CONTEXT / QUESTION:
${context}

Provide:
- relevanceExplanation
- suitabilityScore (0–100)
- actionableAdvice (array)
- specificRisks (array)
`
        }
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            relevanceExplanation: { type: Type.STRING },
            suitabilityScore: { type: Type.NUMBER },
            actionableAdvice: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            specificRisks: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        }
      }
    })

    if (!response.text) {
      throw new Error('Empty Gemini response')
    }

    return res.status(200).json(JSON.parse(response.text))
  } catch (err: any) {
    console.error('Context Gemini error:', err)
    return res.status(500).json({
      error: err?.message || 'Context analysis failed'
    })
  }
}
