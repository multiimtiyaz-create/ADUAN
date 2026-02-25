/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  FileText, 
  PlusCircle, 
  Image as ImageIcon,
  CheckCircle, 
  Wrench,
  User,
  Calendar,
  Loader2,
  Download
} from 'lucide-react';

// ==========================================
// SILA MASUKKAN URL GOOGLE APPS SCRIPT ANDA
// ==========================================
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby8hpRtUPkXIE8id59qTOcxPvgj26lexqak0AZ47OTMIzOu09vI5U_govc5Uibho-jL/exec';

const CSV_TEACHERS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQK1iQjcMX49LNY0VmT93sFGtC_tn2PgHWjr2WQSZjqIrgGteTAJqebNgwkHmfAXtEPJmnAnUm9onS6/pub?output=csv';
const CSV_REPORTS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQK1iQjcMX49LNY0VmT93sFGtC_tn2PgHWjr2WQSZjqIrgGteTAJqebNgwkHmfAXtEPJmnAnUm9onS6/pub?gid=798141725&single=true&output=csv';

interface Report {
  id: string;
  tarikh: string;
  namaGuru: string;
  tempat: string;
  jenisKerosakan: string;
  gambar: string;
}

interface FormData {
  namaGuru: string;
  tempat: string;
  jenisKerosakan: string;
  gambarBase64: string;
  gambarName: string;
  mimeType: string;
  gambarPreview: string | null;
}

// Extend Window interface for html2pdf
interface Html2Pdf {
  (): {
    set: (opt: any) => any;
    from: (element: HTMLElement | null) => any;
    save: () => Promise<void>;
  };
}

declare global {
  interface Window {
    html2pdf: Html2Pdf;
  }
}

