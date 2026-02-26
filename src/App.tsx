/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import html2pdf from 'html2pdf.js';
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
  Download,
  Shield,
  Lock,
  Clock,
  AlertCircle,
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  Trash2,
  Menu,
  X,
  ZoomIn
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area
} from 'recharts';

// ==========================================
// SILA MASUKKAN URL GOOGLE APPS SCRIPT ANDA
// ==========================================
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby6kP-MgspGDpeKGzG6OefbajvfsXW0hNSTEmfAs7Ep3-29eVKUbnhDMV1N28rJ8HBW/exec';

const CSV_TEACHERS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQK1iQjcMX49LNY0VmT93sFGtC_tn2PgHWjr2WQSZjqIrgGteTAJqebNgwkHmfAXtEPJmnAnUm9onS6/pub?output=csv';
const CSV_REPORTS = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQK1iQjcMX49LNY0VmT93sFGtC_tn2PgHWjr2WQSZjqIrgGteTAJqebNgwkHmfAXtEPJmnAnUm9onS6/pub?gid=798141725&single=true&output=csv';

interface Report {
  id: string;
  tarikh: string;
  namaGuru: string;
  tempat: string;
  jenisKerosakan: string;
  gambar: string;
  status: string;
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

// Fungsi untuk tukar URL Google Drive kepada URL Paparan Terus yang stabil
const getThumbnailUrl = (url: string) => {
  if (!url) return '';
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    // Guna endpoint lh3 yang lebih stabil untuk CORS (PDF) dan paparan mobile
    return `https://lh3.googleusercontent.com/d/${match[1]}=s400`;
  }
  return url;
};

// Fungsi untuk mendapatkan URL gambar terus (untuk zoom)
const getDirectImageUrl = (url: string) => {
  if (!url) return '';
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://lh3.googleusercontent.com/d/${match[1]}=s1000`;
  }
  return url;
};

