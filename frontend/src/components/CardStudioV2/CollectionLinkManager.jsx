import React, { useState, useEffect } from 'react';
import { 
  X, Link2, Calendar, Users, Settings2, Loader2, Copy, Trash2, RefreshCw, AlertCircle
} from 'lucide-react';
import { 
  listCollectionLinksV2, 
  createCollectionLinkV2, 
  revokeCollectionLinkV2, 
  regenerateCollectionLinkV2 
} from '../../services/cardStudioV2Api';

const CollectionLinkManager = ({ projectId, onClose }) => {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  
  // Create Form State
  const [maxSubmissions, setMaxSubmissions] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');

  // New token result state
  const [newLinkResult, setNewLinkResult] = useState(null);

  const fetchLinks = async () => {
    setLoading(true);
    try {
      const data = await listCollectionLinksV2(projectId);
      setLinks(data || []);
      setError('');
    } catch (err) {
      setError('Failed to load links.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinks();
  }, [projectId]);

  const handleCreate = async () => {
    setCreating(true);
    setError('');
    setNewLinkResult(null);
    try {
      const payload = {};
      if (maxSubmissions) payload.max_submissions = parseInt(maxSubmissions, 10);
      if (expiresInDays) payload.expires_in_days = parseInt(expiresInDays, 10);
      
      const res = await createCollectionLinkV2(projectId, payload);
      const url = `${window.location.origin}/collect/${res.token}`;
      setNewLinkResult({ url, message: 'Link created successfully!' });
      setMaxSubmissions('');
      setExpiresInDays('');
      await fetchLinks();
    } catch (err) {
      setError('Failed to create link.');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (linkId) => {
    if (!window.confirm('Are you sure you want to revoke this link? Anyone using it will immediately be blocked from submitting.')) return;
    try {
      await revokeCollectionLinkV2(projectId, linkId);
      await fetchLinks();
    } catch (err) {
      alert('Failed to revoke link.');
    }
  };

  const handleRegenerate = async (linkId) => {
    if (!window.confirm('This will immediately invalidate the current link and generate a new one. Proceed?')) return;
    try {
      const res = await regenerateCollectionLinkV2(projectId, linkId);
      const url = `${window.location.origin}/collect/${res.token}`;
      setNewLinkResult({ url, message: 'Link regenerated! The old link is now invalid.' });
      await fetchLinks();
    } catch (err) {
      alert('Failed to regenerate link.');
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('Copied to clipboard!');
    } catch (e) {
      alert('Failed to copy');
    }
  };

  const shareNative = async (url) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Submit Data',
          url: url
        });
      } catch (err) {}
    } else {
      copyToClipboard(url);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
              <Link2 size={18} className="text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Secure Collection Links</h2>
              <p className="text-xs text-slate-400">Manage public access to submit records securely.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Create Section */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Settings2 size={16} className="text-slate-400" />
              Generate New Link
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Max Submissions (Optional)</label>
                <input 
                  type="number" 
                  min="1"
                  value={maxSubmissions}
                  onChange={(e) => setMaxSubmissions(e.target.value)}
                  placeholder="e.g. 100"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Expires In Days (Optional)</label>
                <input 
                  type="number"
                  min="1"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  placeholder="e.g. 7"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full sm:w-auto px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
              Generate Link
            </button>
          </div>

          {/* New Link Result Notification */}
          {newLinkResult && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                <AlertCircle size={16} />
                {newLinkResult.message}
              </div>
              <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg p-2">
                <input 
                  type="text" 
                  readOnly 
                  value={newLinkResult.url} 
                  className="flex-1 bg-transparent text-sm text-slate-300 px-2 outline-none"
                />
                <button 
                  onClick={() => shareNative(newLinkResult.url)}
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
                  title="Copy/Share"
                >
                  <Copy size={16} />
                </button>
              </div>
              <p className="text-[11px] text-amber-400/80 italic">Save this URL now. For security, it will not be displayed again.</p>
            </div>
          )}

          {error && <div className="text-red-400 text-sm px-2">{error}</div>}

          {/* Links List */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Active & Past Links</h3>
            
            {loading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-cyan-500" /></div>
            ) : links.length === 0 ? (
              <div className="text-center p-8 text-slate-500 text-sm border border-dashed border-slate-700 rounded-xl">
                No collection links generated yet.
              </div>
            ) : (
              <div className="space-y-3">
                {links.map((link) => (
                  <div key={link.id} className={`p-4 rounded-xl border ${link.status === 'active' ? 'bg-slate-800/40 border-slate-700' : 'bg-slate-900/40 border-slate-800 opacity-70'}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${
                            link.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                            link.status === 'revoked' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 
                            'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {link.status}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">ID: {link.id.substring(0,8)}</span>
                        </div>
                        
                        <div className="flex items-center gap-4 text-xs text-slate-400 mt-2">
                          <div className="flex items-center gap-1.5">
                            <Users size={14} />
                            <span>{link.submission_count} / {link.max_submissions || '∞'} submissions</span>
                          </div>
                          {link.expires_at && (
                            <div className="flex items-center gap-1.5">
                              <Calendar size={14} />
                              <span>Expires: {new Date(link.expires_at).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {link.status === 'active' && (
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleRegenerate(link.id)}
                            className="p-2 hover:bg-slate-700 text-cyan-400 rounded-lg transition-colors border border-transparent hover:border-slate-600"
                            title="Regenerate Token"
                          >
                            <RefreshCw size={16} />
                          </button>
                          <button 
                            onClick={() => handleRevoke(link.id)}
                            className="p-2 hover:bg-slate-700 text-red-400 rounded-lg transition-colors border border-transparent hover:border-slate-600"
                            title="Revoke Link"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}

                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default CollectionLinkManager;
