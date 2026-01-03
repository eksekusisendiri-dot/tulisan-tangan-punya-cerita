import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

// ===== SAFE INIT =====
const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase =
  SUPABASE_URL && SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    : null

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!supabase) {
    return res.status(500).json({
      error: 'Server not configured'
    })
  }

  const { phone, token, challengeId, answer } = req.body

  // ===== VALIDASI INPUT =====
  if (!phone || !token || !challengeId || answer === undefined) {
    return res.status(400).json({
      error: 'Data verifikasi tidak lengkap'
    })
  }

  try {
    // ===== 1️⃣ VALIDASI HUMAN CHALLENGE =====
    const { data: challenge, error: challengeError } = await supabase
      .from('human_challenges')
      .select('answer, expires_at')
      .eq('id', challengeId)
      .single()

    if (challengeError || !challenge) {
      return res.status(400).json({
        error: 'Soal verifikasi tidak valid'
      })
    }

    if (new Date(challenge.expires_at) < new Date()) {
      return res.status(400).json({
        error: 'Soal verifikasi sudah kedaluwarsa'
      })
    }

    if (Number(answer) !== challenge.answer) {
      return res.status(400).json({
        error: 'Jawaban verifikasi salah'
      })
    }

    // ===== HAPUS CHALLENGE (ONE-TIME USE) =====
    await supabase
      .from('human_challenges')
      .delete()
      .eq('id', challengeId)

    // ===== 2️⃣ VALIDASI TOKEN =====
    const { data: tokenRow, error: tokenError } = await supabase
      .from('tokens')
      .select('id, used')
      .eq('phone', phone)
      .eq('token', token)
      .eq('used', false)
      .single()

    if (tokenError || !tokenRow) {
      return res.status(400).json({
        error: 'Token tidak valid atau sudah digunakan'
      })
    }

    // ===== LOGIN OK =====
    return res.status(200).json({
      success: true
    })
  } catch (err) {
    console.error('VERIFY TOKEN ERROR:', err)
    return res.status(500).json({
      error: 'Sistem tidak tersedia'
    })
  }
}
