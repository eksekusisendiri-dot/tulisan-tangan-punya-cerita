import { supabase } from './supabaseClient'

export async function verifyToken(
  phone: string,
  code: string,
  deviceId: string
) {
  const { data, error } = await supabase
    .from('tokens')
    .select('*')
    .eq('phone', phone)
    .eq('code', code)
    .single()

  if (error || !data) {
    return {
      success: false,
      message: 'Token tidak valid'
    }
  }

  if (data.used) {
    return {
      success: false,
      message: 'Token sudah digunakan'
    }
  }

  // 🔒 Bind ke device pertama
  if (!data.device_id) {
    const { error: updateError } = await supabase
      .from('tokens')
      .update({ device_id: deviceId })
      .eq('id', data.id)

    if (updateError) {
      return {
        success: false,
        message: 'Gagal memverifikasi perangkat'
      }
    }
  } else if (data.device_id !== deviceId) {
    return {
      success: false,
      message: 'Token hanya dapat digunakan pada satu perangkat'
    }
  }

  return { success: true, tokenId: data.id }
}

export async function burnToken(tokenId: string) {
  const { error } = await supabase
    .from('tokens')
    .update({
      used: true,
      used_at: new Date().toISOString()
    })
    .eq('id', tokenId)

  if (error) {
    throw new Error('Gagal mengunci token')
  }
}
