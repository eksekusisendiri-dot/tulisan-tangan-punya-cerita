import React, { useState, useRef } from 'react'
import { jsPDF } from "jspdf"
import { Layout } from './components/Layout'
import { AppState, AnalysisResult } from './types'
import {
  analyzeHandwriting,
  sendReportToAdmin
} from './services/geminiService'

export const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.CHOICE)
  const [language, setLanguage] = useState<'id' | 'en'>('id')

  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)

  const [contextInput, setContextInput] = useState("")
  const [result, setResult] = useState<AnalysisResult | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [finalUserName, setFinalUserName] = useState("")

  const fileInputRef = useRef<HTMLInputElement>(null)

  /* =========================
     UPLOAD IMAGE
  ========================= */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      setImagePreview(base64)
      setImageBase64(base64)
    }
    reader.readAsDataURL(file)
  }

  /* =========================
     PROCESS ANALYSIS
  ========================= */
  const handleProcessAnalysis = async () => {
    if (!imageBase64) {
      setError("Silakan pilih gambar terlebih dahulu.")
      return
    }

    setState(AppState.ANALYZING)
    setError(null)

    try {
      const analysisData = await analyzeHandwriting(imageBase64, language)
      setResult(analysisData)

      // kirim laporan admin (aman, tidak blok UI)
      sendReportToAdmin(
        "-",
        finalUserName || "Pengguna",
        "Otomatis System",
        analysisData,
        null
      ).catch(console.error)

      setState(AppState.RESULT)
    } catch (err) {
      console.error(err)
      setError("Gagal menganalisis. Pastikan gambar jelas & koneksi stabil.")
      setState(AppState.ERROR)
    }
  }

  const downloadSimplePDF = () => {
  if (!result) {
    alert("Belum ada hasil analisis")
    return
  }

  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.text("Hasil Analisis Tulisan Tangan", 20, 20)

  doc.setFontSize(11)
  let y = 40

  if (typeof result === "string") {
    doc.text(result, 20, y, { maxWidth: 170 })
  } else {
    const text = JSON.stringify(result, null, 2)
    doc.text(text, 20, y, { maxWidth: 170 })
  }

  doc.save("hasil-analisis.pdf")
}

  /* =========================
     RESET
  ========================= */
  const reset = () => {
    setState(AppState.CHOICE)
    setResult(null)
    setImagePreview(null)
    setImageBase64(null)
    setContextInput("")
    setError(null)
    setFinalUserName("")
  }

  /* =========================
     PDF
  ========================= */
  const generatePDF = () => {
    if (!result || !finalUserName) return

    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text("Hasil Analisis Tulisan Tangan", 20, 20)

    doc.setFontSize(11)
    doc.text(`Nama: ${finalUserName}`, 20, 35)
    doc.text(result.personalitySummary, 20, 50, { maxWidth: 170 })

    doc.save(`Hasil_Grafologi_${finalUserName}.pdf`)
  }

  return (
    <Layout>

      {state === AppState.CHOICE && (
        <div className="text-center py-20">
          <h1 className="text-3xl font-bold mb-4">Tulisan Tangan Punya Cerita</h1>
          <button
            className="bg-indigo-600 text-white px-6 py-3 rounded-xl"
            onClick={() => setState(AppState.READY_FOR_UPLOAD)}
          >
            Mulai Analisis
          </button>
        </div>
      )}

      {state === AppState.READY_FOR_UPLOAD && (
        <div className="max-w-3xl mx-auto space-y-6">

          <div
            className="border-4 border-dashed p-10 text-center cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            {imagePreview
              ? <img src={imagePreview} className="max-h-64 mx-auto" />
              : <p>Pilih gambar tulisan tangan</p>}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <textarea
            className="w-full border p-4 rounded-xl"
            placeholder="Konteks (opsional, belum diproses)"
            value={contextInput}
            onChange={e => setContextInput(e.target.value)}
          />

          {error && <p className="text-red-500">{error}</p>}

          <button
            onClick={handleProcessAnalysis}
            className="bg-indigo-600 text-white px-6 py-3 rounded-xl w-full"
          >
            Proses Analisis
          </button>
        </div>
      )}

      {state === AppState.ANALYZING && (
        <div className="text-center py-20">
          <div className="animate-spin w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full mx-auto mb-4"></div>
          <p>Menganalisis tulisan tangan…</p>
        </div>
      )}

      {state === AppState.ERROR && (
        <div className="text-center py-20">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={reset} className="bg-indigo-600 text-white px-6 py-3 rounded-xl">
            Kembali
          </button>
        </div>
      )}

      {state === AppState.RESULT && result && (
        <div className="max-w-4xl mx-auto py-10 space-y-6">
          <h2 className="text-2xl font-bold">Hasil Analisis</h2>

          <p className="italic">{result.personalitySummary}</p>

          <input
            className="border p-3 rounded-xl w-full"
            placeholder="Nama pemilik tulisan"
            value={finalUserName}
            onChange={e => setFinalUserName(e.target.value)}
          />

          <button
            onClick={downloadSimplePDF}
            className="bg-green-600 text-white px-6 py-3 rounded-lg"
          >
            Unduh PDF
          </button>

          <button
            onClick={reset}
            className="block mt-4 text-sm text-slate-500 underline"
          >
            Selesai
          </button>
        </div>
      )}

    </Layout>
  )
}
