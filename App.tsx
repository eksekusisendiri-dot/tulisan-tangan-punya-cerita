import React, { useState, useRef, useEffect } from 'react'
import { jsPDF } from "jspdf"
import { Layout } from './components/Layout'
import { AppState, AnalysisResult, ContextualResult } from './types'
import {
  analyzeHandwriting,
  analyzeContextualHandwriting,
  sendReportToAdmin
} from './services/geminiService'
import { supabase } from './services/supabaseClient'

// ===============================
// IMAGE COMPRESSION (WAJIB)
// ===============================
const compressImage = (
  file: File,
  maxWidth = 1280,
  quality = 0.7
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()

    reader.onload = () => {
      img.src = reader.result as string
    }

    reader.onerror = reject

    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, maxWidth / img.width)

      canvas.width = img.width * scale
      canvas.height = img.height * scale

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject('Canvas error')
        return
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      const compressed = canvas.toDataURL('image/jpeg', quality)
      resolve(compressed)
    }
  })
}


// --- KONFIGURASI ADMIN ---
// Ubah nomor ini di satu tempat saja, otomatis semua link WA di aplikasi akan berubah.
const ADMIN_WA = "62895802824612"; 

export const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.CHOICE);
  const [phone, setPhone] = useState("");
  

  // Registration State
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");

  // Final Report State
  const [finalUserName, setFinalUserName] = useState("");

  // --- LOGIKA SESI & SECURITY ---
  // Kita ganti 'generatedToken' dengan 'activeSession' karena token sekarang di DB
  const [activeSession, setActiveSession] = useState<boolean>(() => {
    const savedSession = localStorage.getItem('sessionActive');
    const savedTimestamp = localStorage.getItem('sessionTimestamp');
    
    if (savedSession && savedTimestamp) {
      const now = Date.now();
      const oneDay = 24 * 60 * 60 * 1000; 
      if (now - parseInt(savedTimestamp) > oneDay) {
        localStorage.removeItem('sessionActive');
        localStorage.removeItem('sessionTimestamp');
        return false;
      }
      return true;
    }
    return false;
  });

  const [inputToken, setInputToken] = useState("");
  
  // New State for Language
  const [language, setLanguage] = useState<'id' | 'en'>('id');
  
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [contextResult, setContextResult] = useState<ContextualResult | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  
  const [contextInput, setContextInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Jika sesi aktif saat load, langsung pindah ke upload
  useEffect(() => {
    if (activeSession && state === AppState.CHOICE) {
       // Opsional: Langsung lompat jika refresh
       // setState(AppState.READY_FOR_UPLOAD);
       // Namun agar user tidak bingung, kita biarkan di Choice dulu, 
       // tapi kalau dia klik "Punya Token", bisa kita bypass atau biarkan dia input ulang?
       // Untuk keamanan lebih baik, biarkan sesi dihandle saat verifikasi ulang atau buat logic auto-login.
       // Disini kita set sederhana: simpan state di localStorage agar 'persistent'
    }
  }, [activeSession]);

  const handleCreateOrder = async (e: React.FormEvent) => {
  e.preventDefault()

  if (regPhone.length < 10) {
    setError("Nomor HP minimal 10 digit.")
    return
  }
  if (!regName) {
    setError("Mohon isi Nama Anda.")
    return
  }

  setIsLoading(true)
  setError(null)

  try {
    // SIMPAN PENDAFTARAN SAJA (TANPA TOKEN)
    const { error } = await supabase
      .from('orders')
      .insert([
        {
          name: regName,
          phone: regPhone,
          status: 'pending'
        }
      ])

    if (error) {
      throw error
    }

    // Buka WhatsApp Admin (tetap seperti sekarang)
    const message = `Halo, Saya ${regName}\nIngin melakukan pendaftaran token untuk akses sekali pakai pada aplikasi Tulisan Tangan Punya Cerita`
    const waUrl = `https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(message)}`
    window.open(waUrl, '_blank')

    setState(AppState.PAYMENT_PENDING)
  } catch (err) {
    console.error(err)
    setError("Gagal memproses permintaan. Pastikan koneksi internet stabil.")
  } finally {
    setIsLoading(false)
  }
}


  const handleVerifyToken = async (e: React.FormEvent) => {
  e.preventDefault()
  const verificationPhone = phone || regPhone

  if (verificationPhone.length < 10) {
    setError("Nomor WhatsApp tidak valid.")
    return
  }

  setIsLoading(true)
  setError(null)
  

  try {
    // 1️⃣ CEK TOKEN KE DATABASE sdh dihapus fungsinya karena bahaya bisa akses langsung ke tabel DB
    // 2️⃣ BURN TOKEN (ANTI REUSE) sama dengan nomor 1. Gantinya adalah kode dibawah ini

    const { data, error } = await supabase.rpc(
  'verify_and_burn_token',
  {
    p_phone: verificationPhone,
    p_token: inputToken
  }
)

if (error || data !== true) {
  setError("Token tidak valid, salah nomor HP, atau sudah terpakai.")
  setIsLoading(false)
  return
}

    // 3️⃣ SET SESI LOKAL (INI BOLEH TETAP)
    localStorage.setItem('sessionActive', 'true')
    localStorage.setItem('sessionTimestamp', Date.now().toString())
    setActiveSession(true)

    setState(AppState.READY_FOR_UPLOAD)

    if (regName) setFinalUserName(regName)

  } catch (err) {
    console.error(err)
    setError("Terjadi kesalahan saat verifikasi token.")
  } finally {
    setIsLoading(false)
  }
}

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return

  try {
    setError(null)

    // 🔥 COMPRESS DI SINI
    const compressed = await compressImage(file)

    setImagePreview(compressed)
    setImageBase64(compressed.split(',')[1])
  } catch (err) {
    console.error(err)
    setError('Gagal memproses gambar. Coba foto lain.')
  }
}


  const handleProcessAnalysis = async () => {
    if (!imageBase64) {
      setError("Silakan pilih gambar terlebih dahulu.");
      return;
    }
    
    if (contextInput.length > 0 && contextInput.length < 5) {
        setError("Jika mengisi konteks, mohon tuliskan lebih detail.");
        return;
    }

    // Token sudah di-burn di database saat verifikasi token.
    // Disini kita hanya menghapus sesi lokal agar tidak bisa back/refresh untuk analisis ulang.
    setActiveSession(false);
    localStorage.removeItem('sessionActive');
    localStorage.removeItem('sessionTimestamp');

    setState(AppState.ANALYZING);
    setError(null);

    try {
      const analysisData = await analyzeHandwriting(imageBase64, language);
      setResult(analysisData);

      let contextData = null;
      if (contextInput.trim()) {
        setState(AppState.ANALYZING_CONTEXT);
        contextData = await analyzeContextualHandwriting(analysisData, contextInput, language);
        setContextResult(contextData);
      } else {
        setContextResult(null);
      }

      const reportingName = regName || finalUserName || "Pengguna Tanpa Nama";
      const reportingPhone = phone || regPhone || "No HP Kosong";

// 🔔 EMAIL ADMIN — trigger utama
sendReportToAdmin(
  reportingPhone,
  reportingName,
  "Otomatis System",
  analysisData,
  contextData
)
  .then(() => console.log("📧 Laporan otomatis terkirim ke admin"))
  .catch(err => console.error("❌ Gagal kirim laporan admin:", err));

// 🎯 BARU tampilkan hasil ke user
setState(AppState.RESULT);
    } catch (err: any) {
      setError("Gagal menganalisis. Pastikan gambar jelas atau koneksi internet stabil.");
      setState(AppState.ERROR);
    }
  };

  const generateAndSendPDF = async () => {
    if (!finalUserName.trim()) {
        alert("Mohon isi Nama Pemilik Tulisan sebelum mengunduh laporan.");
        return;
    }

    setIsLoading(true);
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;

    const FONT_FAMILY = "helvetica";
    const HEADING_SIZE = 14;     
    const SUB_HEADING_SIZE = 12; 
    const BODY_SIZE = 11;        
    
    doc.setLineHeightFactor(1.5);
    doc.setFont(FONT_FAMILY, "normal");

    const addCommonElements = (pageNumber: number) => {
        // Header
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.setFont(FONT_FAMILY, "italic");
        const headerText = `Analisis Tulisan Tangan lainnya dengan menghubungi Admin pada nomor: +${ADMIN_WA}`;
        doc.text(headerText, pageWidth - margin, 10, { align: "right" });

        // Footer - POSISI DIPERBAIKI (NAIK KE ATAS)
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.setFont(FONT_FAMILY, "normal");
        
        // Menggunakan max width lebih kecil sedikit dari margin untuk menghindari pemotongan
        const footerText = "Catatan Privasi: Sistem tidak menyimpan foto maupun hasil analisis. Data hanya diproses sementara dan hasil sepenuhnya diunduh serta dimiliki oleh Anda.";
        
        // Pindahkan Y posisi lebih ke atas (pageHeight - 25) agar aman dari batas bawah printer/layar
        const footerY = pageHeight - 25; 
        
        doc.text(footerText, margin, footerY, { 
            align: "justify", 
            maxWidth: pageWidth - (margin * 2),
            lineHeightFactor: 1.2 // Spasi baris footer lebih rapat sedikit agar kompak
        });
        
        // Page Number
        doc.text(`Halaman ${pageNumber}`, pageWidth - margin, footerY + 10, { align: "right" });

        // Reset color
        doc.setTextColor(0, 0, 0); 
    };

    const addText = (
        text: string, 
        x: number, 
        y: number, 
        fontSize: number = BODY_SIZE, 
        isBold: boolean = false, 
        align: "left" | "center" | "right" | "justify" = "justify", 
        maxWidth?: number
    ): number => {
        doc.setFontSize(fontSize);
        doc.setFont(FONT_FAMILY, isBold ? "bold" : "normal");
        
        const validMaxWidth = maxWidth || (pageWidth - (margin * 2));
        const lines = doc.splitTextToSize(text, validMaxWidth);
        
        doc.text(lines, x, y, { 
            align: align,
            maxWidth: validMaxWidth,
            lineHeightFactor: 1.5 
        });

        // Calculate Next Y
        return y + (lines.length * fontSize * 0.3528 * 1.5) + 4; 
    };

    // --- GENERATE CONTENT (Sama seperti sebelumnya) ---
    addCommonElements(1);
    let yPos = 50;
    yPos = addText("Cerita Di Balik Tulisan Tangan Anda", pageWidth / 2, yPos, 22, true, "center");
    yPos = addText("(Sebuah Probabilitas)", pageWidth / 2, yPos, 16, false, "center");

    yPos += 30;
    const boxHeight = 70;
    doc.setDrawColor(50, 50, 50);
    doc.setLineWidth(0.5);
    doc.rect(margin, yPos, pageWidth - (margin * 2), boxHeight);
    
    const insideY = yPos + 20;
    addText("IDENTITAS PEMILIK", pageWidth / 2, insideY, HEADING_SIZE, true, "center");
    addText(`Nama Lengkap   : ${finalUserName}`, margin + 15, insideY + 15, BODY_SIZE, false, "left");
    addText(`Nomor Kontak   : ${phone || regPhone}`, margin + 15, insideY + 25, BODY_SIZE, false, "left");
    addText(`Tanggal Analisis : ${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, margin + 15, insideY + 35, BODY_SIZE, false, "left");

    doc.addPage();
    addCommonElements(2);
    if (imagePreview) {
        try {
            const imgProps = doc.getImageProperties(imagePreview);
            const availableWidth = pageWidth - (margin * 2);
            const availableHeight = pageHeight - (margin * 2) - 40; 
            const ratio = Math.min(availableWidth / imgProps.width, availableHeight / imgProps.height);
            const imgW = imgProps.width * ratio;
            const imgH = imgProps.height * ratio;
            const xImg = (pageWidth - imgW) / 2;
            const yImg = (pageHeight - imgH) / 2;
            doc.addImage(imagePreview, 'JPEG', xImg, yImg, imgW, imgH);
            addText("Bukti Sampel Tulisan Tangan", pageWidth/2, yImg - 15, HEADING_SIZE, true, "center");
        } catch (e) { console.error(e); }
    }

    if (result) {
        doc.addPage();
        addCommonElements(3);
        yPos = 30;
        yPos = addText("A. Ringkasan Kepribadian", margin, yPos, HEADING_SIZE, true, "left");
        yPos += 5;
        yPos = addText("1. Gambaran Umum", margin + 5, yPos, SUB_HEADING_SIZE, true, "left");
        yPos = addText(result.personalitySummary, margin + 5, yPos, BODY_SIZE, false, "justify");
        yPos += 5;
        yPos = addText("2. Kekuatan Utama", margin + 5, yPos, SUB_HEADING_SIZE, true, "left");
        result.strengths.forEach(s => { yPos = addText(`• ${s}`, margin + 5, yPos, BODY_SIZE, false, "justify"); });
        yPos += 5;
        yPos = addText("3. Area Pengembangan (Kelemahan)", margin + 5, yPos, SUB_HEADING_SIZE, true, "left");
        result.weaknesses.forEach(w => { yPos = addText(`• ${w}`, margin + 5, yPos, BODY_SIZE, false, "justify"); });
    }

    doc.addPage();
    addCommonElements(4);
    yPos = 30;
    yPos = addText("B. Analisis Situasional", margin, yPos, HEADING_SIZE, true, "left");
    yPos += 5;

    if (contextResult) {
        yPos = addText("1. Konteks Pengajuan", margin + 5, yPos, SUB_HEADING_SIZE, true, "left");
        yPos = addText(contextInput, margin + 5, yPos, BODY_SIZE, false, "justify");
        yPos += 5;
        yPos = addText("2. Tingkat Kecocokan & Relevansi", margin + 5, yPos, SUB_HEADING_SIZE, true, "left");
        yPos = addText(`Skor Kecocokan: ${contextResult.suitabilityScore}%`, margin + 5, yPos, BODY_SIZE, true, "left");
        yPos = addText(contextResult.relevanceExplanation, margin + 5, yPos, BODY_SIZE, false, "justify");
        yPos += 5;
        yPos = addText("3. Saran Praktis", margin + 5, yPos, SUB_HEADING_SIZE, true, "left");
        contextResult.actionableAdvice.forEach(a => { yPos = addText(`• ${a}`, margin + 5, yPos, BODY_SIZE, false, "justify"); });
    } else {
        doc.setTextColor(100, 100, 100);
        doc.setFont(FONT_FAMILY, "italic");
        const fallbackText = "Tidak Ada Data Konteks atau Pertanyaan Spesifik yang Dapat Dikaitkan Dengan Hasil Analisa";
        doc.text(doc.splitTextToSize(fallbackText, pageWidth - (margin * 2)), margin, yPos);
    }

    if (result) {
        doc.addPage();
        addCommonElements(5);
        yPos = 30;
        yPos = addText("C. Analisis Teknikal (Rincian Grafologis)", margin, yPos, HEADING_SIZE, true, "left");
        yPos += 5;
        result.traits.forEach((t, index) => {
            if (yPos > pageHeight - 50) {
                doc.addPage();
                addCommonElements(doc.getNumberOfPages());
                yPos = 30;
            }
            yPos = addText(`${index + 1}. ${t.feature} (${Math.round(t.confidence * 100)}%)`, margin + 5, yPos, SUB_HEADING_SIZE, true, "left");
            yPos = addText(`Observasi: ${t.observation}`, margin + 5, yPos, BODY_SIZE, false, "justify");
            yPos = addText(`Interpretasi: ${t.interpretation}`, margin + 5, yPos, BODY_SIZE, false, "justify");
            yPos += 4; 
        });
    }

    doc.save(`Hasil_Grafologi_${finalUserName.replace(/\s+/g, '_')}.pdf`);
    setIsLoading(false);
    alert("Laporan berhasil diunduh. Data akan hilang jika Anda refresh halaman.");
  };

  const reset = () => {
    setState(AppState.CHOICE);
    setResult(null);
    setContextResult(null);
    setImagePreview(null);
    setImageBase64(null);
    setContextInput("");
    setPhone("");
    setRegName("");
    setRegPhone("");
    setFinalUserName("");
    setInputToken("");
    setError(null);
    setLanguage('id'); 
    setActiveSession(false);
    localStorage.removeItem('sessionActive');
    localStorage.removeItem('sessionTimestamp');
  };

  return (
    <Layout>
      {/* 0. PILIHAN AWAL */}
      {state === AppState.CHOICE && (
        <div className="max-w-2xl mx-auto py-12 animate-fadeIn">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-extrabold text-slate-800 mb-4 tracking-tight">Selamat Datang <br/><span className="text-indigo-600">Para Penjelajah Tulisan Tangan</span></h2>
            <p className="text-slate-600 text-lg mt-4">Dapatkan gambaran diri secara probabilistik melalui analisis tulisan tangan Anda.</p>
                       
          </div>
          
          {/* SECTION: Knowledge Hook (Brain Prints) with Image */}
          <div className="bg-white rounded-3xl shadow-lg overflow-hidden mb-12 border border-slate-100 group hover:border-indigo-200 transition-all">
             <div className="md:flex">
               {/* Image Section - 40% Width on Desktop */}
               <div className="md:w-2/5 h-64 md:h-auto relative overflow-hidden bg-slate-50 flex items-center justify-center">
                 <img 
                   src="https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&q=80&w=1000" 
                   alt="Handwriting Illustration" 
                   className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700 opacity-90 hover:opacity-100"
                 />
                 <div className="absolute inset-0 bg-indigo-900/10 group-hover:bg-transparent transition-colors duration-500"></div>
                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity duration-500">
                    <span className="text-5xl md:text-6xl font-black text-white tracking-tighter drop-shadow-lg" style={{ fontFamily: 'cursive' }}>
                        Handwriting
                    </span>
                 </div>
               </div>

               {/* Text Section - 60% Width on Desktop */}
               <div className="p-8 md:w-3/5 flex flex-col justify-center">
                 <div className="flex items-center space-x-3 mb-4">
                    <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg">Brain Prints: Jejak Otak di Atas Kertas</h3>
                 </div>
                 
                 <div className="prose prose-sm text-slate-600 text-justify leading-relaxed space-y-4">
                    <p>
                        Selama ini kita menulis menggunakan tangan, seolah-olah tulisan sepenuhnya ditentukan oleh gerakan tangan. Namun bayangkan jika Anda berusaha menulis menggunakan mulut, kaki, atau anggota tubuh lain.
                    </p>
                    <p>
                        Pada awalnya bentuk tulisan akan sangat berbeda, tetapi seiring latihan, pola tulisannya akan kembali menyerupai tulisan tangan Anda sendiri, bukan milik orang lain. Hal ini terjadi karena yang direproduksi bukan sekadar gerakan fisik, melainkan <b>"brain prints"</b>, yaitu pola keputusan, kebiasaan, dan koordinasi yang terbentuk di dalam otak. Pola ini mengarahkan bagaimana otot bergerak, seberapa kuat tekanan diberikan, serta bagaimana ritme tulisan terbentuk.
                    </p>
                    <p className="border-l-4 border-indigo-200 pl-4 italic text-slate-500 bg-slate-50 py-2 rounded-r-lg">
                        Dari sudut pandang inilah analisis tulisan tangan dilakukan untuk menggali pola visual sebagai jejak kebiasaan kognitif dan motorik yang berulang, bukan sebagai penilaian mutlak, melainkan sebagai sarana refleksi dan pemahaman diri.
                    </p>
                 </div>
               </div>
             </div>
          </div>

          {/* Marketing Hook */}
            <div className="mt-8 bg-gradient-to-r from-indigo-50 to-white border border-indigo-100 rounded-2xl p-6 shadow-sm inline-block transform hover:scale-[1.02] transition-transform duration-300">
                <p className="text-indigo-900 text-base leading-relaxed">
                   <span className="font-bold block text-lg mb-1">🔥 Jangan lewatkan kesempatan emas ini!</span>
                   Tertarik menganalisis tulisan tangan Anda? Dapatkan token aksesnya hanya seharga <span className="font-black text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">Rp 30.000-an (tiga puluh ribuan)</span>.
                   Investasi kecil untuk pemahaman besar tentang diri Anda.
                </p>
            </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
            <button 
              onClick={() => { setState(AppState.LOCKED); setError(null); }}
              className="bg-white p-8 rounded-3xl shadow-lg border border-slate-100 hover:border-indigo-400 hover:shadow-indigo-100 transition-all text-left group flex flex-col justify-between"
            >
              <div>
                <div className="bg-indigo-100 w-12 h-12 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Dapatkan Akses</h3>
                <p className="text-sm text-slate-500 mb-4">Daftar & konfirmasi via WhatsApp untuk mendapatkan token akses.</p>
              </div>
              <div>
                <span className="inline-block bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1 rounded-lg border border-indigo-100 mb-2">
                  Rp 30.000-an / Sesi
                </span>
                <div className="flex items-center text-indigo-600 font-bold text-sm">
                  <span>Isi Formulir</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-2" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            </button>

            <button 
              onClick={() => { setState(AppState.TOKEN_REQUESTED); setError(null); }}
              className="bg-slate-800 p-8 rounded-3xl shadow-lg hover:bg-slate-900 transition-all text-left group flex flex-col justify-between"
            >
              <div>
                <div className="bg-slate-700 w-12 h-12 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Punya Token?</h3>
                <p className="text-sm text-slate-400">Masukkan token yang sudah Anda terima dari Admin via WhatsApp.</p>
              </div>
              <div className="mt-6 flex items-center text-white font-bold text-sm">
                <span>Gunakan Token</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-2" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
            </button>
          </div>
          
           {/* Disclaimer */}
           <div className="bg-yellow-100 border-2 border-yellow-400 p-6 rounded-3xl mx-auto shadow-lg relative overflow-hidden transform hover:scale-[1.01] transition-transform">
             <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-24 w-24 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
             </div>
             <h4 className="font-black text-red-600 mb-3 text-sm uppercase tracking-widest text-center flex items-center justify-center gap-2 relative z-10">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Penting: Disclaimer
             </h4>
             <p className="text-[11px] text-red-900 text-justify leading-relaxed font-medium relative z-10">
               Analisis yang dihasilkan oleh aplikasi ini bersifat interpretatif dan probabilistik, disusun berdasarkan prinsip-prinsip umum grafologi ilmiah dan pemrosesan AI sebagai alat bantu pemahaman, pengenalan diri (self-discovery), serta pengembangan potensi, sehingga hasilnya dapat bervariasi dan mungkin tidak sepenuhnya akurat atau dapat mengandung kekeliruan. Hasil analisis ini bukan merupakan diagnosis medis, psikologis, klinis, hukum, maupun keputusan profesional, dan tidak dapat dijadikan satu-satunya dasar dalam pengambilan keputusan penting. Dengan menggunakan aplikasi ini, pengguna memahami dan menyetujui bahwa hasil analisis digunakan sebagai referensi tambahan, serta disarankan untuk tetap mempertimbangkan sumber informasi lain dan berkonsultasi dengan profesional yang berwenang apabila berkaitan dengan kondisi kesehatan mental atau kebutuhan profesional lainnya.
             </p>
          </div>
        </div>
      )}

      {/* 1. FORM MINTA TOKEN */}
      {state === AppState.LOCKED && (
        <div className="max-w-md mx-auto bg-white p-8 rounded-3xl shadow-xl border border-slate-100 animate-fadeIn mt-10">
          <button onClick={() => setState(AppState.CHOICE)} className="text-slate-400 text-xs mb-6 flex items-center hover:text-slate-600">
            Kembali
          </button>
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-800">Formulir Pendaftaran</h2>
            <p className="text-slate-500 text-sm mt-2">Isi data dan konfirmasi via WhatsApp untuk mendapatkan token.</p>
          </div>

          <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex items-start space-x-3 mb-6">
              <div className="bg-indigo-600 rounded-full p-1 mt-0.5 shrink-0">
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
              </div>
              <div>
                <p className="text-xs font-bold text-indigo-900">Biaya Layanan: Rp 30.000-an</p>
                <p className="text-[10px] text-indigo-700 mt-0.5">Selesaikan pembayaran & konfirmasi di WhatsApp.</p>
              </div>
          </div>

          <form onSubmit={handleCreateOrder} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nama Lengkap</label>
              <input 
                type="text" 
                required
                placeholder="Nama Anda"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nomor WhatsApp</label>
              <input 
                type="tel" 
                required
                placeholder="08xxxxxxxx"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                value={regPhone}
                onChange={(e) => setRegPhone(e.target.value)}
              />
            </div>
            {error && <p className="text-red-500 text-xs font-medium">{error}</p>}
            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center"
            >
              {isLoading ? <span>Memproses...</span> : (
                <span className="flex items-center">
                    Lanjut ke WhatsApp
                    <svg className="w-4 h-4 ml-2" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.017-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                </span>
              )}
            </button>
          </form>

            <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-500 mb-6 mt-6">
                Untuk mendapatkan token, Anda harus menyelesaikan pendaftaran dan pembayaran. Token akan dikirimkan melalui whatsapp
            </div>

            <button 
               onClick={() => setState(AppState.TOKEN_REQUESTED)}
               className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl shadow-lg transition-all"
            >
               Masukkan Token
            </button>
            <button onClick={() => setState(AppState.CHOICE)} className="mt-4 text-slate-400 text-xs hover:text-slate-600">
                Kembali ke Beranda
            </button>
        </div>
      )}

      {/* 2. MENUNGGU TOKEN (PAYMENT PENDING) */}
      {state === AppState.PAYMENT_PENDING && (
        <div className="max-w-md mx-auto bg-white p-8 rounded-3xl shadow-xl border border-indigo-100 animate-fadeIn mt-10 text-center">
            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-2">Pendaftaran Terkirim!</h2>
            <p className="text-slate-600 text-sm mb-6">Silakan segera menghubungi Admin Tulisan Tangan Punya Cerita melalui whatsapp.</p>
            
            <a 
                href={`https://wa.me/${ADMIN_WA}?text=${encodeURIComponent(`Halo, Saya ${regName}\nIngin melakukan pendaftaran token untuk akses sekali pakai pada aplikasi Tulisan Tangan Punya Cerita`)}`}
                target="_blank"
                rel="noreferrer"
                className="block w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 rounded-xl shadow-lg transition-all flex items-center justify-center mb-4"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 24 24">
                     <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.017-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
                Buka WhatsApp
            </a>

            <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-500 mb-6">
                Untuk mendapatkan token, Anda harus menyelesaikan pendaftaran dan pembayaran. Token akan dikirimkan melalui whatsapp
            </div>

            <button 
               onClick={() => setState(AppState.TOKEN_REQUESTED)}
               className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl shadow-lg transition-all"
            >
               Masukkan Token
            </button>
            <button onClick={() => setState(AppState.CHOICE)} className="mt-4 text-slate-400 text-xs hover:text-slate-600">
                Kembali ke Beranda
            </button>
        </div>
      )}

      {/* 3. FORM VERIFIKASI (HP + TOKEN) */}
      {state === AppState.TOKEN_REQUESTED && (
        <div className="max-w-md mx-auto bg-white p-8 rounded-3xl shadow-xl border border-slate-100 animate-fadeIn mt-10">
          <button onClick={() => setState(AppState.CHOICE)} className="text-slate-400 text-xs mb-6 flex items-center hover:text-slate-600">
            Kembali
          </button>
          
          {/* Peringatan Persiapan Foto */}
          <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-6 rounded-r-xl">
             <div className="flex">
                <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                </div>
                <div className="ml-3">
                    <p className="text-sm text-amber-700 font-bold">
                        Persiapan Sebelum Masuk
                    </p>
                    <p className="text-xs text-amber-600 mt-1">
                        Pastikan Anda sudah memiliki <b>foto tulisan tangan yang jelas</b> di galeri HP/Laptop Anda sebelum melanjutkan. Token akan langsung diverifikasi setelah ini.
                    </p>
                    <p className="text-[10px] text-amber-600 mt-2 italic">
                        *Token dari WhatsApp dapat digunakan di perangkat apa pun (HP/Laptop).
                    </p>
                </div>
            </div>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-slate-800">Verifikasi Akses</h2>
            <p className="text-slate-500 text-sm mt-2">Silakan masukkan data verifikasi Anda untuk melanjutkan.</p>
          </div>
          <form onSubmit={handleVerifyToken} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nomor WhatsApp</label>
              <input 
                type="tel" 
                required
                placeholder="0812xxxxxxxx"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                value={phone || regPhone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">6 Digit Token</label>
              <input 
                type="text" 
                maxLength={6}
                required
                placeholder="xxxxxx"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-center text-2xl tracking-[0.4em] font-mono outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                value={inputToken}
                onChange={(e) => setInputToken(e.target.value)}
              />
            </div>
            {error && (
              <div className="space-y-3">
                <p className="text-red-500 text-xs font-medium text-center">{error}</p>
                <div className="flex justify-center">
                  <button 
                    type="button"
                    onClick={() => { setState(AppState.LOCKED); setError(null); }}
                    className="text-indigo-600 text-xs font-bold hover:underline py-1 px-3 bg-indigo-50 rounded-full"
                  >
                    Minta Token Baru
                  </button>
                </div>
              </div>
            )}
            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl shadow-lg transition-all"
            >
              {isLoading ? 'Memverifikasi...' : 'Masuk Ke Analisis'}
            </button>
          </form>
          <p className="mt-6 text-[10px] text-center text-slate-400 italic">
            *Token hanya bisa digunakan 1 kali untuk setiap analisis.
            <br/>Token berlaku selama 24 jam.
          </p>
        </div>
      )}

      {/* 4. READY FOR UPLOAD & INPUT CONTEXT */}
      {state === AppState.READY_FOR_UPLOAD && (
        <div className="space-y-8 animate-fadeIn">
          <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-3xl flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="bg-indigo-600 text-white p-2 rounded-xl">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-indigo-900">Akses Terbuka</p>
                <p className="text-xs text-indigo-600">Sesi analisis aktif untuk {regName}</p>
              </div>
            </div>
            
            {/* Language Toggle */}
            <div className="flex bg-white rounded-lg p-1 shadow-sm border border-indigo-100">
               <button 
                 onClick={() => setLanguage('id')}
                 className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${language === 'id' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
               >
                 ID
               </button>
               <button 
                 onClick={() => setLanguage('en')}
                 className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${language === 'en' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
               >
                 EN
               </button>
            </div>
          </div>

          <section className="text-center space-y-2">
            <h2 className="text-3xl font-extrabold text-slate-800">Persiapan Analisis</h2>
            <p className="text-slate-600 max-w-2xl mx-auto text-sm">
              Lengkapi data berikut sebelum memulai proses. Token akan hangus setelah tombol Proses ditekan.
            </p>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Kolom Kiri: Upload Gambar */}
            <div 
                onClick={() => fileInputRef.current?.click()}
                className={`border-4 border-dashed rounded-4xl p-8 text-center cursor-pointer transition-all group flex flex-col items-center justify-center min-h-[300px] relative overflow-hidden ${imagePreview ? 'border-indigo-600 bg-slate-900' : 'border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50'}`}
            >
                {imagePreview ? (
                    <>
                        <img src={imagePreview} alt="Preview" className="absolute inset-0 w-full h-full object-contain opacity-50 group-hover:opacity-30 transition-opacity" />
                        <div className="relative z-10 bg-white/90 p-4 rounded-xl shadow-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="text-xs font-bold text-slate-800">Ganti Gambar</span>
                        </div>
                    </>
                ) : (
                    <div className="space-y-4">
                        <div className="bg-indigo-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto shadow-inner">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-lg font-bold text-slate-700">Pilih File Foto Tulisan</p>
                            <p className="text-xs text-slate-400 mt-1">Format JPG/PNG Ukuran Kurang Dari 1 MB Atau 1000 Kb</p>
                        </div>
                    </div>
                )}
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
            </div>

            {/* Kolom Kanan: Konteks & Action */}
            <div className="bg-white p-8 rounded-4xl shadow-lg border border-slate-100 flex flex-col justify-between">
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-bold text-slate-700">
                            Konteks / Pertanyaan (Opsional)
                        </label>
                        <span className={`text-[10px] font-bold ${contextInput.length >= 200 ? 'text-red-500' : 'text-slate-400'}`}>
                            {contextInput.length}/200
                        </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-4">
                        {language === 'id' ? "Anda dapat mendeskripsikan situasi atau pertanyaan spesifik yang akan dihubungkan dengan hasil analisis tulisan tangan Anda." : "Write max 3 specific points/questions."}
                    </p>
                    <textarea 
                        maxLength={500}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all h-40 resize-none"
                        placeholder={language === 'id' ? "Misalnya: \n1. Bagaimana jika saya bekerja sebagai Data Analyst?\n2. Bagaimana karakter saya saat tertekan?\n3. ..." : "1. How would it be if I worked as a Data Analyst?\n2. ..."}
                        value={contextInput}
                        onChange={(e) => setContextInput(e.target.value)}
                    />
                </div>
                
                <div className="mt-8 space-y-4">
                     {error && <p className="text-red-500 text-xs font-medium text-center">{error}</p>}
                     <button 
                        onClick={handleProcessAnalysis}
                        disabled={!imagePreview}
                        className={`w-full py-4 rounded-2xl font-black shadow-xl transition-all flex items-center justify-center transform hover:-translate-y-1 ${imagePreview ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                     >
                        {imagePreview ? 'PROSES ANALISIS SEKARANG' : 'Pilih Gambar Dulu'}
                        {imagePreview && (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                        )}
                     </button>
                     {/*<p className="text-[10px] text-center text-red-400 italic">
                        Keterangan Saat Proses Di Tekan
                     </p>*/}
                </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. PROCESSING STATES */}
      {(state === AppState.ANALYZING || state === AppState.ANALYZING_CONTEXT) && (
        <div className="flex flex-col items-center justify-center py-20 space-y-8 animate-pulse">
          <div className="w-20 h-20 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
          <div className="text-center">
            <h3 className="text-2xl font-bold text-slate-800">
              {state === AppState.ANALYZING ? "Menganalisis Goresan..." : "Menghubungkan dengan Konteks..."}
            </h3>
            <p className="text-slate-500 mt-2">Mohon tunggu, AI sedang bekerja untuk Anda.</p>
          </div>
        </div>
      )}

      {state === AppState.ERROR && (
        <div className="text-center py-20 space-y-6 animate-fadeIn">
          <div className="bg-red-50 text-red-600 p-8 rounded-3xl border border-red-100 max-w-md mx-auto">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="font-bold text-lg">{error}</p>
          </div>
          <button onClick={reset} className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-bold shadow-xl hover:bg-indigo-700 transition-all">Kembali ke Beranda</button>
        </div>
      )}

      {/* 6. HASIL ANALISIS LENGKAP */}
      {state === AppState.RESULT && result && (
        <div className="space-y-8 animate-fadeIn pb-20">
          
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <h2 className="text-3xl font-black text-slate-800">Hasil Analisis Lengkap</h2>
          </div>

          {/* Form Finalisasi Data */}
          <div className="bg-gradient-to-r from-slate-100 to-indigo-50 border border-indigo-100 p-6 rounded-3xl shadow-sm mb-6">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Unduh Laporan Anda
            </h3>
            
            <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl mb-6">
                <p className="text-yellow-800 text-sm font-medium flex items-start">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Peringatan: Hasil akan hilang dan tidak dapat dikembalikan saat Anda merefresh halaman ini. Segera unduh laporan Anda. Hanya Anda yang dapat melihat foto tulisan dan hasil analisanya.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nama Pemilik Tulisan</label>
                    <input 
                        type="text" 
                        required
                        placeholder="Cth: Budi Santoso"
                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500"
                        value={finalUserName}
                        onChange={(e) => setFinalUserName(e.target.value)}
                    />
                </div>
            </div>
            
            <div className="mt-6 flex flex-col md:flex-row justify-end space-y-4 md:space-y-0 md:space-x-4">
                {/* Tombol Keluar */}
                <button 
                    onClick={reset}
                    className="bg-slate-200 text-slate-600 px-6 py-4 rounded-xl font-bold text-sm hover:bg-slate-300 transition-all flex items-center justify-center order-2 md:order-1"
                >
                    Keluar / Kembali ke Beranda
                </button>

                {/* Tombol Simpan PDF */}
                <button 
                    onClick={generateAndSendPDF}
                    disabled={isLoading}
                    className="bg-green-600 text-white px-8 py-4 rounded-xl font-bold text-sm hover:bg-green-700 transition-all shadow-lg flex items-center w-full md:w-auto justify-center order-1 md:order-2"
                >
                {isLoading ? 'Sedang Membuat PDF...' : 'Simpan Laporan PDF & Selesai'}
                {!isLoading && (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                )}
                </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100 overflow-hidden group">
                <img src={imagePreview!} alt="Source" className="w-full rounded-2xl grayscale hover:grayscale-0 transition-all duration-500" />
                <div className="mt-4 text-center">
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Digital Handwriting Scan</span>
                </div>
              </div>
              <div className="bg-indigo-600 text-white p-8 rounded-3xl shadow-2xl">
                <h3 className="font-bold text-xl mb-6 flex items-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Intisari Karakter
                </h3>
                <p className="text-indigo-50 leading-relaxed text-sm italic">"{result.personalitySummary}"</p>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-8">
              {/* Hasil Kontekstual Jika Ada */}
              {contextResult && (
                <section className="bg-emerald-50 p-8 rounded-4xl border border-emerald-100 shadow-sm animate-scaleIn">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                        <h3 className="text-2xl font-bold text-emerald-900">Analisis Situasional</h3>
                        <p className="text-xs text-emerald-600 mt-1 italic">Konteks: "{contextInput}"</p>
                    </div>
                    <div className="bg-emerald-600 text-white px-6 py-3 rounded-2xl text-center shadow-lg">
                      <span className="block text-[10px] font-bold uppercase opacity-80 tracking-widest">Match Score</span>
                      <span className="text-3xl font-black">{contextResult.suitabilityScore}%</span>
                    </div>
                  </div>
                  <div className="space-y-8">
                    <div className="bg-white/60 p-6 rounded-2xl">
                       <h4 className="text-xs font-black text-emerald-600 uppercase mb-3">Relevansi</h4>
                       <p className="text-slate-800 leading-relaxed italic border-l-4 border-emerald-300 pl-4">{contextResult.relevanceExplanation}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white p-6 rounded-2xl shadow-sm">
                        <h4 className="text-[10px] font-black text-emerald-600 uppercase mb-4 tracking-tighter">Saran Pengembangan</h4>
                        <ul className="text-sm space-y-3 text-slate-600">
                          {contextResult.actionableAdvice.map((a, i) => <li key={i} className="flex items-start"><span className="text-emerald-500 mr-2">✦</span>{a}</li>)}
                        </ul>
                      </div>
                      <div className="bg-white p-6 rounded-2xl shadow-sm">
                        <h4 className="text-[10px] font-black text-amber-600 uppercase mb-4 tracking-tighter">Potensi Hambatan</h4>
                        <ul className="text-sm space-y-3 text-slate-600">
                          {contextResult.specificRisks.map((r, i) => <li key={i} className="flex items-start"><span className="text-amber-500 mr-2">⚠</span>{r}</li>)}
                        </ul>
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* Analisis Teknis */}
              <div className="bg-white rounded-4xl shadow-sm border border-slate-100 p-8 space-y-6">
                <h3 className="font-black text-slate-800 border-b pb-6 uppercase text-xs tracking-widest flex items-center">
                  <span className="bg-indigo-600 w-2 h-2 rounded-full mr-3"></span>
                  Analisis Teknikal (Prinsip Grafologi)
                </h3>
                <div className="grid gap-4">
                  {result.traits.map((trait, i) => (
                    <div key={i} className="p-6 bg-slate-50 rounded-3xl border border-transparent hover:border-indigo-100 transition-all">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-tighter">{trait.feature}</span>
                        <div className="flex items-center">
                          <span className="text-[8px] font-bold text-slate-300 mr-2 uppercase">Confidence Level</span>
                          <span className="text-sm font-black text-slate-300">{Math.round(trait.confidence * 100)}%</span>
                        </div>
                      </div>
                      <p className="text-base text-slate-800 font-bold mb-2">"{trait.observation}"</p>
                      <p className="text-sm text-slate-500 leading-relaxed">{trait.interpretation}</p>
                    </div>
                  ))}
                </div>
                
                <div className="mt-8 p-6 bg-indigo-50/50 rounded-2xl">
                   <h4 className="text-[10px] font-black text-indigo-400 uppercase mb-2">Landasan Grafologi</h4>
                   <p className="text-xs text-indigo-700 leading-relaxed italic">{result.graphologyBasis}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};