import { supabase } from './supabaseClient'

export async function verifyToken(phone: string, code: string) {
  const { data, error } = await supabase.rpc(
    'verify_and_burn_token',
    {
      p_phone: phone,
      p_code: code
    }
  )

  if (error || data !== true) {
    return {
      success: false,
      message: 'Token tidak valid / sudah terpakai'
    }
  }

  return { success: true }
}
