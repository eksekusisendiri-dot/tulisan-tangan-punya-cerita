import type { VercelRequest, VercelResponse } from '@vercel/node'
import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY // SERVER ENV (Vercel)
})

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // ✅ Izinkan preflight (browser → serverless)
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // ✅ Hanya terima POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { imageBase64, language } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: 'Image missing' })
    }

    const langPrompt = language === 'en' ? 'English' : 'Bahasa Indonesia'

    // 🔥 SATU-SATUNYA PEMANGGILAN GEMINI (BENAR)
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
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
      }
    })

    // ✅ Cara baca hasil yang BENAR untuk SDK @google/genai
    const text = response.text

    return res.status(200).json(JSON.parse(text))
  } catch (err) {
    console.error('Gemini API error:', err)
    return res.status(500).json({ error: 'Gemini analysis failed' })
  }
}
