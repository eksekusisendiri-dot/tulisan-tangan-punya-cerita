import { GoogleGenAI, Type } from "@google/genai";
import emailjs from '@emailjs/browser';
import { AnalysisResult, ContextualResult } from '../types';

const ai = new GoogleGenAI({
  apiKey: import.meta.env.VITE_GEMINI_API_KEY
});

// ==============================================================================
//  DISINI TEMPAT MENULISKAN ID EMAILJS ANDA
// ==============================================================================
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

export const analyzeHandwriting = async (base64Image: string, language: 'id' | 'en' = 'id'): Promise<AnalysisResult> => {
  const langPrompt = language === 'id' ? 'Bahasa Indonesia' : 'English';
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Image
            }
          },
          {
            text: `Analyze this handwriting sample using graphology principles. 
            Identify key personality traits based on slant, pressure, size, spacing, margins, and letter forms.
            
            IMPORTANT: Provide all text outputs strictly in ${langPrompt}.
            
            Provide the output in JSON format with the following structure:
            - personalitySummary: A paragraph summarizing the person's character in ${langPrompt}.
            - strengths: An array of 3-5 positive traits in ${langPrompt}.
            - weaknesses: An array of 3-5 negative traits or areas for improvement in ${langPrompt}.
            - traits: An array of detailed observations. Each trait object must have:
              - feature: The visual feature observed (e.g., "Miring Kanan", "Loop Besar") in ${langPrompt}.
              - observation: Description of the feature in this sample in ${langPrompt}.
              - interpretation: The psychological meaning in ${langPrompt}.
              - confidence: A number between 0.0 and 1.0.
            - graphologyBasis: A brief explanation of the main graphological principles applied here in ${langPrompt}.`
          }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            personalitySummary: { type: Type.STRING },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
            traits: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  feature: { type: Type.STRING },
                  observation: { type: Type.STRING },
                  interpretation: { type: Type.STRING },
                  confidence: { type: Type.NUMBER }
                },
                required: ["feature", "observation", "interpretation", "confidence"]
              }
            },
            graphologyBasis: { type: Type.STRING }
          },
          required: ["personalitySummary", "strengths", "weaknesses", "traits", "graphologyBasis"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as AnalysisResult;
    }
    throw new Error("No response text from Gemini");
  } catch (error) {
    console.error("Gemini Analysis Failed:", error);
    throw error;
  }
};

export const analyzeContextualHandwriting = async (previousResult: AnalysisResult, context: string, language: 'id' | 'en' = 'id'): Promise<ContextualResult> => {
  const langPrompt = language === 'id' ? 'Bahasa Indonesia' : 'English';

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          {
            text: `Based on the following graphology analysis (JSON):
            ${JSON.stringify(previousResult)}
            
            And the user's specific context/question:
            "${context}"
            
            IMPORTANT: Provide all text outputs strictly in ${langPrompt}.

            Provide a contextual analysis in JSON format:
            - relevanceExplanation: Explain how the user's traits are relevant to this context in ${langPrompt}.
            - suitabilityScore: A number from 0 to 100 indicating fit/success probability.
            - actionableAdvice: 3-4 specific tips for the user in ${langPrompt}.
            - specificRisks: 2-3 specific risks to watch out for in ${langPrompt}.`
          }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            relevanceExplanation: { type: Type.STRING },
            suitabilityScore: { type: Type.NUMBER },
            actionableAdvice: { type: Type.ARRAY, items: { type: Type.STRING } },
            specificRisks: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["relevanceExplanation", "suitabilityScore", "actionableAdvice", "specificRisks"]
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as ContextualResult;
    }
    throw new Error("No response text from Gemini");
  } catch (error) {
    console.error("Gemini Contextual Analysis Failed:", error);
    throw error;
  }
};