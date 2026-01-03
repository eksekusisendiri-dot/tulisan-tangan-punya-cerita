import emailjs from '@emailjs/browser'
import { AnalysisResult, ContextualResult } from '../types'

// =======================
// ANALYZE (CLIENT → SERVER)
// =======================
export const analyzeHandwriting = async (
  base64Image: string,
  language: 'id' | 'en' = 'id'
): Promise<AnalysisResult> => {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: base64Image,
      language
    })
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Gagal analisis')
  }

  return res.json()
}

// =======================
// CONTEXTUAL ANALYZE (CLIENT → SERVER)
// =======================
export const analyzeContextualHandwriting = async (
  analysisResult: AnalysisResult,
  context: string,
  language: 'id' | 'en' = 'id'
): Promise<ContextualResult> => {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      analysisResult,
      context,
      language
    })
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Gagal analisis kontekstual')
  }

  return res.json()
}


// ==============================================================================
// EMAIL ADMIN
// ==============================================================================
const EMAILJS_SERVICE_ID = "service_pxkzcpd"
const EMAILJS_REPORT_TEMPLATE_ID = "template_hxg2o2o"
const EMAILJS_PUBLIC_KEY = "l9rggiY3zkvs9mnd4"

// Helper format nomor
const formatPhoneReadable = (phone: string): string => {
  const clean = phone.replace(/\D/g, '')
  if (clean.startsWith('62')) return '+62 ' + clean.slice(2)
  if (clean.startsWith('0')) return '+62 ' + clean.slice(1)
  return phone
}

const formatPhoneWA = (phone: string): string => {
  const clean = phone.replace(/\D/g, '')
  return clean.startsWith('62') ? clean : '62' + clean.slice(1)
}

// =======================
// SEND REPORT
// =======================
export const sendReportToAdmin = async (
  phone: string,
  name: string,
  email: string,
  result: AnalysisResult,
  contextResult: ContextualResult | null
): Promise<void> => {
  try {
    const timestamp = new Date().toLocaleString('id-ID')
    const readablePhone = formatPhoneReadable(phone)
    const waPhone = formatPhoneWA(phone)

    const summaryText = `
LAPORAN ANALISIS TULISAN TANGAN
==============================
Waktu    : ${timestamp}
Nama     : ${name}
Nomor HP : ${readablePhone}
WhatsApp : https://wa.me/${waPhone}

RINGKASAN KARAKTER:
${result.personalitySummary}
`

    await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_REPORT_TEMPLATE_ID,
      {
        user_name: name,
        phone: readablePhone,
        token: 'REPORT_RESULT',
        message: summaryText
      },
      EMAILJS_PUBLIC_KEY
    )
  } catch (err) {
    console.error('Gagal kirim email admin:', err)
  }
}
