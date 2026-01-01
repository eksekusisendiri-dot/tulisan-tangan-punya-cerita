import emailjs from '@emailjs/browser'
import { AnalysisResult, ContextualResult } from '../types'

// =======================
// ANALYZE HANDWRITING (SERVER)
// =======================
export const analyzeHandwriting = async (
  base64Image: string,
  language: 'id' | 'en' = 'id'
): Promise<AnalysisResult> => {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64: base64Image, language })
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Gagal analisis')
  }

  return res.json()
}

// =======================
// ANALYZE CONTEXTUAL (SERVER)
// =======================
export const analyzeContextualHandwriting = async (
  previousResult: AnalysisResult,
  context: string,
  language: 'id' | 'en' = 'id'
): Promise<ContextualResult> => {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: null,
      language,
      context,
      previousResult
    })
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Gagal analisis kontekstual')
  }

  return res.json()
}

// =======================
// EMAIL ADMIN
// =======================
const EMAILJS_SERVICE_ID = "service_pxkzcpd"
const EMAILJS_REPORT_TEMPLATE_ID = "template_hxg2o2o"
const EMAILJS_PUBLIC_KEY = "l9rggiY3zkvs9mnd4"

const formatPhoneReadable = (phone: string): string => {
  const clean = phone.replace(/\D/g, '')
  return clean.startsWith('62') ? `+62 ${clean.slice(2)}` : phone
}

const formatPhoneWA = (phone: string): string => {
  const clean = phone.replace(/\D/g, '')
  return clean.startsWith('62') ? clean : '62' + clean.slice(1)
}

export const sendReportToAdmin = async (
  phone: string,
  name: string,
  email: string,
  result: AnalysisResult,
  contextResult: ContextualResult | null
): Promise<void> => {
  const timestamp = new Date().toLocaleString('id-ID')
  const waPhone = formatPhoneWA(phone)

  const summaryText = `
LAPORAN ANALISIS TULISAN TANGAN
Waktu    : ${timestamp}
Nama     : ${name}
Nomor HP : ${formatPhoneReadable(phone)}
WhatsApp : https://wa.me/${waPhone}

${result.personalitySummary}
`

  await emailjs.send(
    EMAILJS_SERVICE_ID,
    EMAILJS_REPORT_TEMPLATE_ID,
    {
      user_name: name,
      phone,
      token: 'REPORT_RESULT',
      message: summaryText
    },
    EMAILJS_PUBLIC_KEY
  )
}
