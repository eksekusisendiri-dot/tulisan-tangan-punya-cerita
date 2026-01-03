import type { VercelRequest, VercelResponse } from '@vercel/node'
import { GoogleGenAI, Type } from '@google/genai'
import { createClient } from '@supabase/supabase-js'

// NOTE: tokenService akan kita sambungkan penuh di langkah berikutnya
// import { validateToken, burnToken } from '../services/tokenService'

console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'OK' : 'MISSING')


if (!process.env.GEMINI_API_KEY) {
  throw new Error('System configuration error')
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
})

function getClientIp(req: VercelRequest): string {
  const xff = req.headers['x-forwarded-for']
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim()
  }
  return req.socket.remoteAddress || 'unknown'
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_ATTEMPTS = 5
const WINDOW_MINUTES = 15


export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  console.log('ANALYZE HIT')
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const ip = getClientIp(req)
  const token = req.body?.token

  const since = new Date(
    Date.now() - WINDOW_MINUTES * 60 * 1000
  ).toISOString()

  const { count, error } = await supabase
    .from('token_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('token', token)
    .eq('ip_address', ip)
    .eq('success', false)
    .gte('created_at', since)

console.log('FAILED ATTEMPTS:', count)
  
  console.log('CLIENT IP:', ip)

  const { imageBase64, language, context } = req.body

  console.log('BODY KE ANALYZE:', {
  hasImage: Boolean(imageBase64),
  imageType: typeof imageBase64,
  imageLength: imageBase64?.length,
  language
})


  if (!imageBase64) {
    return res.status(400).json({
      errorType: 'IMAGE_REQUIRED',
      message: 'Gambar tulisan tangan wajib diunggah'
    })
  }

  // 🔎 Validasi konteks (opsional, max 200)
  if (context && typeof context === 'string' && context.length > 200) {
    return res.status(400).json({
      errorType: 'CONTEXT_TOO_LONG',
      message: 'Konteks maksimal 200 karakter'
    })
  }

  // 🔑 Bersihkan base64
  const cleanBase64 = imageBase64.replace(
    /^data:image\/\w+;base64,/,
    ''
  )

  const langPrompt = language === 'en'
    ? 'English'
    : 'Bahasa Indonesia'

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

IMPORTANT RULES:
- If the image does NOT contain handwriting, respond with: "NO_HANDWRITING"
- If handwriting exists but is unreadable or too poor in quality, respond with: "IMAGE_QUALITY_FAILED"
- Output strictly in ${langPrompt}
- Output must be valid JSON only

${context ? `Context (optional, for interpretation only):
"${context}"
Do NOT change the base analysis, only relate the interpretation to this context.` : ''}

Provide JSON with:
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
      return res.status(422).json({
        errorType: 'NO_HANDWRITING_DETECTED',
        message: 'Sistem tidak menemukan tulisan tangan pada gambar'
      })
    }

    // 🧠 Deteksi pesan khusus dari sistem
    if (response.text.includes('NO_HANDWRITING')) {
      return res.status(422).json({
        errorType: 'NO_HANDWRITING_DETECTED',
        message: 'Tidak ditemukan tulisan tangan pada gambar'
      })
    }

    if (response.text.includes('IMAGE_QUALITY_FAILED')) {
      return res.status(422).json({
        errorType: 'IMAGE_QUALITY_FAILED',
        message: 'Kualitas gambar terlalu buruk untuk dianalisis'
      })
    }

    const parsedResult = JSON.parse(response.text)

    // 🔥 TOKEN BARU BOLEH DIBAKAR DI SINI (LANGKAH BERIKUTNYA)
    // await burnToken(tokenId)

    return res.status(200).json({
      status: 'SUCCESS',
      data: parsedResult
    })

  } catch (err: any) {
    console.error('System processing error:', err)

    if (err?.message?.includes('fetch')) {
      return res.status(503).json({
        errorType: 'NETWORK_ERROR',
        message: 'Koneksi jaringan terputus'
      })
    }

    return res.status(503).json({
      errorType: 'SYSTEM_UNAVAILABLE',
      message: 'Sistem tidak dapat memproses permintaan saat ini'
    })
  }
}
