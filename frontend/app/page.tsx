'use client';

import { useState, useEffect, useRef, useCallback, DragEvent, ChangeEvent } from 'react';
import QRCode from 'react-qr-code';

const getApiUrl = (path: string) => {
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return `http://localhost:8080${path}`;
  }
  return path;
};

interface Device {
  name: string;
  ip: string;
  lastSeen?: number;
}

const SCAN_INTERVAL = 2000;

export default function Home() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(false);

  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pin, setPin] = useState<string[]>(['', '', '', '', '', '']);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [downloadState, setDownloadState] = useState<'idle' | 'downloading' | 'error'>('idle');
  const [generatedPin, setGeneratedPin] = useState<string | null>(null);
  const [localIp, setLocalIp] = useState<string>('');
  const [myPin, setMyPin] = useState<string>('');

  useEffect(() => {
    const resolveIp = async () => {
      try {
        const win = window as unknown as { electronAPI?: { getLocalIP: () => Promise<string> } };
        if (typeof window !== 'undefined' && win.electronAPI) {
          const ip = await win.electronAPI.getLocalIP();
          setLocalIp(ip && ip !== 'localhost' ? ip : '127.0.0.1');
        } else if (typeof window !== 'undefined') {
          const host = window.location.hostname;
          setLocalIp(host || '127.0.0.1');
        }
      } catch {
        setLocalIp('127.0.0.1');
      }
    };
    resolveIp();
  }, []);

  const handleUpload = async () => {
    if (uploadedFiles.length === 0) return;
    setUploadState('uploading');
    setGeneratedPin(null);
    try {
      const formData = new FormData();
      uploadedFiles.forEach(file => formData.append('files', file));

      const res = await fetch(getApiUrl('/api/upload'), {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');

      const data = await res.json();
      setGeneratedPin(data.pin);
      setUploadState('success');
      setUploadedFiles([]);
    } catch (err) {
      console.error(err);
      setUploadState('error');
    }
  };

  const handleDownload = async () => {
    if (!pinFull) return;
    const pinStr = pin.join('');
    setDownloadState('downloading');

    try {
      const res = await fetch(getApiUrl(`/api/download/${pinStr}`));
      if (!res.ok) throw new Error('Download failed');

      let filename = 'downloaded_file';
      const contentDisposition = res.headers.get('Content-Disposition');
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match && match[1]) filename = match[1];
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setDownloadState('idle');
      setPin(['', '', '', '', '', '']);
    } catch (err) {
      console.error(err);
      setDownloadState('error');
    }
  };

  // ── Radar polling ─────────────────────────────────────────────────────────
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMyPin(Math.floor(100000 + Math.random() * 900000).toString().slice(0, 6).split('').join(' '));
    let alive = true;
    const poll = async () => {
      setScanning(true);
      try {
        const res = await fetch(getApiUrl('/api/devices'));
        if (!res.ok) throw new Error();
        const data: Device[] = await res.json();
        if (alive) { setDevices(data); setScanError(false); }
      } catch {
        if (alive) setScanError(true);
      } finally {
        if (alive) setScanning(false);
      }
    };
    poll();
    const id = setInterval(poll, SCAN_INTERVAL);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // ── Drag & Drop ───────────────────────────────────────────────────────────
  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setIsDragging(false), []);

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    setUploadedFiles(prev => [...prev, ...files]);
  }, []);

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) setUploadedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
  };

  const removeFile = (i: number) => setUploadedFiles(prev => prev.filter((_, idx) => idx !== i));

  // ── PIN input ─────────────────────────────────────────────────────────────
  const handlePinChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    setPin(prev => { const n = [...prev]; n[i] = digit; return n; });
    if (digit && i < 5) pinRefs.current[i + 1]?.focus();
  };

  const handlePinKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pin[i] && i > 0) {
      pinRefs.current[i - 1]?.focus();
      setPin(prev => { const n = [...prev]; n[i - 1] = ''; return n; });
    }
  };

  const handlePinPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    setPin([...text.split(''), ...Array(6 - text.length).fill('')]);
    pinRefs.current[Math.min(text.length, 5)]?.focus();
    e.preventDefault();
  };

  const pinFull = pin.every(d => d !== '');

  const formatBytes = (b: number) =>
    b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  return (
    <main className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-cyan-500/30">

      {/* ── Global glow orbs ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute top-1/2 -right-40 w-80 h-80 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute -bottom-20 left-1/3 w-64 h-64 rounded-full bg-cyan-400/5 blur-3xl" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-10 space-y-10">

        {/* ── Header ── */}
        <header className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10">
            <div className="absolute inset-0 rounded-full bg-cyan-500/20 animate-ping" />
            <svg className="w-6 h-6 text-cyan-400 relative" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.566 14.587-5.566 20.152 0M12 20.25h.008v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">LAN<span className="text-cyan-400">Drop</span></h1>
            <p className="text-xs text-zinc-500 tracking-widest uppercase">Local Area Network File Transfer</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${scanError ? 'bg-red-500' : 'bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.5)]'}`} />
            <span className={`text-xs font-medium ${scanError ? 'text-red-400' : 'text-emerald-400'}`}>
              {scanError ? 'API Offline' : 'API Connected'}
            </span>
          </div>
        </header>


        {/* ══════════════════════════════════════════════════════════
            SECTION 1 — RADAR + QR SIDE BY SIDE (always visible)
        ══════════════════════════════════════════════════════════ */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '24px', alignItems: 'start' }}>

          {/* Radar card */}
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                </svg>
                <span className="text-sm font-semibold text-zinc-100">Network Radar</span>
              </div>
              <div className="flex items-center gap-2">
                {scanning && (
                  <span className="text-[10px] text-cyan-400 tracking-widest uppercase animate-pulse">Scanning…</span>
                )}
                <span className="text-xs text-zinc-500">{devices.length} device{devices.length !== 1 ? 's' : ''} found</span>
              </div>
            </div>

            {/* Radar visualiser */}
            <div className="relative flex items-center justify-center py-8 overflow-hidden">
              {[80, 120, 160, 200].map((r) => (
                <div
                  key={r}
                  className="absolute rounded-full border border-cyan-500/10"
                  style={{ width: r * 2, height: r * 2 }}
                />
              ))}
              <div className="absolute w-48 h-48 rounded-full overflow-hidden">
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: 'conic-gradient(from 0deg, transparent 0%, rgba(34,211,238,0.15) 25%, transparent 26%)',
                    animation: 'spin 3s linear infinite',
                  }}
                />
              </div>
              <div className="relative z-10 w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_12px_4px_rgba(34,211,238,0.6)]" />
              {devices.map((dev, i) => {
                const angle = (i / Math.max(devices.length, 1)) * 360;
                const radius = 60 + (i % 3) * 45;
                const x = Math.cos((angle * Math.PI) / 180) * radius;
                const y = Math.sin((angle * Math.PI) / 180) * radius;
                return (
                  <div
                    key={dev.ip + i}
                    className="absolute w-2.5 h-2.5 rounded-full bg-cyan-300 shadow-[0_0_8px_3px_rgba(103,232,249,0.7)]"
                    style={{ transform: `translate(${x}px, ${y}px)`, animation: 'pulse 2s ease-in-out infinite' }}
                  />
                );
              })}
            </div>

            {/* Device cards */}
            <div className="px-6 pb-6">
              {scanError ? (
                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3 border border-red-500/20">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                  Cannot reach <code className="font-mono">localhost:8080</code>. Make sure the LAN-Drop server is running.
                </div>
              ) : devices.length === 0 ? (
                <div className="text-center py-4 text-zinc-600 text-sm">No devices detected yet — keep scanning…</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {devices.map((dev, i) => (
                    <div
                      key={dev.ip + i}
                      className="group flex items-center gap-4 rounded-xl border border-zinc-700/60 bg-zinc-800/40 hover:border-cyan-500/40 hover:bg-zinc-800/80 transition-all duration-200 px-4 py-3 cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-cyan-500/20 transition-colors">
                        <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0H3" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-100 truncate">{dev.name ?? 'Unknown Device'}</p>
                        <p className="text-xs text-zinc-500 font-mono">{dev.ip}</p>
                      </div>
                      <div className="ml-auto">
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          Active
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ── QR CODE CARD — hardcoded, always visible ── */}
          <section className="rounded-2xl border border-cyan-500/30 bg-zinc-900/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4 p-6">
            <p className="text-sm font-semibold text-zinc-100 tracking-wide">Scan to Connect</p>

            {/* QR always renders — fallback to 127.0.0.1 if IP not yet resolved */}
            <div className="bg-white p-3 rounded-xl shadow-[0_0_30px_6px_rgba(34,211,238,0.3)]">
              <QRCode
                style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                value={`http://${localIp || '127.0.0.1'}:8080`}
                size={200}
                fgColor="#000000"
                bgColor="#ffffff"
                level="M"
              />
            </div>

            <div className="text-center">
              <p className="text-xs font-mono text-cyan-400 break-all">
                http://{localIp || '127.0.0.1'}:8080
              </p>
              <p className="mt-1 text-[10px] text-zinc-500 uppercase tracking-widest">
                Open on any Wi-Fi device
              </p>
            </div>
          </section>

        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* ══════════════════════════════════════════════════════════
              SECTION 2 — DRAG & DROP UPLOAD
          ══════════════════════════════════════════════════════════ */}
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 px-6 pt-5 pb-4 border-b border-zinc-800">
              <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span className="text-sm font-semibold text-zinc-100">Send Files</span>
            </div>

            <div className="p-5 flex-1 flex flex-col gap-4">
              {/* Drop zone */}
              <div
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer
                  transition-all duration-300 py-10
                  ${isDragging
                    ? 'border-violet-400 bg-violet-500/10 shadow-[0_0_30px_0px_rgba(167,139,250,0.2)]'
                    : 'border-zinc-700 bg-zinc-800/30 hover:border-violet-500/60 hover:bg-violet-500/5 hover:shadow-[0_0_20px_0px_rgba(167,139,250,0.1)]'
                  }
                `}
              >
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFileChange} />
                <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${isDragging ? 'bg-violet-500/20 scale-110' : 'bg-zinc-700/60'}`}>
                  <svg className={`w-6 h-6 transition-colors duration-300 ${isDragging ? 'text-violet-300' : 'text-zinc-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className={`text-sm font-medium transition-colors duration-300 ${isDragging ? 'text-violet-300' : 'text-zinc-300'}`}>
                    {isDragging ? 'Release to queue files' : 'Drop files here'}
                  </p>
                  <p className="text-xs text-zinc-600 mt-0.5">or click to browse</p>
                </div>
              </div>

              {/* File list */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-2">
                  {uploadedFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg bg-zinc-800/60 border border-zinc-700/50 px-3 py-2">
                      <svg className="w-4 h-4 text-violet-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-zinc-200 truncate">{f.name}</p>
                        <p className="text-[10px] text-zinc-600">{formatBytes(f.size)}</p>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="text-zinc-600 hover:text-red-400 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  <button onClick={handleUpload} disabled={uploadState === 'uploading'} className="w-full mt-1 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 active:scale-95 text-sm font-semibold text-white transition-all duration-150 shadow-[0_0_20px_0px_rgba(124,58,237,0.4)] disabled:opacity-50 disabled:cursor-not-allowed">
                    {uploadState === 'uploading' ? 'Sending...' : `Send ${uploadedFiles.length} file${uploadedFiles.length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              )}
              {generatedPin && (
                <div className="mt-2 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-center">
                  <p className="text-xs text-emerald-400 mb-1">Files ready to download!</p>
                  <p className="text-sm text-zinc-300">Share this PIN:</p>
                  <p className="text-2xl font-mono font-bold text-emerald-400 tracking-[0.2em] mt-1">{generatedPin}</p>
                </div>
              )}
            </div>
          </section>

          {/* ══════════════════════════════════════════════════════════
              SECTION 3 — PIN RECEIVER
          ══════════════════════════════════════════════════════════ */}
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 backdrop-blur-sm overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 px-6 pt-5 pb-4 border-b border-zinc-800">
              <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <span className="text-sm font-semibold text-zinc-100">Receive Files</span>
            </div>

            <div className="p-6 flex-1 flex flex-col items-center justify-center gap-6">
              <div className="text-center space-y-1">
                <p className="text-sm font-medium text-zinc-300">Enter 6-digit PIN</p>
                <p className="text-xs text-zinc-600">Get this PIN from the sender&apos;s device</p>
              </div>

              {/* PIN boxes */}
              <div className="flex gap-3">
                {pin.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => { pinRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handlePinChange(i, e.target.value)}
                    onKeyDown={e => handlePinKey(i, e)}
                    onPaste={handlePinPaste}
                    className={`
                      w-11 h-14 text-center text-xl font-bold rounded-xl border-2 bg-zinc-800/80
                      outline-none transition-all duration-150 caret-transparent
                      ${digit
                        ? 'border-amber-400 text-amber-300 shadow-[0_0_14px_0px_rgba(251,191,36,0.35)]'
                        : 'border-zinc-700 text-white focus:border-amber-500/60 focus:shadow-[0_0_10px_0px_rgba(251,191,36,0.2)]'
                      }
                    `}
                  />
                ))}
              </div>

              {/* Confirm button */}
              <button
                onClick={handleDownload}
                disabled={!pinFull || downloadState === 'downloading'}
                className={`
                  w-full max-w-xs py-3 rounded-xl text-sm font-bold tracking-wide transition-all duration-200
                  ${pinFull && downloadState !== 'downloading'
                    ? 'bg-amber-500 hover:bg-amber-400 text-zinc-950 shadow-[0_0_24px_0px_rgba(245,158,11,0.45)] active:scale-95'
                    : 'bg-zinc-800 text-zinc-600 cursor-not-allowed border border-zinc-700'
                  }
                `}
              >
                {downloadState === 'downloading' ? 'Downloading...' : (pinFull ? '🔓 Unlock & Receive' : 'Enter PIN to Continue')}
              </button>
              {downloadState === 'error' && (
                <p className="text-xs text-red-400 mt-2 text-center">Failed to download. Invalid PIN.</p>
              )}

              {/* Your PIN display */}
              <div className="w-full max-w-xs rounded-xl border border-zinc-700/50 bg-zinc-800/30 px-4 py-3">
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1">Your receiving PIN</p>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold font-mono text-amber-400 tracking-[0.3em]">
                    {myPin || '- - - - - -'}
                  </p>
                  <span className="ml-auto">
                    <svg className="w-4 h-4 text-zinc-600 hover:text-zinc-300 cursor-pointer transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                    </svg>
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer className="text-center text-xs text-zinc-700 pb-2">
          LAN-Drop &mdash; Secure peer-to-peer local file transfer &mdash; No internet required
        </footer>
      </div>

      <style jsx global>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: translate(var(--tw-translate-x), var(--tw-translate-y)) scale(1); }
          50% { opacity: 0.6; transform: translate(var(--tw-translate-x), var(--tw-translate-y)) scale(1.4); }
        }
      `}</style>
    </main>
  );
}
