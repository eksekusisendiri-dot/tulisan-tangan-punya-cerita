import type { VercelRequest, VercelResponse } from '@vercel/node'
import { GoogleGenAI, Type } from '@google/genai'

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY // ⬅️ SERVER ENV
})

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { imageBase64, language, context } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: 'Image missing' })
    }

    const langPrompt = language === 'en' ? 'English' : 'Bahasa Indonesia'

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: imageBase64
            }
          },
          {
            text: `
Analyze this handwriting sample using graphology principles.

IMPORTANT:
- Output language: ${langPrompt}
- Return valid JSON only
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
            weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ['personalitySummary', 'strengths', 'weaknesses']
        }
      }
    })

    return res.status(200).json(JSON.parse(response.text!))
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Gemini analysis failed' })
  }
}
