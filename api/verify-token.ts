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

  const { phone, token, deviceId } = req.body

  if (!phone || !token || !deviceId) {
    return res.status(400).json({
      error: 'Data verifikasi tidak lengkap'
    })
  }

  try {
    // 1️⃣ Cari token yang valid & belum dipakai
    const { data: tokenRow, error } = await supabase
      .from('tokens')
      .select('*')
      .eq('phone', phone)
      .eq('code', token)
      .eq('used', false)
      .single()

    if (error || !tokenRow) {
      return res.status(400).json({
        error: 'Token tidak valid atau sudah digunakan'
      })
    }

    // 2️⃣ Cek device binding
    if (tokenRow.device_id && tokenRow.device_id !== deviceId) {
      return res.status(403).json({
        error: 'Token sudah digunakan di perangkat lain'
      })
    }

    // 3️⃣ Ikat token ke device (JIKA BELUM)
    if (!tokenRow.device_id) {
      const { error: updateError } = await supabase
        .from('tokens')
        .update({
          device_id: deviceId,
          updated_at: new Date().toISOString()
        })
        .eq('id', tokenRow.id)

      if (updateError) {
        console.error(updateError)
        return res.status(500).json({
          error: 'Sistem gagal memverifikasi perangkat'
        })
      }
    }

    // 4️⃣ Catat attempt (logging, tidak membakar token)
    await supabase.from('token_attempts').insert([
      {
        token_id: tokenRow.id,
        device_id: deviceId,
        status: 'verified'
      }
    ])

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
