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
import { getTeamMembers, regenerateTeamCode, getTeamLeadCode, generateTeamCode } from '../services/teamCodeService';

export default function Profile() {
  const { user, userProfile, isAdmin, roleContext, updateUserProfile, refreshRoleContext } = useAuth();

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

  // Team Admin state (for Team Leads only)
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamCode, setTeamCode] = useState('');
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [teamStats, setTeamStats] = useState({ members: 0, totalEntries: 0 });

  // Team Lead toggle state
  const [isTogglingTeamLead, setIsTogglingTeamLead] = useState(false);

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
  }, [user, roleContext]);

  const loadStats = async () => {
    if (!user || !roleContext?.userUid) return;

    try {
      // Pass roleContext to get only the entries the user has access to
      // For Profile page, we want to show the user's own stats regardless of role
      // So we filter by scouterUid after getting accessible data
      const allData = await getAllScoutingData(roleContext);
      const userEntries = allData.filter(e => e.scouterUid === user.uid);

      setStats({
        entries: userEntries.length,
        teams: new Set(userEntries.map(e => e.teamNumber)).size
      });

      // If Team Lead, also calculate team stats
      if (roleContext.isTeamLead) {
        setTeamStats({
          members: teamMembers.length,
          totalEntries: allData.length
        });
      }
    } catch (err) {
      console.error('Error loading stats:', err);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // LOAD TEAM DATA (Team Leads only)
  // ==========================================================================

  useEffect(() => {
    if (roleContext?.isTeamLead && user) {
      loadTeamData();
    }
  }, [roleContext?.isTeamLead, user]);

  const loadTeamData = async () => {
    if (!user || !roleContext?.isTeamLead) return;
    setLoadingTeam(true);

    try {
      // Get team code
      const code = await getTeamLeadCode(user.uid);
      setTeamCode(code || roleContext.teamCode || '');

      // Get team members
      const members = await getTeamMembers(user.uid);
      setTeamMembers(members);

      // Update team stats
      const allData = await getAllScoutingData(roleContext);
      setTeamStats({
        members: members.length,
        totalEntries: allData.length
      });
    } catch (err) {
      console.error('Error loading team data:', err);
    } finally {
      setLoadingTeam(false);
    }
  };

  // Handle regenerating team code
  const handleRegenerateCode = async () => {
    if (!confirm('Are you sure you want to regenerate your team code? The old code will stop working.')) {
      return;
    }

    setRegenerating(true);
    setError('');

    try {
      const newCode = await regenerateTeamCode(user.uid, user.email);
      setTeamCode(newCode);
      setSuccess('Team code regenerated successfully!');
    } catch (err) {
      console.error('Error regenerating code:', err);
      setError('Failed to regenerate team code. Please try again.');
    } finally {
      setRegenerating(false);
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
      // Update Supabase profile with display name and team number
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
  // TEAM LEAD TOGGLE
  // ==========================================================================

  const handleTeamLeadToggle = async (becomeTeamLead) => {
    // Only show confirmation when stopping being a team lead
    if (!becomeTeamLead) {
      if (!confirm('Are you sure you want to stop being a team lead? You will lose access to team management features.')) {
        return;
      }
    }

    setIsTogglingTeamLead(true);
    setError('');
    setSuccess('');

    try {
      if (becomeTeamLead) {
        // Becoming a Team Lead - generate team code
        await generateTeamCode(user.id, user.email);
        await refreshRoleContext();
        setSuccess('You are now a Team Lead! Your team code is shown above.');
        loadTeamData();
      } else {
        // Removing Team Lead status
        await updateUserProfile({ isTeamLead: false, teamLeadUid: null, teamCode: null });
        await refreshRoleContext();
        setTeamCode('');
        setTeamMembers([]);
        setSuccess('Team Lead status removed.');
      }
    } catch (err) {
      console.error('Error toggling team lead:', err);
      setError('Failed to update team lead status');
    } finally {
      setIsTogglingTeamLead(false);
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

      {/* Account Type Toggle */}
      <div className="content-card" style={{ marginBottom: '1.5rem' }}>
        <h3>🔧 Account Type</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: isTogglingTeamLead ? 'not-allowed' : 'pointer' }}>
            <input
              type="checkbox"
              checked={roleContext?.isTeamLead || false}
              onChange={(e) => handleTeamLeadToggle(e.target.checked)}
              disabled={isTogglingTeamLead}
              style={{ width: '18px', height: '18px', cursor: isTogglingTeamLead ? 'not-allowed' : 'pointer' }}
            />
            <span style={{ fontWeight: 500 }}>Team Lead Account</span>
          </label>
          {isTogglingTeamLead && <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Updating...</span>}
        </div>
        <small style={{ color: 'var(--text-secondary)', display: 'block', marginTop: '0.5rem' }}>
          {roleContext?.isTeamLead
            ? 'As a Team Lead, you can manage team members and view all team data.'
            : 'Enable to create a team and invite members to share scouting data.'}
        </small>
      </div>

      {/* Team Admin Section (Team Leads only) */}
      {roleContext?.isTeamLead && (
        <div className="content-card" style={{ borderLeft: '4px solid var(--primary)', marginBottom: '1.5rem' }}>
          <h3>👥 Team Management</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            You are a <strong>Team Lead</strong>. Share your team code with members so they can join your team.
          </p>

          {/* Team Code Display */}
          <div style={{
            background: 'var(--surface-alt)',
            padding: '1.5rem',
            borderRadius: '8px',
            textAlign: 'center',
            marginBottom: '1.5rem'
          }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              Your Team Code
            </div>
            <div style={{
              fontSize: '2rem',
              fontWeight: 'bold',
              fontFamily: 'monospace',
              letterSpacing: '0.3em',
              color: 'var(--primary)'
            }}>
              {loadingTeam ? '...' : (teamCode || 'No code found')}
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleRegenerateCode}
              disabled={regenerating || loadingTeam}
              style={{ marginTop: '1rem' }}
            >
              {regenerating ? 'Regenerating...' : '🔄 Regenerate Code'}
            </button>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              Warning: Regenerating will invalidate the old code
            </p>
          </div>

          {/* Team Stats */}
          <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
            <div className="stat-card">
              <div className="stat-value">{loadingTeam ? '...' : teamStats.members}</div>
              <div className="stat-label">Team Members</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{loadingTeam ? '...' : teamStats.totalEntries}</div>
              <div className="stat-label">Total Team Entries</div>
            </div>
          </div>

          {/* Team Members List */}
          <h4 style={{ marginBottom: '0.75rem' }}>Team Members</h4>
          {loadingTeam ? (
            <p style={{ color: 'var(--text-secondary)' }}>Loading team members...</p>
          ) : teamMembers.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>
              No members yet. Share your team code to invite scouts!
            </p>
          ) : (
            <div style={{
              background: 'var(--surface-alt)',
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
              {teamMembers.map((member, index) => (
                <div
                  key={member.uid}
                  style={{
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: index < teamMembers.length - 1 ? '1px solid var(--border)' : 'none'
                  }}
                >
                  <div>
                    <strong>{member.displayName || 'Unnamed'}</strong>
                    <span style={{
                      color: 'var(--text-secondary)',
                      fontSize: '0.85rem',
                      marginLeft: '0.5rem'
                    }}>
                      {member.email}
                    </span>
                  </div>
                  <span style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    background: 'var(--surface)',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px'
                  }}>
                    Member
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

