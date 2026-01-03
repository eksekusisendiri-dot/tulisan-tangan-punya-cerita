import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// ====== SAFE INIT (ANTI-CRASH) ======
const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase =
  SUPABASE_URL && SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    : null

// ====== UTIL: SOAL HITUNGAN ======
function generateQuestion() {
  const a = Math.floor(Math.random() * 9) + 1 // 1–9
  const b = Math.floor(Math.random() * 9) + 1
  const ops = ['+', '-'] as const
  const op = ops[Math.floor(Math.random() * ops.length)]

  let answer = 0
  let question = ''

  if (op === '+') {
    answer = a + b
    question = `${a} + ${b} = ?`
  } else {
    const x = Math.max(a, b)
    const y = Math.min(a, b)
    answer = x - y
    question = `${x} - ${y} = ?`
  }

  return { question, answer }
}

// ====== HANDLER ======
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Method guard
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Env guard (penting agar tidak crash)
  if (!supabase) {
    console.error('Supabase env missing')
    return res.status(500).json({
      error: 'Server not configured'
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
      console.error('Insert challenge failed:', error)
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
