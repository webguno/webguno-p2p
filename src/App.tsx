/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Share2, KeyRound, ArrowRight, UploadCloud, FileBox, Download, WifiOff, CheckCircle2, Copy, Loader2, Users } from 'lucide-react';
import { P2PConnection, PeerConnectionStatus, FileMetadata, ProgressData } from './lib/webrtc';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [roomId, setRoomId] = useState('');
  const [joinId, setJoinId] = useState('');
  const [status, setStatus] = useState<PeerConnectionStatus>('disconnected');
  const [connectionInfo, setConnectionInfo] = useState<{ role: 'host' | 'client', id: string } | null>(null);
  const [p2p, setP2p] = useState<P2PConnection | null>(null);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [transferProgress, setTransferProgress] = useState<ProgressData | null>(null);
  const [receivedFile, setReceivedFile] = useState<{ url: string, name: string } | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSupabaseConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const initP2P = (idToJoin: string, role: 'host' | 'client') => {
    const newP2p = new P2PConnection();
    
    newP2p.onStatusChange = (newStatus) => {
      setStatus(newStatus);
      if (newStatus === 'disconnected') {
        setConnectionInfo(null);
        setTransferProgress(null);
        setIsTransferring(false);
      }
    };
    
    newP2p.onFileTransferStart = (meta) => {
      setIsTransferring(true);
      setTransferProgress({ fileName: meta.name, progress: 0 });
      setReceivedFile(null); // Reset when new transfer starts
    };
    
    newP2p.onFileTransferProgress = (progress) => {
      setTransferProgress(progress);
    };
    
    newP2p.onFileTransferComplete = (url, name) => {
      setIsTransferring(false);
      setReceivedFile({ url, name });
    };

    newP2p.onFileSendComplete = () => {
      setTimeout(() => {
        setIsTransferring(false);
        setTransferProgress(null);
        setSelectedFile(null);
      }, 1000); // Give user 1s to view 100% completion before clearing
    };

    newP2p.joinRoom(idToJoin, role === 'host');
    setP2p(newP2p);
    setConnectionInfo({ role, id: idToJoin });
  };

  const handleCreateRoom = () => {
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomId(newId);
    initP2P(newId, 'host');
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinId.trim()) return;
    initP2P(joinId.trim().toUpperCase(), 'client');
  };

  const disconnect = () => {
    p2p?.disconnect();
    setP2p(null);
    setConnectionInfo(null);
    setStatus('disconnected');
    setReceivedFile(null);
    setTransferProgress(null);
    setSelectedFile(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleSendFile = () => {
    if (selectedFile && p2p) {
      p2p.sendFile(selectedFile);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#FEF7FF] flex flex-col items-center p-8 text-[#1C1B1F] font-sans overflow-x-hidden">
      {/* Offline Overlay */}
      <AnimatePresence>
        {!isOnline && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#FEF7FF]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="w-20 h-20 bg-red-100 text-red-500 rounded-3xl flex items-center justify-center mb-6 shadow-sm border border-red-200">
              <WifiOff size={40} />
            </div>
            <h2 className="font-display font-bold text-3xl text-slate-800 mb-3">You are offline</h2>
            <p className="font-sans font-medium text-slate-600 max-w-md">
              Peer-to-peer connections require an active internet connection to establish the initial WebRTC tunnel via our signaling server.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="w-full max-w-5xl flex flex-col md:flex-row gap-4 justify-between items-center mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#6750A4] rounded-xl flex items-center justify-center text-white shadow-sm">
            <Share2 size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800">WebGuno</h1>
            <p className="text-xs font-bold uppercase tracking-wider text-[#6750A4]">Direct P2P</p>
          </div>
        </div>
        
        {status === 'connected' ? (
          <div className="flex items-center gap-2 px-4 py-2 bg-white border border-[#EADDFF] rounded-2xl shadow-sm">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-sm font-medium text-slate-600">Connected</span>
          </div>
        ) : !isSupabaseConfigured ? (
           <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-2xl shadow-sm">
            <span className="text-sm font-bold text-amber-700">Supabase Keys Missing</span>
          </div>
        ) : null}
      </header>

      {/* Main Container Card */}
      <main className="w-full max-w-5xl flex-1 bg-white border border-[#EADDFF] rounded-[32px] p-10 shadow-sm relative overflow-hidden transition-all duration-500 mb-8">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#EADDFF] via-[#6750A4] to-[#EADDFF]"></div>
        
        <AnimatePresence mode="wait">
          {!isSupabaseConfigured ? (
             <motion.div 
               key="missing-keys"
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               className="flex flex-col items-center justify-center py-12 text-center"
             >
               <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-[24px] flex items-center justify-center mb-6">
                 <KeyRound size={32} />
               </div>
               <h2 className="text-3xl font-bold text-slate-800 mb-4">Configuration Required</h2>
               <p className="text-lg text-slate-600 max-w-xl mx-auto mb-8">
                 To establish secure WebRTC connections, this app uses Supabase Realtime for signaling. Please configure your environment variables.
               </p>
               <div className="bg-slate-50 text-left p-6 rounded-[24px] border border-slate-200 w-full max-w-2xl text-sm text-slate-700">
                 <p className="font-bold mb-3 flex items-center gap-2"><ArrowRight size={16} /> Add the following keys to your environment variables (e.g. .env or Vercel dashboard):</p>
                 <ul className="list-disc pl-5 space-y-2 font-mono text-slate-600">
                   <li><strong className="text-slate-800">VITE_SUPABASE_URL</strong>: Your Supabase Project URL</li>
                   <li><strong className="text-slate-800">VITE_SUPABASE_ANON_KEY</strong>: Your Supabase Anon Key</li>
                 </ul>
               </div>
             </motion.div>
          ) : status === 'disconnected' && !connectionInfo ? (
            <motion.div 
              key="setup"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-10"
            >
              <div className="text-center max-w-lg mx-auto">
                <h2 className="text-4xl font-bold text-slate-800 mb-4">Secure, Direct, Fast.</h2>
                <p className="text-lg text-slate-600 mb-8">
                  Transfer files directly between devices using WebRTC. No data is stored on our servers. The connection is fully encrypted peer-to-peer.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Host Card */}
                <div className="bg-[#FEF7FF] p-6 rounded-[24px] border border-[#EADDFF] transition-all hover:border-[#6750A4]/30 flex flex-col h-full">
                  <div className="w-10 h-10 bg-white text-[#6750A4] border border-[#EADDFF] shadow-sm rounded-xl flex items-center justify-center mb-4">
                    <KeyRound size={20} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1">Create Room</h3>
                  <p className="text-sm text-slate-600 mb-6 flex-grow">
                    Generate a unique connection code to securely pair with another device.
                  </p>
                  <button 
                    onClick={handleCreateRoom}
                    className="w-full px-10 py-4 bg-[#6750A4] text-white font-bold rounded-2xl hover:bg-[#55408a] shadow-sm transition-colors flex justify-center items-center gap-2"
                  >
                    Generate Code
                  </button>
                </div>

                {/* Join Card */}
                <div className="bg-[#FEF7FF] p-6 rounded-[24px] border border-[#EADDFF] transition-all hover:border-[#6750A4]/30 flex flex-col h-full">
                  <div className="w-10 h-10 bg-white text-[#6750A4] border border-[#EADDFF] shadow-sm rounded-xl flex items-center justify-center mb-4">
                    <ArrowRight size={20} />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-1">Join Room</h3>
                  <p className="text-sm text-slate-600 mb-6">
                    Enter a 6-character code from your peer to establish the direct connection.
                  </p>
                  <form onSubmit={handleJoinRoom} className="flex flex-col gap-3 mt-auto">
                    <input 
                      type="text" 
                      placeholder="e.g. A1B2C3" 
                      value={joinId}
                      onChange={(e) => setJoinId(e.target.value)}
                      maxLength={6}
                      className="w-full px-4 py-4 rounded-2xl border border-[#EADDFF] bg-white text-slate-800 font-bold uppercase tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-[#6750A4]/50 transition-all font-mono"
                    />
                    <button 
                      type="submit"
                      disabled={joinId.length < 3}
                      className="w-full px-10 py-4 border border-[#EADDFF] text-[#6750A4] font-bold rounded-2xl hover:bg-[#EADDFF]/20 flex justify-center items-center gap-2 disabled:opacity-50 transition-colors"
                    >
                      Connect
                    </button>
                  </form>
                </div>
              </div>
            </motion.div>
          ) : status === 'connecting' && connectionInfo ? (
            <motion.div 
              key="waiting"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-12 text-center"
            >
              <div className="w-20 h-20 bg-[#FEF7FF] border border-[#EADDFF] rounded-[24px] flex items-center justify-center mb-8 relative">
                <Loader2 className="animate-spin text-[#6750A4]" size={32} />
              </div>
              
              <h2 className="text-4xl font-bold text-slate-800 mb-4">Waiting for connection</h2>
              
              {connectionInfo.role === 'host' ? (
                <>
                  <p className="text-lg text-slate-600 mb-8 max-w-lg mx-auto">Share this code with the receiver:</p>
                  <div className="flex items-center gap-3 px-4 py-2 bg-white border border-[#EADDFF] rounded-2xl shadow-sm mb-4">
                    <span className="font-mono text-3xl font-bold tracking-[0.25em] text-[#6750A4]">{connectionInfo.id}</span>
                    <button 
                      onClick={() => copyToClipboard(connectionInfo.id)}
                      className="p-3 bg-[#FEF7FF] hover:bg-[#EADDFF]/50 text-[#6750A4] rounded-xl transition-colors border border-transparent hover:border-[#EADDFF]"
                      title="Copy Code"
                    >
                      <Copy size={20} />
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-lg text-slate-600 mb-8 max-w-lg mx-auto">Connecting to {connectionInfo.id}...</p>
              )}

              <button 
                onClick={disconnect}
                className="mt-6 px-10 py-4 border border-[#EADDFF] text-[#6750A4] font-bold rounded-2xl hover:bg-[#EADDFF]/20 transition-colors"
              >
                Cancel
              </button>
            </motion.div>
          ) : status === 'connected' ? (
            <motion.div 
              key="transfer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              {/* Transfer UI */}
              <div className="bg-[#FEF7FF] rounded-[24px] border border-[#EADDFF] p-6 md:p-8 flex flex-col items-center justify-center text-center outline-dashed outline-2 outline-offset-[-12px] outline-[#EADDFF] hover:outline-[#6750A4]/30 transition-all relative overflow-hidden group">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileSelect} 
                  className="hidden" 
                />
                
                {!isTransferring && !receivedFile && (
                  <>
                    <div className="w-24 h-24 bg-[#FEF7FF] border-2 border-dashed border-[#6750A4]/40 rounded-full flex items-center justify-center mb-6 mx-auto group-hover:scale-105 transition-transform">
                      <div className="w-16 h-16 bg-[#6750A4] text-white rounded-full flex items-center justify-center shadow-lg">
                        <UploadCloud size={32} />
                      </div>
                    </div>
                    <h3 className="text-4xl font-bold text-slate-800 mb-4">Select a file to send</h3>
                    <p className="text-lg text-slate-600 mb-8 max-w-lg mx-auto">
                      Select a file to generate a direct WebRTC link. No files are stored on servers; data flows browser-to-browser.
                    </p>
                    
                    {selectedFile ? (
                      <div className="flex flex-col items-center gap-4 w-full max-w-sm">
                        <div className="flex items-center gap-3 bg-white w-full p-4 rounded-2xl border border-[#EADDFF] shadow-sm text-left">
                          <FileBox className="text-[#6750A4] flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-800 truncate text-sm">{selectedFile.name}</p>
                            <p className="text-xs text-slate-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                        </div>
                        <div className="flex gap-4 w-full">
                          <button 
                            onClick={() => setSelectedFile(null)}
                            className="flex-1 px-10 py-4 border border-[#EADDFF] text-[#6750A4] font-bold rounded-2xl hover:bg-[#EADDFF]/20 transition-colors"
                          >
                            Clear
                          </button>
                          <button 
                            onClick={handleSendFile}
                            className="flex-1 px-10 py-4 bg-[#6750A4] text-white font-bold rounded-2xl hover:bg-[#55408a] shadow-sm flex items-center justify-center gap-2 transition-colors"
                          >
                            Send File
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="px-10 py-4 bg-[#6750A4] text-white font-bold rounded-2xl hover:bg-[#55408a] shadow-sm flex items-center gap-2 transition-colors inline-flex"
                      >
                        <span>Browse Files</span>
                        <UploadCloud size={20} />
                      </button>
                    )}
                  </>
                )}

                {/* Progress UI */}
                {isTransferring && transferProgress && (
                  <div className="w-full max-w-md mx-auto py-8 text-center flex flex-col items-center">
                    <Loader2 className="text-[#6750A4] animate-spin mb-4" size={40} />
                    <h3 className="text-4xl font-bold text-slate-800 mb-4">Transferring</h3>
                    <p className="text-lg text-slate-600 mb-8 max-w-lg mx-auto truncate w-full">{transferProgress.fileName}</p>
                    
                    <div className="w-full bg-[#EADDFF] rounded-full h-3 mb-2 overflow-hidden shadow-inner flex flex-start">
                      <div 
                        className="bg-[#6750A4] h-3 rounded-full transition-all duration-300 ease-out" 
                        style={{ width: `${Math.round(transferProgress.progress * 100)}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between w-full text-xs font-bold text-[#6750A4] uppercase tracking-wider">
                      <span>Progress</span>
                      <span>{Math.round(transferProgress.progress * 100)}%</span>
                    </div>
                  </div>
                )}

                {/* Received File UI */}
                {!isTransferring && receivedFile && (
                  <div className="w-full max-w-sm mx-auto flex flex-col items-center animate-in zoom-in-95 duration-300 py-4">
                    <div className="w-24 h-24 bg-green-50 border-2 border-dashed border-green-200 rounded-full flex items-center justify-center mb-6">
                      <div className="w-16 h-16 bg-green-500 text-white shadow-lg rounded-full flex items-center justify-center">
                        <CheckCircle2 size={32} />
                      </div>
                    </div>
                    <h3 className="text-4xl font-bold text-slate-800 mb-4">File Received</h3>
                    
                    <div className="flex items-center gap-3 px-4 py-4 bg-white border border-[#EADDFF] rounded-2xl shadow-sm text-left mb-8 w-full">
                      <FileBox className="text-[#6750A4] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 truncate text-sm">{receivedFile.name}</p>
                        <p className="inline-block py-1 px-2 mt-1 rounded-md bg-[#EADDFF]/50 text-[#6750A4] text-[10px] font-bold tracking-wider uppercase">Ready to save</p>
                      </div>
                    </div>

                    <a 
                      href={receivedFile.url} 
                      download={receivedFile.name}
                      onClick={() => setTimeout(() => setReceivedFile(null), 1000)} // Reset UI after clicking download
                      className="w-full flex items-center justify-center gap-2 px-10 py-4 bg-[#6750A4] text-white font-bold rounded-2xl hover:bg-[#55408a] shadow-sm transition-colors"
                    >
                      <Download size={20} />
                      Download File
                    </a>
                    
                    <button 
                      onClick={() => setReceivedFile(null)}
                      className="mt-6 px-10 py-4 border border-[#EADDFF] text-[#6750A4] font-bold rounded-2xl hover:bg-[#EADDFF]/20 transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-[#FEF7FF] p-6 rounded-[24px] border border-[#EADDFF]">
                <div className="flex items-center gap-4">
                  <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-[#6750A4] bg-[#EADDFF]/50 py-1 px-3 md:py-1.5 md:px-4 rounded-full">Room</span>
                  <span className="font-mono text-[#6750A4] font-bold tracking-widest">{connectionInfo?.id}</span>
                </div>
                <button 
                  onClick={disconnect}
                  className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-white text-[#6750A4] font-bold rounded-2xl border border-[#EADDFF] hover:border-red-200 hover:text-red-600 transition-colors shadow-sm text-sm"
                >
                  <WifiOff size={16} /> Disconnect
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>
      
      {/* Footer Branding */}
      <footer className="mt-auto pt-10 text-center opacity-60 flex flex-col items-center">
         <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1 flex items-center gap-2">
            <Users size={14} /> Peer-to-Peer
         </span>
         <p className="text-[10px] text-slate-400">Strictly encrypted local datachannel transfer</p>
      </footer>
    </div>
  );
}

