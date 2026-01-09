/**
 * =============================================================================
 * ADMIN.JSX - Admin Panel Page
 * =============================================================================
 * 
 * WHAT IS THIS PAGE?
 * Admin-only page for managing the application:
 * - View API status
 * - Manage admin list
 * - View data statistics
 * - Manage scouting questions (future)
 * 
 * ACCESS: Only users with admin rights can view this page
 * 
 * =============================================================================
 */

import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../contexts/AuthContext';
import { getAdminList, addAdmin, removeAdmin, getAPIStatus } from '../services/adminService';
import { getAllScoutingData } from '../services/scoutingService';

export default function Admin() {
  const { user } = useAuth();
  
  // ==========================================================================
  // STATE
  // ==========================================================================
  
  const [admins, setAdmins] = useState([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [apiStatus, setApiStatus] = useState({ tba: null, statbotics: null });
  const [stats, setStats] = useState({ entries: 0, teams: 0, scouters: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ==========================================================================
  // LOAD DATA ON MOUNT
  // ==========================================================================
  
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [adminList, status, scoutingData] = await Promise.all([
        getAdminList(),
        getAPIStatus(),
        getAllScoutingData()
      ]);
      
      setAdmins(adminList);
      setApiStatus(status);
      setStats({
        entries: scoutingData.length,
        teams: new Set(scoutingData.map(e => e.teamNumber)).size,
        scouters: new Set(scoutingData.map(e => e.scouterName).filter(Boolean)).size
      });
    } catch (err) {
      console.error('Error loading admin data:', err);
      setError('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

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
  // RENDER
  // ==========================================================================
  
  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading admin panel...</p>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Admin - PinkScout</title>
        <meta name="description" content="Admin panel for PinkScout" />
      </Helmet>

      {/* Page Header */}
      <header className="page-header">
        <h1>⚙️ Admin Panel</h1>
        <p>Manage application settings and users</p>
      </header>

      {/* Messages */}
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Stats Overview */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.entries}</div>
          <div className="stat-label">Total Entries</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.teams}</div>
          <div className="stat-label">Teams Scouted</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.scouters}</div>
          <div className="stat-label">Active Scouters</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{admins.length}</div>
          <div className="stat-label">Admins</div>
        </div>
      </div>

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
        <button onClick={loadData} className="btn btn-secondary">
          🔄 Refresh Status
        </button>
      </div>

      {/* Admin Management */}
      <div className="content-card">
        <h3>Admin Users</h3>
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
            <p>No additional admins configured.</p>
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
    </>
  );
}