// Fungsi untuk format tarikh kepada DD/MM/YYYY dan buang masa
const formatDate = (dateStr: string) => {
  if (!dateStr) return '';
  try {
    // Ambil bahagian tarikh sahaja (sebelum ruang kosong atau koma)
    const datePart = dateStr.split(/[ ,]/)[0];
    const parts = datePart.split('/');
    
    if (parts.length === 3) {
      let day, month, year;
      // Jika format adalah M/D/YYYY (cth: 2/25/2026)
      if (parseInt(parts[0]) <= 12 && parseInt(parts[1]) > 12) {
        month = parts[0].padStart(2, '0');
        day = parts[1].padStart(2, '0');
      } 
      // Jika format adalah D/M/YYYY (cth: 25/2/2026)
      else {
        day = parts[0].padStart(2, '0');
        month = parts[1].padStart(2, '0');
      }
      year = parts[2];
      return `${day}/${month}/${year}`;
    }
    return datePart;
  } catch (e) {
    return dateStr;
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [reports, setReports] = useState<Report[]>([]);
  const [teachers, setTeachers] = useState<string[]>([]);
  const [notification, setNotification] = useState('');
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false); // State untuk muat turun PDF
  const [isPrinting, setIsPrinting] = useState(false); // State untuk cetakan
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Admin State
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

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
          const firstComma = row.indexOf(',');
          if (firstComma === -1) return null;
          const name = row.substring(firstComma + 1).replace(/^"|"$/g, '').trim();
          return name;
        }).filter(Boolean).sort();
        setTeachers(teacherList);

        // 2. Ambil data Laporan (gid=798141725)
        const resReports = await fetch(CSV_REPORTS);
        const textReports = await resReports.text();
        const rowsR = textReports.split('\n').map(r => r.trim()).filter(r => r);
        
        // Parse Laporan: ID | TARIKH | NAMA GURU | TEMPAT | JENIS KEROSAKAN | GAMBAR | STATUS
        const reportList: Report[] = rowsR.slice(1).map(row => {
          // Guna regex yang lebih baik untuk pecahkan CSV (tidak pecah pada ruang kosong)
          const cols = row.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || row.split(',');
          const clean = (str: string) => str ? str.replace(/^"|"$/g, '').trim() : '';
          
          return {
            id: clean(cols[0]),
            tarikh: formatDate(clean(cols[1])),
            namaGuru: clean(cols[2]),
            tempat: clean(cols[3]),
            jenisKerosakan: clean(cols[4]),
            gambar: clean(cols[5]),
            status: clean(cols[6]) || 'Baru'
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
      // Limit file size (Maks 50MB)
      if (file.size > 50 * 1024 * 1024) {
        alert("Saiz gambar terlalu besar! Maksimum 50MB.");
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
        body: JSON.stringify({
          ...formData,
          action: 'addReport'
        })
      });
      
      // Cipta laporan mock tempatan sementara tunggu cache Google Sheets update (ambil masa ~5 minit)
      const mockNewReport: Report = {
        id: 'Tunggu Update',
        tarikh: new Date().toLocaleDateString('ms-MY'),
        namaGuru: formData.namaGuru,
        tempat: formData.tempat,
        jenisKerosakan: formData.jenisKerosakan,
        gambar: formData.gambarPreview ? 'Sedang Dimuat Naik...' : 'Tiada Gambar',
        status: 'Baru'
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

  // Fungsi Jana PDF / Cetak (Native & Stabil)
  const handleGeneratePDF = () => {
    const element = document.getElementById('printable-area');
    if (!element) return;

    setIsDownloading(true);
    
    const opt = {
      margin: 10,
      filename: `Laporan_Aduan_SMKK_${new Date().toLocaleDateString('ms-MY')}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' as const }
    };

    // Gunakan html2pdf untuk muat turun fail PDF
    html2pdf().set(opt).from(element).save().then(() => {
      setIsDownloading(false);
    }).catch(err => {
      console.error('PDF Error:', err);
      setIsDownloading(false);
      // Fallback ke print jika html2pdf gagal
      window.print();
    });
  };

  // Fungsi Padam Laporan (Admin Sahaja)
  const deleteReport = async (id: string) => {
    if (!window.confirm(`Adakah anda pasti ingin memadam aduan ${id}? Tindakan ini tidak boleh dibatalkan.`)) {
      return;
    }

    setIsDeleting(id);
    try {
      await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ action: 'deleteReport', id })
      });
      
      // Update local state
      setReports(prev => prev.filter(r => r.id !== id));
      alert(`Aduan ${id} berjaya dipadam.`);
    } catch (error) {
      console.error('Error deleting report:', error);
      alert('Gagal memadam aduan. Sila cuba lagi.');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Simple password check - in real app use backend auth
    if (adminPassword === 'admin123') {
      setIsAdmin(true);
      setShowLoginModal(false);
      setAdminPassword('');
      setNotification('Selamat Datang, Admin!');
      setTimeout(() => setNotification(''), 3000);
    } else {
      alert('Kata laluan salah!');
    }
  };

  const updateReportStatus = async (reportId: string, newStatus: string) => {
    if (!isAdmin) return;
    setIsUpdatingStatus(reportId);
    
    try {
      await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: JSON.stringify({
          action: 'updateStatus',
          id: reportId,
          status: newStatus
        })
      });
      
      // Update local state
      setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: newStatus } : r));
      setNotification(`Status aduan ${reportId} dikemaskini ke ${newStatus}`);
      setTimeout(() => setNotification(''), 3000);
    } catch (error) {
      console.error(error);
      alert('Gagal mengemaskini status.');
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'baru': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'dalam proses': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'selesai': return 'bg-green-100 text-green-700 border-green-200';
      case 'ditolak': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans">
      
      {/* Mobile Header */}
      <div className="md:hidden bg-slate-900 text-white p-4 flex justify-between items-center sticky top-0 z-50 shadow-md">
        <div className="flex items-center gap-3">
          <img src="https://i.postimg.cc/wB5dcNCN/logo-smk-kolombong.png" alt="Logo" className="w-8 h-8 object-contain" />
          <span className="font-bold text-lg">Sistem Aduan</span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
        >
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white flex flex-col shadow-xl transition-transform duration-300 ease-in-out
        md:relative md:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 hidden md:flex items-center gap-3 border-b border-slate-700">
          <img src="https://i.postimg.cc/wB5dcNCN/logo-smk-kolombong.png" alt="Logo SMK KOLOMBONG" className="w-10 h-10 object-contain" />
          <div>
            <h1 className="text-xl font-bold leading-tight">Sistem Aduan</h1>
            <p className="text-xs text-slate-400">SMK KOLOMBONG</p>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 mt-16 md:mt-0">
          <button 
            onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span className="font-medium">Papan Pemuka</span>
          </button>
          
          <button 
            onClick={() => { setActiveTab('list'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'list' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            <FileText className="w-5 h-5" />
            <span className="font-medium">Senarai Aduan</span>
          </button>

          <button 
            onClick={() => { setActiveTab('analysis'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'analysis' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            <BarChart3 className="w-5 h-5" />
            <span className="font-medium">Analisa Aduan</span>
          </button>

          <button 
            onClick={() => { setActiveTab('report'); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${activeTab === 'report' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            <PlusCircle className="w-5 h-5" />
            <span className="font-medium">Lapor Kerosakan</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-700">
          {isAdmin ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-green-400 text-sm font-medium px-2">
                <Shield className="w-4 h-4" />
                <span>Admin Mode</span>
              </div>
              <button 
                onClick={() => { setIsAdmin(false); setIsMobileMenuOpen(false); }}
                className="w-full text-xs text-slate-400 hover:text-white text-left px-2"
              >
                Log Keluar
              </button>
            </div>
          ) : (
            <button 
              onClick={() => { setShowLoginModal(true); setIsMobileMenuOpen(false); }}
              className="w-full flex items-center gap-3 px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm"
            >
              <Lock className="w-4 h-4" />
              <span>Login Admin</span>
            </button>
          )}
        </div>
      </aside>

      {/* Overlay for mobile sidebar */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        
        {/* Login Modal */}
        {showLoginModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-200">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Shield className="w-6 h-6 text-blue-600" />
                  Admin Login
                </h3>
                <button onClick={() => setShowLoginModal(false)} className="text-slate-400 hover:text-slate-600">
                  ✕
                </button>
              </div>
              <form onSubmit={handleAdminLogin} className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">Kata Laluan Admin</label>
                  <input 
                    type="password" 
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Masukkan kata laluan..."
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    autoFocus
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95"
                >
                  Log Masuk
                </button>
              </form>
            </div>
          </div>
        )}
        
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                <div className="p-4 bg-blue-100 rounded-xl text-blue-600">
                  <FileText className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">Jumlah Aduan</p>
                  <p className="text-4xl font-bold text-slate-800">
                    {isLoadingData ? <Loader2 className="w-8 h-8 animate-spin mt-1" /> : reports.length}
                  </p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                <div className="p-4 bg-yellow-100 rounded-xl text-yellow-600">
                  <Clock className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">Dalam Proses</p>
                  <p className="text-4xl font-bold text-slate-800">
                    {isLoadingData ? <Loader2 className="w-8 h-8 animate-spin mt-1" /> : reports.filter(r => r.status?.toLowerCase() === 'dalam proses').length}
                  </p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                <div className="p-4 bg-green-100 rounded-xl text-green-600">
                  <CheckCircle className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">Selesai</p>
                  <p className="text-4xl font-bold text-slate-800">
                    {isLoadingData ? <Loader2 className="w-8 h-8 animate-spin mt-1" /> : reports.filter(r => r.status?.toLowerCase() === 'selesai').length}
                  </p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                <div className="p-4 bg-red-100 rounded-xl text-red-600">
                  <AlertCircle className="w-8 h-8" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">Ditolak</p>
                  <p className="text-4xl font-bold text-slate-800">
                    {isLoadingData ? <Loader2 className="w-8 h-8 animate-spin mt-1" /> : reports.filter(r => r.status?.toLowerCase() === 'ditolak').length}
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
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-slate-800">{report.id}</span>
                          <span className="text-sm text-blue-600 font-medium bg-blue-50 px-2 py-0.5 rounded">{report.tempat}</span>
                          <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full border ${getStatusColor(report.status)}`}>
                            {report.status || 'Baru'}
                          </span>
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
                                referrerPolicy="no-referrer"
                                crossOrigin="anonymous"
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

        {/* --- Analisa Aduan --- */}
        {activeTab === 'analysis' && (
          <div className="space-y-8 animate-in fade-in">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Analisa Aduan</h2>
              <p className="text-slate-500">Visualisasi data aduan kerosakan SMK KOLOMBONG.</p>
            </div>

            {isLoadingData ? (
              <div className="p-20 text-center text-slate-500 flex flex-col items-center">
                <Loader2 className="w-12 h-12 animate-spin mb-4 text-blue-600" />
                <p className="text-lg font-medium">Menganalisa data...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Status Distribution */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <PieChartIcon className="w-5 h-5 text-blue-600" />
                    Agihan Status Aduan
                  </h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Baru', value: reports.filter(r => (r.status || 'Baru').toLowerCase() === 'baru').length },
                            { name: 'Dalam Proses', value: reports.filter(r => r.status?.toLowerCase() === 'dalam proses').length },
                            { name: 'Selesai', value: reports.filter(r => r.status?.toLowerCase() === 'selesai').length },
                            { name: 'Ditolak', value: reports.filter(r => r.status?.toLowerCase() === 'ditolak').length },
                          ].filter(d => d.value > 0)}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          <Cell fill="#3b82f6" /> {/* Blue */}
                          <Cell fill="#eab308" /> {/* Yellow */}
                          <Cell fill="#22c55e" /> {/* Green */}
                          <Cell fill="#ef4444" /> {/* Red */}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Top Locations */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                  <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-blue-600" />
                    Top 5 Lokasi Kerosakan
                  </h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        layout="vertical"
                        data={Object.entries(
                          reports.reduce((acc: any, r) => {
                            acc[r.tempat] = (acc[r.tempat] || 0) + 1;
                            return acc;
                          }, {})
                        )
                          .sort((a: any, b: any) => b[1] - a[1])
                          .slice(0, 5)
                          .map(([name, value]) => ({ name, value }))}
                        margin={{ left: 40, right: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={100} fontSize={12} />
                        <Tooltip cursor={{ fill: '#f8fafc' }} />
                        <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={30} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Trend Over Time */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 lg:col-span-2">
                  <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-blue-600" />
                    Trend Aduan Bulanan
                  </h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={(() => {
                          const months: any = {};
                          reports.forEach(r => {
                            try {
                              // Parse date "25/02/2026, 08:00:00"
                              const parts = r.tarikh.split(',')[0].split('/');
                              if (parts.length === 3) {
                                const monthYear = `${parts[1]}/${parts[2]}`; // MM/YYYY
                                months[monthYear] = (months[monthYear] || 0) + 1;
                              }
                            } catch (e) {}
                          });
                          return Object.entries(months)
                            .map(([name, value]) => ({ name, value }))
                            .sort((a, b) => {
                              const [mA, yA] = a.name.split('/').map(Number);
                              const [mB, yB] = b.name.split('/').map(Number);
                              return yA !== yB ? yA - yB : mA - mB;
                            });
                        })()}
                      >
                        <defs>
                          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" fontSize={12} tickMargin={10} />
                        <YAxis fontSize={12} tickMargin={10} />
                        <Tooltip />
                        <Area type="monotone" dataKey="value" stroke="#3b82f6" fillOpacity={1} fill="url(#colorValue)" strokeWidth={3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>
            )}
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
                  onClick={handleGeneratePDF}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-sm transition-all active:scale-95"
                  title="Simpan Laporan sebagai PDF"
                >
                  <Download className="w-5 h-5" />
                  <span className="hidden sm:inline font-medium">Jana PDF / Cetak</span>
                </button>
              </div>
            </div>

            {/* Bahagian ini akan ditangkap oleh html2pdf */}
            <div id="printable-area" className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-bold text-slate-700">Senarai Aduan SMK KOLOMBONG</h3>
                <span className="text-xs text-slate-500">Tarikh Jana: {new Date().toLocaleDateString('ms-MY')}</span>
              </div>
              <div className="overflow-x-auto hidden md:block">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 text-sm border-b border-slate-200">
                      <th className="p-4 font-semibold whitespace-nowrap">ID Laporan</th>
                      <th className="p-4 font-semibold whitespace-nowrap">Tarikh</th>
                      <th className="p-4 font-semibold whitespace-nowrap">Nama Guru</th>
                      <th className="p-4 font-semibold">Tempat</th>
                      <th className="p-4 font-semibold">Jenis Kerosakan</th>
                      <th className="p-4 font-semibold">Status</th>
                      <th className="p-4 font-semibold text-center">Gambar</th>
                      {isAdmin && <th className="p-4 font-semibold text-center">Tindakan</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isLoadingData ? (
                      <tr>
                        <td colSpan={isAdmin ? 8 : 7} className="p-8 text-center text-slate-500">
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
                        <td className="p-4">
                          {isAdmin ? (
                            <select 
                              value={report.status || 'Baru'}
                              disabled={isUpdatingStatus === report.id}
                              onChange={(e) => updateReportStatus(report.id, e.target.value)}
                              className={`text-xs font-bold px-2 py-1 rounded border focus:ring-2 focus:ring-blue-500/20 outline-none transition-all ${getStatusColor(report.status)}`}
                            >
                              <option value="Baru">Baru</option>
                              <option value="Dalam Proses">Dalam Proses</option>
                              <option value="Selesai">Selesai</option>
                              <option value="Ditolak">Ditolak</option>
                            </select>
                          ) : (
                            <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded border ${getStatusColor(report.status)}`}>
                              {report.status || 'Baru'}
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          {report.gambar && report.gambar.startsWith('http') ? (
                            <button 
                              onClick={() => setPreviewImage(report.gambar)}
                              className="inline-block rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-blue-500 transition-all relative group" 
                              title="Klik untuk Zoom"
                            >
                              <img 
                                src={getThumbnailUrl(report.gambar)} 
                                alt="Gambar Kerosakan" 
                                className="w-16 h-16 object-cover bg-slate-50"
                                referrerPolicy="no-referrer"
                                crossOrigin="anonymous"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.onerror = null;
                                  target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
                                }}
                              />
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <ZoomIn className="w-5 h-5 text-white" />
                              </div>
                            </button>
                          ) : (
                            <span className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-lg border border-slate-200 text-xs text-slate-400">Tiada</span>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="p-4 text-center">
                            <button 
                              onClick={() => deleteReport(report.id)}
                              disabled={isDeleting === report.id}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                              title="Padam Aduan"
                            >
                              {isDeleting === report.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List */}
              <div className="md:hidden divide-y divide-slate-100">
                {isLoadingData ? (
                  <div className="p-8 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Memuat turun...
                  </div>
                ) : reports.map((report, idx) => (
                  <div key={idx} className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded mb-1 inline-block">{report.id}</span>
                        <h4 className="font-bold text-slate-800">{report.tempat}</h4>
                      </div>
                      {isAdmin ? (
                        <div className="flex items-center gap-2">
                          <select 
                            value={report.status || 'Baru'}
                            disabled={isUpdatingStatus === report.id}
                            onChange={(e) => updateReportStatus(report.id, e.target.value)}
                            className={`text-[10px] font-bold px-2 py-1 rounded border ${getStatusColor(report.status)}`}
                          >
                            <option value="Baru">Baru</option>
                            <option value="Dalam Proses">Dalam Proses</option>
                            <option value="Selesai">Selesai</option>
                            <option value="Ditolak">Ditolak</option>
                          </select>
                          <button 
                            onClick={() => deleteReport(report.id)}
                            disabled={isDeleting === report.id}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded border border-red-100 transition-colors disabled:opacity-50"
                          >
                            {isDeleting === report.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      ) : (
                        <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded border ${getStatusColor(report.status)}`}>
                          {report.status || 'Baru'}
                        </span>
                      )}
                    </div>
                    
                    <p className="text-sm text-slate-700">{report.jenisKerosakan}</p>
                    
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1"><User className="w-3 h-3"/> {report.namaGuru}</div>
                        <div className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {report.tarikh}</div>
                      </div>
                      {report.gambar && report.gambar.startsWith('http') && (
                        <button 
                          onClick={() => setPreviewImage(report.gambar)}
                          className="shrink-0 rounded-lg overflow-hidden border border-slate-200 active:scale-95 transition-transform"
                        >
                          <img 
                            src={getThumbnailUrl(report.gambar)} 
                            alt="Kerosakan" 
                            className="w-12 h-12 object-cover"
                            referrerPolicy="no-referrer"
                            crossOrigin="anonymous"
                          />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
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
                        <p className="text-xs text-slate-500">JPG, PNG (Maks 50MB)</p>
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

        {/* Image Zoom Modal */}
        {previewImage && (
          <div 
            className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={() => setPreviewImage(null)}
          >
            <div className="relative max-w-5xl w-full max-h-[90vh] flex flex-col items-center">
              <button 
                onClick={() => setPreviewImage(null)}
                className="absolute -top-12 right-0 text-white hover:text-slate-300 flex items-center gap-2 font-medium"
              >
                <X className="w-6 h-6" />
                Tutup
              </button>
              <div className="w-full h-full overflow-hidden rounded-2xl shadow-2xl bg-white/5 p-2 border border-white/10">
                <img 
                  src={getDirectImageUrl(previewImage)} 
                  alt="Preview Besar" 
                  className="w-full h-full object-contain rounded-xl"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="mt-4 text-white text-center">
                <p className="text-sm opacity-70">Klik di mana-mana untuk tutup</p>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
