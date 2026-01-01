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

  const { imageBase64, language } = req.body

  if (!imageBase64) {
    return res.status(400).json({ error: 'Image is required' })
  }

  // 🔑 PENTING: buang prefix base64
  const cleanBase64 = imageBase64.replace(
    /^data:image\/\w+;base64,/,
    ''
  )

  const langPrompt = language === 'en' ? 'English' : 'Bahasa Indonesia'

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64
            }
          },
          {
            text: `
Analyze this handwriting sample using graphology principles.

IMPORTANT:
- Output strictly in ${langPrompt}
- Output must be valid JSON

Provide:
- personalitySummary
- strengths (array)
- weaknesses (array)
- traits (feature, observation, interpretation, confidence)
- graphologyBasis
`
          }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            personalitySummary: { type: Type.STRING },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
            traits: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  feature: { type: Type.STRING },
                  observation: { type: Type.STRING },
                  interpretation: { type: Type.STRING },
                  confidence: { type: Type.NUMBER }
                }
              }
            },
            graphologyBasis: { type: Type.STRING }
          }
        }
      }
    })

    if (!response.text) {
      throw new Error('Empty Gemini response')
    }

    return res.status(200).json(JSON.parse(response.text))
  } catch (err: any) {
    console.error('Gemini error:', err)
    return res.status(500).json({
      error: err?.message || 'Gemini processing failed'
    })
  }
}