// Fungsi untuk tukar URL Google Drive kepada URL Thumbnail (Lakaran Kecil)
const getThumbnailUrl = (url: string) => {
  if (!url) return '';
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    // Guna API thumbnail Google Drive supaya imej boleh dipapar dalam tag <img>
    return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w200-h200`;
  }
  return url;
};

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [reports, setReports] = useState<Report[]>([]);
  const [teachers, setTeachers] = useState<string[]>([]);
  const [notification, setNotification] = useState('');
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false); // State untuk muat turun PDF

  // Form State
  const [formData, setFormData] = useState<FormData>({
    namaGuru: '',
    tempat: '',
    jenisKerosakan: '',
    gambarBase64: '',
    gambarName: '',
    mimeType: '',
    gambarPreview: null
  });

  // Muat turun data Guru & Laporan Kerosakan dari Google Sheets
  useEffect(() => {
    const fetchData = async () => {
      try {
        // 1. Ambil data Guru
        const resTeachers = await fetch(CSV_TEACHERS);
        const textTeachers = await resTeachers.text();
        const rowsT = textTeachers.split('\n').map(r => r.trim()).filter(r => r);
        const teacherList = rowsT.slice(1).map(row => {
          const cols = row.split(',');
          return cols[1]?.replace(/^"|"$/g, '').trim();
        }).filter(Boolean).sort();
        setTeachers(teacherList);

        // 2. Ambil data Laporan (gid=798141725)
        const resReports = await fetch(CSV_REPORTS);
        const textReports = await resReports.text();
        const rowsR = textReports.split('\n').map(r => r.trim()).filter(r => r);
        
        // Parse Laporan: ID | TARIKH | NAMA GURU | TEMPAT | JENIS KEROSAKAN | GAMBAR
        const reportList: Report[] = rowsR.slice(1).map(row => {
          // Guna regex untuk pecahkan CSV yang mungkin ada koma dalam teks (quotes)
          const cols = row.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || row.split(',');
          const clean = (str: string) => str ? str.replace(/^"|"$/g, '').trim() : '';
          
          return {
            id: clean(cols[0]),
            tarikh: clean(cols[1]),
            namaGuru: clean(cols[2]),
            tempat: clean(cols[3]),
            jenisKerosakan: clean(cols[4]),
            gambar: clean(cols[5])
          };
        }).reverse(); // Reverse supaya yang terbaru di atas

        setReports(reportList);
      } catch (error) {
        console.error('Ralat mengambil data:', error);
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchData();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Limit file size (contoh max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert("Saiz gambar terlalu besar! Maksimum 5MB.");
        e.target.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          gambarName: file.name,
          mimeType: file.type,
          gambarBase64: reader.result as string,
          gambarPreview: URL.createObjectURL(file)
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    // Hantar data ke Google Apps Script API
    try {
      await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors', // elak isu CORS block dari browser
        headers: {
          'Content-Type': 'text/plain',
        },
        body: JSON.stringify(formData)
      });
      
      // Cipta laporan mock tempatan sementara tunggu cache Google Sheets update (ambil masa ~5 minit)
      const mockNewReport: Report = {
        id: 'Tunggu Update',
        tarikh: new Date().toLocaleString('ms-MY'),
        namaGuru: formData.namaGuru,
        tempat: formData.tempat,
        jenisKerosakan: formData.jenisKerosakan,
        gambar: formData.gambarPreview ? 'Sedang Dimuat Naik...' : 'Tiada Gambar'
      };
      setReports([mockNewReport, ...reports]);
      
      setNotification('Laporan berjaya dihantar ke Google Sheets!');
      setTimeout(() => setNotification(''), 4000);

      // Reset borang
      setFormData({
        namaGuru: '',
        tempat: '',
        jenisKerosakan: '',
        gambarBase64: '',
        gambarName: '',
        mimeType: '',
        gambarPreview: null
      });
      
      // Kosongkan input file
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
      setActiveTab('list');
    } catch (error) {
      console.error(error);
      alert('Terdapat ralat semasa menghantar aduan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fungsi Jana & Muat Turun PDF (Menggunakan html2pdf.js)
  const handleDownloadPDF = () => {
    setIsDownloading(true);
    const element = document.getElementById('printable-area');

    const opt = {
      margin:       0.5,
      filename:     'Senarai_Aduan_Kerosakan.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'landscape' }
    };

    const runPdf = () => {
      window.html2pdf().set(opt).from(element).save().then(() => setIsDownloading(false));
    };

    // Muat skrip html2pdf secara dinamik jika tiada
    if (window.html2pdf) {
      runPdf();
    } else {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      script.onload = () => {
        runPdf();
      };
      document.head.appendChild(script);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans">
      
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-slate-900 text-white flex flex-col shadow-xl z-10">
        <div className="p-6 flex items-center gap-3 border-b border-slate-700">
          <img src="https://i.postimg.cc/wB5dcNCN/logo-smk-kolombong.png" alt="Logo SMK KOLOMBONG" className="w-10 h-10 object-contain" />
          <div>
            <h1 className="text-xl font-bold leading-tight">Sistem Aduan</h1>
            <p className="text-xs text-slate-400">SMK KOLOMBONG</p>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="font-medium">Papan Pemuka</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('list')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'list' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            <FileText className="w-5 h-5" />
            <span className="font-medium">Senarai Aduan</span>
          </button>

          <button 
            onClick={() => setActiveTab('report')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'report' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            <PlusCircle className="w-5 h-5" />
            <span className="font-medium">Lapor Kerosakan</span>
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        
        {notification && (
          <div className="fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 animate-bounce">
            <CheckCircle className="w-5 h-5" />
            {notification}
          </div>
        )}

        {/* --- Papan Pemuka --- */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Ringkasan Laporan</h2>
              <p className="text-slate-500">Data ditarik secara langsung daripada Google Sheets.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                <div className="p-4 bg-blue-100 rounded-xl text-blue-600">
                  <FileText className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">Jumlah Keseluruhan Aduan</p>
                  <p className="text-4xl font-bold text-slate-800">
                    {isLoadingData ? <Loader2 className="w-8 h-8 animate-spin mt-1" /> : reports.length}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-800">Laporan Terkini</h3>
                <button onClick={() => setActiveTab('list')} className="text-blue-600 text-sm font-medium hover:underline">
                  Lihat Semua
                </button>
              </div>
              
              {isLoadingData ? (
                <div className="p-8 text-center text-slate-500 flex flex-col items-center">
                  <Loader2 className="w-8 h-8 animate-spin mb-2" />
                  Memuat turun data Google Sheets...
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {reports.slice(0, 5).map((report, idx) => (
                    <div key={idx} className="p-6 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row gap-4 justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-slate-800">{report.id}</span>
                          <span className="text-sm text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded">{report.tempat}</span>
                        </div>
                        <p className="text-slate-700 text-sm mb-2 font-medium">{report.jenisKerosakan}</p>
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><User className="w-3 h-3"/> {report.namaGuru}</span>
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {report.tarikh}</span>
                        </div>
                      </div>
                      
                      {report.gambar && report.gambar.startsWith('http') && (
                        <a href={report.gambar} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg overflow-hidden border border-slate-200 hover:opacity-80 transition-opacity shadow-sm" title="Lihat Gambar Penuh">
                          <img 
                            src={getThumbnailUrl(report.gambar)} 
                            alt="Kerosakan" 
                            className="w-16 h-16 object-cover bg-slate-100"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.onerror = null;
                              target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
                            }}
                          />
                        </a>
                      )}
                    </div>
                  ))}
                  
                  {reports.length === 0 && (
                     <div className="p-8 text-center text-slate-500">
                       Tiada laporan ditemui.
                     </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- Senarai Aduan --- */}
        {activeTab === 'list' && (
          <div className="space-y-6 animate-in fade-in">
             <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Rekod Aduan Kerosakan</h2>
                <p className="text-slate-500">Pangkalan data dari Google Sheets.</p>
              </div>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={handleDownloadPDF}
                  disabled={isDownloading || isLoadingData}
                  className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50"
                  title="Muat Turun sebagai PDF"
                >
                  {isDownloading ? <Loader2 className="w-5 h-5 text-slate-500 animate-spin" /> : <Download className="w-5 h-5 text-slate-500" />}
                  <span className="hidden sm:inline font-medium">{isDownloading ? 'Menjana PDF...' : 'Muat Turun PDF'}</span>
                </button>
                <button 
                  onClick={() => setActiveTab('report')}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-colors"
                >
                  <PlusCircle className="w-5 h-5" />
                  <span className="hidden sm:inline font-medium">Lapor Baru</span>
                </button>
              </div>
            </div>

            {/* Bahagian ini akan ditangkap oleh html2pdf */}
            <div id="printable-area" className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-bold text-slate-700">Senarai Aduan SMK KOLOMBONG</h3>
                <span className="text-xs text-slate-500">Tarikh Jana: {new Date().toLocaleDateString('ms-MY')}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 text-sm border-b border-slate-200">
                      <th className="p-4 font-semibold whitespace-nowrap">ID Laporan</th>
                      <th className="p-4 font-semibold whitespace-nowrap">Tarikh</th>
                      <th className="p-4 font-semibold whitespace-nowrap">Nama Guru</th>
                      <th className="p-4 font-semibold">Tempat</th>
                      <th className="p-4 font-semibold">Jenis Kerosakan</th>
                      <th className="p-4 font-semibold text-center">Gambar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isLoadingData ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-500">
                          <div className="flex flex-col items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin mb-2" />
                            Memuat turun...
                          </div>
                        </td>
                      </tr>
                    ) : reports.map((report, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 font-medium text-slate-800">{report.id}</td>
                        <td className="p-4 text-sm text-slate-600 whitespace-nowrap">{report.tarikh}</td>
                        <td className="p-4 text-sm font-medium text-slate-800">{report.namaGuru}</td>
                        <td className="p-4 text-sm text-slate-600">{report.tempat}</td>
                        <td className="p-4 text-sm text-slate-800 max-w-xs">{report.jenisKerosakan}</td>
                        <td className="p-4 text-center">
                          {report.gambar && report.gambar.startsWith('http') ? (
                            <div className="inline-block rounded-lg overflow-hidden border border-slate-200" title="Gambar Kerosakan">
                              <img 
                                src={getThumbnailUrl(report.gambar)} 
                                alt="Gambar Kerosakan" 
                                className="w-16 h-16 object-cover bg-slate-50"
                                crossOrigin="anonymous"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.onerror = null;
                                  target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
                                }}
                              />
                            </div>
                          ) : (
                            <span className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-lg border border-slate-200 text-xs text-slate-400">Tiada</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* --- Borang Laporan --- */}
        {activeTab === 'report' && (
          <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Lapor Kerosakan</h2>
              <p className="text-slate-500">Laporan anda akan dihantar terus ke Google Sheets.</p>
            </div>

            <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 sm:p-8 space-y-6">
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Pilih Nama Guru</label>
                <select 
                  name="namaGuru"
                  value={formData.namaGuru}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                >
                  <option value="" disabled>-- Klik Untuk Pilih Nama Anda --</option>
                  {teachers.map((teacher, idx) => (
                    <option key={idx} value={teacher}>{teacher}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Tempat Kerosakan</label>
                <input 
                  type="text" 
                  name="tempat"
                  value={formData.tempat}
                  onChange={handleInputChange}
                  required
                  placeholder="Cth: Blok B, Tingkat 2, Tandas Lelaki"
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Jenis / Detail Kerosakan</label>
                <textarea 
                  name="jenisKerosakan"
                  value={formData.jenisKerosakan}
                  onChange={handleInputChange}
                  required
                  rows={4}
                  placeholder="Terangkan kerosakan yang berlaku..."
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                ></textarea>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Muat Naik Gambar (Pilihan)</label>
                <div className="flex items-center justify-center w-full">
                  <label htmlFor="file-upload" className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 relative overflow-hidden">
                    {formData.gambarPreview ? (
                       <img src={formData.gambarPreview} alt="Preview" className="w-full h-full object-cover opacity-50" />
                    ) : (
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <ImageIcon className="w-8 h-8 mb-3 text-slate-400" />
                        <p className="mb-2 text-sm text-slate-500"><span className="font-semibold">Klik untuk muat naik</span></p>
                        <p className="text-xs text-slate-500">JPG, PNG (Maks 5MB)</p>
                      </div>
                    )}
                    <input 
                      id="file-upload" 
                      type="file" 
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden" 
                    />
                  </label>
                </div>
                {formData.gambarName && (
                  <p className="text-sm text-green-600 font-medium text-center mt-2">✓ Gambar Dipilih: {formData.gambarName}</p>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setActiveTab('dashboard')}
                  className="px-6 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className={`px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg shadow-sm flex items-center gap-2 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-blue-700'}`}
                >
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlusCircle className="w-5 h-5" />}
                  {isSubmitting ? 'Menghantar...' : 'Hantar Aduan'}
                </button>
              </div>
            </form>
          </div>
        )}

      </main>
    </div>
  );
}
