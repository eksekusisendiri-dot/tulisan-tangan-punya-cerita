import React, { useState, useRef, useEffect } from 'react'
import { jsPDF } from "jspdf"
import { Layout } from './components/Layout'
import { AppState, AnalysisResult } from './types'
import {
  analyzeHandwriting,
  sendReportToAdmin
} from './services/geminiService'

export const App: React.FC = () => {
  /* =========================
     GLOBAL STATE
  ========================= */
  const [state, setState] = useState<AppState>(AppState.CHOICE)
  const [language, setLanguage] = useState<'id' | 'en'>('id')

  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)

  const [contextInput, setContextInput] = useState("")
  const [result, setResult] = useState<AnalysisResult | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [finalUserName, setFinalUserName] = useState("")

  const fileInputRef = useRef<HTMLInputElement>(null)

  /* =========================
     LOGIN STATE (LOCKED)
  ========================= */
  const [phone, setPhone] = useState("")
  const [tokenInput, setTokenInput] = useState("")
  const [challengeId, setChallengeId] = useState("")
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)

  /* =========================
     FETCH HUMAN CHALLENGE
  ========================= */
  useEffect(() => {
    if (state !== AppState.LOCKED) return

    fetch('/api/challenge')
      .then(res => res.json())
      .then(data => {
        setChallengeId(data.challengeId)
        setQuestion(data.question)
      })
      .catch(() => {
        setLoginError("Gagal memuat soal verifikasi")
      })
  }, [state])

  /* =========================
     HANDLE LOGIN
  ========================= */
  const handleLogin = async () => {
    setLoginError(null)
    setLoginLoading(true)

    try {
      const res = await fetch('/api/verify-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          token: tokenInput,
          challengeId,
          answer: Number(answer)
        })
      })

      const data = await res.json()

      if (!res.ok) {
        setLoginError(data.error || 'Login gagal')
        setLoginLoading(false)
        return
      }

      // LOGIN BERHASIL
      setState(AppState.READY_FOR_UPLOAD)

    } catch {
      setLoginError('Server tidak dapat dihubungi')
    } finally {
      setLoginLoading(false)
    }
  }

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
    setPhone("")
    setTokenInput("")
    setAnswer("")
  }

  /* =========================
     PDF
  ========================= */
  const downloadSimplePDF = () => {
    if (!result) return

    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text("Hasil Analisis Tulisan Tangan", 20, 20)
    doc.setFontSize(11)
    doc.text(result.personalitySummary, 20, 40, { maxWidth: 170 })
    doc.save("hasil-analisis.pdf")
  }

  /* =========================
     RENDER
  ========================= */
  return (
    <Layout>

      {/* CHOICE */}
      {state === AppState.CHOICE && (
        <div className="text-center py-20">
          <h1 className="text-3xl font-bold mb-4">Tulisan Tangan Punya Cerita</h1>
          <button
            className="bg-indigo-600 text-white px-6 py-3 rounded-xl"
            onClick={() => setState(AppState.LOCKED)}
          >
            Mulai Analisis
          </button>
        </div>
      )}

      {/* LOGIN */}
      {state === AppState.LOCKED && (
        <div className="max-w-md mx-auto py-20 space-y-4">
          <h2 className="text-2xl font-bold text-center">Verifikasi Akses</h2>

          <input
            className="border p-3 rounded-xl w-full"
            placeholder="Nomor HP"
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />

          <input
            className="border p-3 rounded-xl w-full"
            placeholder="Token"
            value={tokenInput}
            onChange={e => setTokenInput(e.target.value)}
          />

          <label className="block font-medium">{question}</label>
          <input
            className="border p-3 rounded-xl w-full"
            placeholder="Jawaban"
            value={answer}
            onChange={e => setAnswer(e.target.value)}
          />

          {loginError && <p className="text-red-600">{loginError}</p>}

          <button
            onClick={handleLogin}
            disabled={loginLoading}
            className="bg-indigo-600 text-white px-6 py-3 rounded-xl w-full"
          >
            {loginLoading ? "Memverifikasi..." : "Masuk"}
          </button>
        </div>
      )}

      {/* UPLOAD */}
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

          {error && <p className="text-red-500">{error}</p>}

          <button
            onClick={handleProcessAnalysis}
            className="bg-indigo-600 text-white px-6 py-3 rounded-xl w-full"
          >
            Proses Analisis
          </button>
        </div>
      )}

      {/* ANALYZING */}
      {state === AppState.ANALYZING && (
        <div className="text-center py-20">
          <p>Menganalisis tulisan tangan…</p>
        </div>
      )}

      {/* ERROR */}
      {state === AppState.ERROR && (
        <div className="text-center py-20">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={reset} className="bg-indigo-600 text-white px-6 py-3 rounded-xl">
            Kembali
          </button>
        </div>
      )}

      {/* RESULT */}
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
