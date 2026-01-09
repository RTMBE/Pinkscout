/**
 * =============================================================================
 * PROFILE.JSX - User Profile Page
 * =============================================================================
 * 
 * WHAT IS THIS PAGE?
 * Displays and allows editing of user profile information:
 * - Display name
 * - Email (read-only)
 * - Scouting statistics
 * - Account info
 * 
 * =============================================================================
 */

import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../contexts/AuthContext';
import { getAllScoutingData } from '../services/scoutingService';
import { updateProfile } from 'firebase/auth';

export default function Profile() {
  const { user, userProfile, isAdmin, updateUserProfile } = useAuth();

  // ==========================================================================
  // STATE
  // ==========================================================================

  const [displayName, setDisplayName] = useState(userProfile?.displayName || user?.displayName || '');
  const [teamNumber, setTeamNumber] = useState(userProfile?.teamNumber || '');
  const [stats, setStats] = useState({ entries: 0, teams: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Update form when userProfile loads
  useEffect(() => {
    if (userProfile) {
      setDisplayName(userProfile.displayName || user?.displayName || '');
      setTeamNumber(userProfile.teamNumber || '');
    }
  }, [userProfile, user]);

  // ==========================================================================
  // LOAD USER STATS
  // ==========================================================================
  
  useEffect(() => {
    loadStats();
  }, [user]);

  const loadStats = async () => {
    if (!user) return;
    
    try {
      const allData = await getAllScoutingData();
      const userEntries = allData.filter(e => e.scouterUid === user.uid);
      
      setStats({
        entries: userEntries.length,
        teams: new Set(userEntries.map(e => e.teamNumber)).size
      });
    } catch (err) {
      console.error('Error loading stats:', err);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // UPDATE PROFILE
  // ==========================================================================

  const handleSave = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Display name is required');
      return;
    }

    // Validate team number if provided
    const teamNum = teamNumber ? parseInt(teamNumber, 10) : null;
    if (teamNumber && (isNaN(teamNum) || teamNum < 1 || teamNum > 99999)) {
      setError('Please enter a valid team number (1-99999)');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // Update Firebase Auth profile
      await updateProfile(user, { displayName: displayName.trim() });

      // Update Firestore profile with team number
      const updates = {
        displayName: displayName.trim()
      };
      if (teamNum) {
        updates.teamNumber = teamNum;
      } else {
        updates.teamNumber = null; // Clear team number if empty
      }

      await updateUserProfile(updates);

      setSuccess('Profile updated successfully!');
    } catch (err) {
      console.error('Error updating profile:', err);
      setError('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  
  return (
    <>
      <Helmet>
        <title>Profile - PinkScout</title>
        <meta name="description" content="Your PinkScout profile" />
      </Helmet>

      {/* Page Header */}
      <header className="page-header">
        <h1>👤 Your Profile</h1>
        <p>Manage your account and view your scouting stats</p>
      </header>

      {/* Messages */}
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Profile Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.entries}</div>
          <div className="stat-label">Entries Submitted</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.teams}</div>
          <div className="stat-label">Teams Scouted</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{isAdmin ? '✅' : '❌'}</div>
          <div className="stat-label">Admin Status</div>
        </div>
      </div>

      {/* Profile Form */}
      <div className="content-card">
        <h3>Account Information</h3>
        <form onSubmit={handleSave} className="profile-form">
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              value={user?.email || ''}
              disabled
              className="input-disabled"
            />
            <small className="form-hint">Email cannot be changed</small>
          </div>
          
          <div className="form-group">
            <label htmlFor="displayName">Display Name</label>
            <input
              type="text"
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your scouter name"
              minLength={2}
              maxLength={30}
            />
          </div>

          <div className="form-group">
            <label htmlFor="teamNumber">Your FRC Team Number</label>
            <input
              type="number"
              id="teamNumber"
              value={teamNumber}
              onChange={(e) => setTeamNumber(e.target.value)}
              placeholder="e.g. 1551"
              min={1}
              max={99999}
            />
            <small className="form-hint">
              Set your team number to access the "My Matches" feature
            </small>
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : '💾 Save Changes'}
          </button>
        </form>
      </div>

      {/* Account Details */}
      <div className="content-card">
        <h3>Account Details</h3>
        <div className="account-details">
          <div className="detail-row">
            <span className="detail-label">User ID:</span>
            <span className="detail-value">{user?.uid}</span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Account Created:</span>
            <span className="detail-value">
              {user?.metadata?.creationTime 
                ? new Date(user.metadata.creationTime).toLocaleDateString()
                : 'Unknown'}
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-label">Last Sign In:</span>
            <span className="detail-value">
              {user?.metadata?.lastSignInTime 
                ? new Date(user.metadata.lastSignInTime).toLocaleDateString()
                : 'Unknown'}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

