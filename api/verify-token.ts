import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'OK' : 'MISSING')
console.log(
  'SERVICE_ROLE:',
  process.env.SUPABASE_SERVICE_ROLE_KEY ? 'OK' : 'MISSING'
)


// Supabase SERVICE ROLE (HANYA DI SERVER)
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { phone, token } = req.body

  if (!phone || !token) {
    return res.status(400).json({
      error: 'Data verifikasi tidak lengkap'
    })
  }

  try {
    // 1️⃣ Cari token yang valid & belum dipakai
    const { data: tokenRow, error } = await supabase
      .from('tokens')
      .select('id, phone, used')
      .eq('phone', phone)
      .eq('token', token)
      .eq('used', false)
      .single()

    if (error || !tokenRow) {
      return res.status(400).json({
        error: 'Token tidak valid atau sudah digunakan'
      })
    }


    // 5️⃣ KIRIM OK (token BELUM dibakar)
    return res.status(200).json({
      success: true
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({
      error: 'Sistem sedang tidak tersedia'
    })
  }
}
