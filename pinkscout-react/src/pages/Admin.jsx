/**
 * =============================================================================
 * ADMIN.JSX - Admin Panel Page (Dashboard + Admin Functions)
 * =============================================================================
 *
 * WHAT IS THIS PAGE?
 * Admin-only page combining dashboard data and admin functions:
 * - View all scouting data (dashboard functionality)
 * - Summary statistics (total entries, teams scouted, etc.)
 * - Recent scouting entries table with search/delete
 * - View API status
 * - Manage admin list
 *
 * ACCESS: Only users with email in ALLOWED_ADMIN_EMAILS can view this page
 *
 * =============================================================================
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../contexts/AuthContext';
import { getAdminList, addAdmin, removeAdmin, getAPIStatus, performCompleteDataWipe } from '../services/adminService';
import { getAllScoutingData, deleteScoutingData } from '../services/scoutingService';

// =============================================================================
// ALLOWED ADMIN EMAILS - Only these emails can access the admin page
// =============================================================================
const ALLOWED_ADMIN_EMAILS = [
  'rkuzmik@gmail.com',
  'rtmbe20@gmail.com',
  'admin@pinkscout.com',
  // Add more admin emails here
];

export default function Admin() {
  const { user } = useAuth();

  // ==========================================================================
  // ACCESS CONTROL - Check if user's email is in allowed list
  // ==========================================================================

  const userEmail = user?.email?.toLowerCase() || '';
  const hasAccess = ALLOWED_ADMIN_EMAILS.some(email => email.toLowerCase() === userEmail);

  // ==========================================================================
  // STATE
  // ==========================================================================

  // Dashboard state
  const [scoutingData, setScoutingData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Admin state
  const [admins, setAdmins] = useState([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [apiStatus, setApiStatus] = useState({ tba: null, statbotics: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Tab state for switching between views
  const [activeTab, setActiveTab] = useState('dashboard');

  // ==========================================================================
  // LOAD DATA ON MOUNT
  // ==========================================================================

  useEffect(() => {
    if (hasAccess) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [hasAccess]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [adminList, status, allScoutingData] = await Promise.all([
        getAdminList(),
        getAPIStatus(),
        getAllScoutingData()
      ]);

      setAdmins(adminList);
      setApiStatus(status);
      setScoutingData(allScoutingData);
    } catch (err) {
      console.error('Error loading admin data:', err);
      setError('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // DELETE HANDLER
  // ==========================================================================

  const handleDelete = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this entry?')) return;

    try {
      await deleteScoutingData(docId);
      setScoutingData(prev => prev.filter(entry => entry.id !== docId));
      setSuccess('Entry deleted successfully');
    } catch (err) {
      console.error('Error deleting entry:', err);
      setError('Failed to delete entry.');
    }
  };

  // ==========================================================================
  // COMPUTED VALUES
  // ==========================================================================

  // Filter data based on search term
  const filteredData = scoutingData.filter(entry => {
    const term = searchTerm.toLowerCase();
    return (
      String(entry.teamNumber).includes(term) ||
      String(entry.matchNumber).includes(term) ||
      (entry.scouterName || '').toLowerCase().includes(term) ||
      (entry.eventKey || '').toLowerCase().includes(term)
    );
  });

  // Calculate summary stats
  const uniqueTeams = new Set(scoutingData.map(e => e.teamNumber)).size;
  const uniqueEvents = new Set(scoutingData.map(e => e.eventKey).filter(Boolean)).size;
  const uniqueScouters = new Set(scoutingData.map(e => e.scouterName).filter(Boolean)).size;

  // ==========================================================================
  // ADMIN MANAGEMENT
  // ==========================================================================
  
  const handleAddAdmin = async (e) => {
    e.preventDefault();
    if (!newAdminEmail.trim()) return;
    
    setError('');
    setSuccess('');
    
    try {
      await addAdmin(newAdminEmail.trim());
      setAdmins(prev => [...prev, newAdminEmail.trim().toLowerCase()]);
      setNewAdminEmail('');
      setSuccess('Admin added successfully');
    } catch (err) {
      setError('Failed to add admin');
    }
  };

  const handleRemoveAdmin = async (email) => {
    if (email === user?.email) {
      setError("You can't remove yourself as admin");
      return;
    }

    if (!window.confirm(`Remove ${email} as admin?`)) return;

    try {
      await removeAdmin(email);
      setAdmins(prev => prev.filter(e => e !== email));
      setSuccess('Admin removed');
    } catch (err) {
      setError('Failed to remove admin');
    }
  };

  // ==========================================================================
  // DATA WIPE HANDLER
  // ==========================================================================
  const [isWiping, setIsWiping] = useState(false);

  const handleDataWipe = async () => {
    // Triple confirmation for destructive action
    const confirm1 = window.confirm(
      '⚠️ WARNING: This will DELETE ALL scouting data and user profiles!\n\n' +
      'Only rtmbe20@gmail.com will remain as admin.\n\n' +
      'Are you SURE you want to proceed?'
    );
    if (!confirm1) return;

    const confirm2 = window.prompt(
      'Type "DELETE ALL DATA" to confirm this destructive action:'
    );
    if (confirm2 !== 'DELETE ALL DATA') {
      setError('Data wipe cancelled - confirmation text did not match.');
      return;
    }

    setIsWiping(true);
    setError('');
    setSuccess('');

    try {
      const results = await performCompleteDataWipe();
      setSuccess(
        `✅ Data wipe complete! Deleted ${results.scoutingDeleted} scouting entries and ${results.usersDeleted} user profiles. ` +
        `${results.usersPreserved} admin profile(s) preserved.`
      );
      // Refresh the data
      await loadData();
    } catch (err) {
      console.error('Error during data wipe:', err);
      setError('Failed to wipe data: ' + err.message);
    } finally {
      setIsWiping(false);
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================

  // Show loading state
  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading admin panel...</p>
      </div>
    );
  }

  // ACCESS DENIED - User email not in allowed list
  if (!hasAccess) {
    return (
      <>
        <Helmet>
          <title>Access Denied - PinkScout</title>
        </Helmet>
        <div className="content-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔒</div>
          <h2>Access Denied</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            You don't have permission to access the admin panel.
          </p>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Logged in as: <strong>{user?.email || 'Unknown'}</strong>
          </p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: '1rem' }}>
            ← Back to Home
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Admin Panel - PinkScout</title>
        <meta name="description" content="Admin panel for PinkScout" />
      </Helmet>

      {/* Page Header */}
      <header className="page-header">
        <h1>🔐 Admin Panel</h1>
        <p>Dashboard and application management</p>
      </header>

      {/* Messages */}
      {error && <div className="alert alert-error" onClick={() => setError('')}>{error}</div>}
      {success && <div className="alert alert-success" onClick={() => setSuccess('')}>{success}</div>}

      {/* Summary Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{scoutingData.length}</div>
          <div className="stat-label">Total Entries</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{uniqueTeams}</div>
          <div className="stat-label">Teams Scouted</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{uniqueEvents}</div>
          <div className="stat-label">Events</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{uniqueScouters}</div>
          <div className="stat-label">Scouters</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="content-card" style={{ marginBottom: '1rem' }}>
        <div className="tab-nav" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className={`btn ${activeTab === 'dashboard' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('dashboard')}
          >
            📊 Scouting Data
          </button>
          <button
            className={`btn ${activeTab === 'settings' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('settings')}
          >
            ⚙️ Settings
          </button>
          <button
            className={`btn ${activeTab === 'admins' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('admins')}
          >
            👥 Admin Users
          </button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* DASHBOARD TAB - Scouting Data Table */}
      {/* ================================================================== */}
      {activeTab === 'dashboard' && (
        <div className="content-card">
          <div className="card-header">
            <h2>Recent Entries</h2>
            <div className="card-actions">
              <input
                type="text"
                placeholder="Search by team, match, scouter..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              <button onClick={loadData} className="btn btn-secondary">
                🔄 Refresh
              </button>
              <Link to="/scouting" className="btn btn-primary">
                + New Entry
              </Link>
            </div>
          </div>

          {/* Empty State */}
          {filteredData.length === 0 && (
            <div className="empty-state">
              <p>
                {searchTerm
                  ? 'No entries match your search.'
                  : 'No scouting data yet. Start by scouting a match!'}
              </p>
              {!searchTerm && (
                <Link to="/scouting" className="btn btn-primary">
                  Scout Your First Match
                </Link>
              )}
            </div>
          )}

          {/* Data Table */}
          {filteredData.length > 0 && (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>Match</th>
                    <th>Event</th>
                    <th>Scouter</th>
                    <th>Auto Pts</th>
                    <th>Teleop Pts</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.slice(0, 100).map(entry => (
                    <tr key={entry.id}>
                      <td>
                        <Link to={`/teams?team=${entry.teamNumber}`}>
                          {entry.teamNumber}
                        </Link>
                      </td>
                      <td>{entry.matchNumber || '-'}</td>
                      <td>{entry.eventKey || '-'}</td>
                      <td>{entry.scouterName || 'Unknown'}</td>
                      <td>
                        {((entry.autoSpeaker || 0) * 5) +
                         ((entry.autoAmp || 0) * 2) +
                         (entry.autoMobility ? 2 : 0)}
                      </td>
                      <td>
                        {((entry.teleopSpeaker || 0) * 2) +
                         ((entry.teleopAmp || 0) * 1) +
                         ((entry.amplifiedScored || 0) * 5)}
                      </td>
                      <td>
                        {entry.createdAt
                          ? new Date(entry.createdAt).toLocaleDateString()
                          : '-'}
                      </td>
                      <td>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="btn btn-danger btn-small"
                          title="Delete entry"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredData.length > 100 && (
                <p className="table-note">
                  Showing 100 of {filteredData.length} entries. Use search to filter.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ================================================================== */}
      {/* SETTINGS TAB - API Status & Quick Actions */}
      {/* ================================================================== */}
      {activeTab === 'settings' && (
        <>
          {/* API Status */}
          <div className="content-card">
            <h3>API Status</h3>
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
            <button onClick={loadData} className="btn btn-secondary" style={{ marginTop: '1rem' }}>
              🔄 Refresh Status
            </button>
          </div>

          {/* Quick Actions */}
          <div className="content-card">
            <h3>Quick Actions</h3>
            <div className="admin-actions">
              <button
                onClick={() => window.open('https://console.firebase.google.com', '_blank')}
                className="btn btn-secondary"
              >
                🔥 Firebase Console
              </button>
              <button
                onClick={() => window.open('https://www.thebluealliance.com', '_blank')}
                className="btn btn-secondary"
              >
                🔵 The Blue Alliance
              </button>
              <button
                onClick={() => window.open('https://statbotics.io', '_blank')}
                className="btn btn-secondary"
              >
                📊 Statbotics
              </button>
            </div>
          </div>

          {/* Allowed Admin Emails */}
          <div className="content-card">
            <h3>Allowed Admin Emails</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.875rem' }}>
              These emails are hardcoded in Admin.jsx and can access this page:
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {ALLOWED_ADMIN_EMAILS.map(email => (
                <li key={email} style={{
                  padding: '0.5rem',
                  background: 'var(--card-bg)',
                  marginBottom: '0.25rem',
                  borderRadius: '0.25rem',
                  fontFamily: 'monospace'
                }}>
                  {email}
                </li>
              ))}
            </ul>
          </div>

          {/* Danger Zone */}
          <div className="content-card" style={{
            border: '2px solid var(--danger)',
            background: 'rgba(239, 68, 68, 0.05)'
          }}>
            <h3 style={{ color: 'var(--danger)' }}>⚠️ Danger Zone</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.875rem' }}>
              Destructive actions that cannot be undone. Use with extreme caution.
            </p>
            <button
              onClick={handleDataWipe}
              disabled={isWiping}
              className="btn btn-danger"
              style={{ marginTop: '0.5rem' }}
            >
              {isWiping ? '🔄 Wiping Data...' : '🗑️ Wipe All Data'}
            </button>
            <p style={{
              color: 'var(--text-muted)',
              marginTop: '0.5rem',
              fontSize: '0.75rem'
            }}>
              This will delete ALL scouting data and user profiles. Only rtmbe20@gmail.com will remain as admin.
            </p>
          </div>
        </>
      )}

      {/* ================================================================== */}
      {/* ADMINS TAB - Admin User Management */}
      {/* ================================================================== */}
      {activeTab === 'admins' && (
        <div className="content-card">
          <h3>Admin Users (Firestore)</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.875rem' }}>
            These admins are stored in Firestore and have elevated permissions within the app.
          </p>
          <form onSubmit={handleAddAdmin} className="add-admin-form">
            <input
              type="email"
              value={newAdminEmail}
              onChange={(e) => setNewAdminEmail(e.target.value)}
              placeholder="Enter email address"
              className="search-input"
            />
            <button type="submit" className="btn btn-primary">
              + Add Admin
            </button>
          </form>

          <div className="admin-list">
            {admins.length === 0 ? (
              <p>No additional admins configured in Firestore.</p>
            ) : (
              <ul>
                {admins.map(email => (
                  <li key={email} className="admin-item">
                    <span>{email}</span>
                    <button
                      onClick={() => handleRemoveAdmin(email)}
                      className="btn btn-danger btn-small"
                      disabled={email === user?.email}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}

