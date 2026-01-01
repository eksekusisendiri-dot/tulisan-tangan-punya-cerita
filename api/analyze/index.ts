import type { VercelRequest, VercelResponse } from '@vercel/node'
import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY
})

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { imageBase64, language } = req.body
    if (!imageBase64)
      return res.status(400).json({ error: 'Image missing' })

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: imageBase64
              }
            },
            {
              text: 'Analyze this handwriting and return valid JSON only'
            }
          ]
        }
      ]
    })

    return res.status(200).json(JSON.parse(response.text))
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Gemini analysis failed' })
  }
}
