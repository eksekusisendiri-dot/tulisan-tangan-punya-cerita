import emailjs from '@emailjs/browser';
import { AnalysisResult, ContextualResult } from '../types';

const EMAILJS_SERVICE_ID = "service_pxkzcpd";
const EMAILJS_REPORT_TEMPLATE_ID = "template_hxg2o2o"; 
const EMAILJS_PUBLIC_KEY = "l9rggiY3zkvs9mnd4";

// Helper Date
export const getDateString = (date: Date = new Date()): string => {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0'); 
  const y = date.getFullYear();
  return `${d}${m}${y}`;
};

// =======================
// Helper format nomor HP
// =======================
const formatPhoneReadable = (phone: string): string => {
  const clean = phone.replace(/\D/g, '');

  if (clean.startsWith('62')) {
    return '+62 ' + clean.slice(2).replace(/(\d{3})(\d{4})(\d+)/, '$1-$2-$3');
  }

  if (clean.startsWith('0')) {
    const intl = '62' + clean.slice(1);
    return '+62 ' + intl.slice(2).replace(/(\d{3})(\d{4})(\d+)/, '$1-$2-$3');
  }

  return phone;
};

const formatPhoneWA = (phone: string): string => {
  const clean = phone.replace(/\D/g, '');
  return clean.startsWith('62') ? clean : '62' + clean.slice(1);
};


export const sendReportToAdmin = async (phone: string, name: string, email: string, result: AnalysisResult, contextResult: ContextualResult | null): Promise<void> => {
    try {
        const timestamp = new Date().toLocaleString('id-ID');
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

KEKUATAN UTAMA:
- ${result.strengths.join('\n- ')}

AREA RISIKO:
- ${result.weaknesses.join('\n- ')}

KECOCOKAN KONTEKS:
Skor: ${contextResult?.suitabilityScore || 0}%
${contextResult?.relevanceExplanation || '-'}
`


        await emailjs.send(
            EMAILJS_SERVICE_ID,
            EMAILJS_REPORT_TEMPLATE_ID,
            {
                user_name: name, 
                phone: phone, 
                token: "REPORT_RESULT", 
                message: summaryText 
            },
            EMAILJS_PUBLIC_KEY
        );
    } catch (error) {
        console.error("Gagal mengirim laporan ke admin:", error);
    }
};

// =======================================================
// Kirim analisis tulisan tangan ke SERVER (Vercel API)
// =======================================================
export async function analyzeHandwritingViaServer(
  imageBase64: string,
  language: 'id' | 'en',
  context?: string
) {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      imageBase64,
      language,
      context
    })
  })

  if (!res.ok) {
    throw new Error('Gagal memanggil server analisis')
  }

  return await res.json()
}

