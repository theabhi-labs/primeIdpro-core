import React, { useState } from 'react';
import { Lock, Mail, Server, Loader2, Sparkles } from 'lucide-react';
import api, { getApiBaseUrl } from '../../services/api';

const FirstTimeSetup = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError(null);

    try {
      // 1. Login to web API via local backend
      const res = await api.post('/auth/login', { email, password });
      
      if (res.data?.success) {
        // 2. Automatically sync templates
        setSyncing(true);
        try {
          await api.post('/cards/templates/sync');
        } catch (syncErr) {
          console.error("Template sync failed:", syncErr);
        }

        onLoginSuccess();
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid credentials or network error.");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a] overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-900/20 via-[#0f172a] to-blue-900/20" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="relative w-full max-w-md p-8 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-2xl backdrop-blur-xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-cyan-500/30">
            <Sparkles size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-white mb-2">First Time Setup</h1>
          <p className="text-sm text-slate-400">
            Connect your local Prime ID Pro app to your Web Account to fetch templates and go completely offline.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 ml-1">Account Email</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@school.com"
                required
                className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all placeholder:text-slate-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5 ml-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full pl-11 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all placeholder:text-slate-600"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || syncing}
            className="w-full mt-2 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-extrabold rounded-xl shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>Connecting to Server...</span>
              </>
            ) : syncing ? (
              <>
                <Server size={18} className="animate-pulse" />
                <span>Downloading Templates...</span>
              </>
            ) : (
              <>
                <Lock size={18} />
                <span>Secure Login & Setup</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-800 text-center">
          <p className="text-xs text-slate-500 flex items-center justify-center gap-1.5">
            <Server size={14} />
            Target API: <span className="font-mono text-slate-400">{getApiBaseUrl()}</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default FirstTimeSetup;
