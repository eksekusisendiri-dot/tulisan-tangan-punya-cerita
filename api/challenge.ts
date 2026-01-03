import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// Supabase SERVICE ROLE (SERVER ONLY)
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// util: buat soal hitungan sederhana
function generateQuestion() {
  const a = Math.floor(Math.random() * 9) + 1   // 1–9
  const b = Math.floor(Math.random() * 9) + 1
  const ops = ['+', '-'] as const
  const op = ops[Math.floor(Math.random() * ops.length)]

  let answer = 0
  let question = ''

  if (op === '+') {
    answer = a + b
    question = `${a} + ${b} = ?`
  } else {
    // pastikan tidak negatif
    const x = Math.max(a, b)
    const y = Math.min(a, b)
    answer = x - y
    question = `${x} - ${y} = ?`
  }

  return { question, answer }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed'
    })
  }

  try {
    const { question, answer } = generateQuestion()

    const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString() // 2 menit

    const { data, error } = await supabase
      .from('human_challenges')
      .insert({
        answer,
        expires_at: expiresAt
      })
      .select('id')
      .single()

    if (error || !data) {
      return res.status(500).json({
        error: 'Gagal membuat challenge'
      })
    }

    return res.status(200).json({
      challengeId: data.id,
      question
    })
  } catch (err) {
    console.error('CHALLENGE ERROR:', err)
    return res.status(500).json({
      error: 'Sistem tidak tersedia'
    })
  }
}
