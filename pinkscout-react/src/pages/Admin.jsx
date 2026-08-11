/**
 * Platform operations dashboard.
 *
 * This page intentionally does not expose raw team scouting records, exports,
 * or destructive database controls to a browser session. Those actions belong
 * in the audited Supabase operator workflow with organization MFA.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../contexts/AuthContext';
import { getAPIStatus } from '../services/adminService';

export default function Admin() {
  const { user, roleContext } = useAuth();
  const hasAccess = Boolean(roleContext?.isMasterAdmin);
  const [apiStatus, setApiStatus] = useState({ tba: null, statbotics: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setApiStatus(await getAPIStatus());
    } catch {
      setError('Unable to load provider status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasAccess) {
      void loadData();
    } else {
      setLoading(false);
    }
  }, [hasAccess, loadData]);

  if (loading) {
    return <div className="loading-container"><div className="loading-spinner" /><p>Loading operations dashboard…</p></div>;
  }

  if (!hasAccess) {
    return (
      <>
        <Helmet><title>Access Denied - PinkScout</title></Helmet>
        <div className="content-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔒</div>
          <h2>Access Denied</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>You do not have permission to access platform operations.</p>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Logged in as: <strong>{user?.email || 'Unknown'}</strong></p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: '1rem' }}>← Back to Home</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet><title>Platform Operations - PinkScout</title></Helmet>
      <header className="page-header">
        <h1>🔐 Platform Operations</h1>
        <p>Provider health and controlled operator handoff.</p>
      </header>

      {error && <div className="alert alert-error" onClick={() => setError('')}>{error}</div>}

      <div className="content-card">
        <h2>Competition data providers</h2>
        <div className="api-status-grid">
          <div className={`api-status-item ${apiStatus.tba ? 'online' : 'offline'}`}>
            <span className="api-name">The Blue Alliance</span>
            <span className="api-indicator">{apiStatus.tba ? '🟢 Online' : '🔴 Offline'}</span>
          </div>
          <div className={`api-status-item ${apiStatus.statbotics ? 'online' : 'offline'}`}>
            <span className="api-name">Statbotics</span>
            <span className="api-indicator">{apiStatus.statbotics ? '🟢 Online' : '🔴 Offline'}</span>
          </div>
        </div>
        <button type="button" onClick={() => void loadData()} className="btn btn-secondary" style={{ marginTop: '1rem' }}>
          Refresh status
        </button>
      </div>

      <div className="content-card">
        <h2>Privileged operations</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          Team membership changes, production data deletion, exports, and database maintenance are deliberately unavailable from the browser. Use the audited Supabase dashboard workflow with organization MFA and the deployment runbook.
        </p>
        <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="btn btn-secondary">Open Supabase Dashboard</a>
      </div>
    </>
  );
}
