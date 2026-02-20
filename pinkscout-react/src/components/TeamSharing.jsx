/**
 * =============================================================================
 * TEAM SHARING COMPONENT
 * =============================================================================
 *
 * Allows team leads to:
 * - Send sharing invites to other team leads
 * - View/manage outgoing invites
 * - Accept/reject incoming invites
 * - View active sharing relationships
 *
 * =============================================================================
 */

import { useState, useEffect } from 'react';
import {
  PERMISSION_LEVELS,
  sendSharingInvite,
  getOutgoingInvites,
  getIncomingInvites,
  acceptInvite,
  rejectInvite,
  revokeAccess,
  updatePermissionLevel,
  getTeamsSharingWithMe,
  getTeamsImSharingWith
} from '../services/teamSharingService';

export default function TeamSharing({ userUid, userRole }) {
  const [activeTab, setActiveTab] = useState('incoming'); // incoming, outgoing, active
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePermission, setInvitePermission] = useState('viewer');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  // Data states
  const [incomingInvites, setIncomingInvites] = useState([]);
  const [outgoingInvites, setOutgoingInvites] = useState([]);
  const [activeSharing, setActiveSharing] = useState({ sharingWithMe: [], imSharingWith: [] });

  // Only team leads can use team sharing
  const canManageSharing = userRole === 'Team Lead' || userRole === 'Master Admin';

  // Load all data
  useEffect(() => {
    if (userUid && canManageSharing) {
      loadAllData();
    }
  }, [userUid, canManageSharing]);

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [incoming, outgoing, sharingWithMe, imSharing] = await Promise.all([
        getIncomingInvites(userUid),
        getOutgoingInvites(userUid),
        getTeamsSharingWithMe(userUid),
        getTeamsImSharingWith(userUid)
      ]);
      setIncomingInvites(incoming);
      setOutgoingInvites(outgoing);
      setActiveSharing({ sharingWithMe, imSharingWith: imSharing });
    } catch (error) {
      console.error('Error loading sharing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendInvite = async (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setLoading(true);
    setMessage({ type: '', text: '' });

    const result = await sendSharingInvite(userUid, inviteEmail.trim(), invitePermission);
    
    if (result.success) {
      setMessage({ type: 'success', text: 'Invite sent successfully!' });
      setInviteEmail('');
      loadAllData();
    } else {
      setMessage({ type: 'error', text: result.error });
    }
    setLoading(false);
  };

  const handleAccept = async (inviteId) => {
    setLoading(true);
    const result = await acceptInvite(inviteId);
    if (result.success) {
      setMessage({ type: 'success', text: 'Invite accepted!' });
      loadAllData();
    } else {
      setMessage({ type: 'error', text: result.error });
    }
    setLoading(false);
  };

  const handleReject = async (inviteId) => {
    setLoading(true);
    const result = await rejectInvite(inviteId);
    if (result.success) {
      loadAllData();
    }
    setLoading(false);
  };

  const handleRevoke = async (inviteId) => {
    if (!confirm('Are you sure you want to revoke this access?')) return;
    setLoading(true);
    const result = await revokeAccess(inviteId);
    if (result.success) {
      setMessage({ type: 'success', text: 'Access revoked' });
      loadAllData();
    }
    setLoading(false);
  };

  const handleUpdatePermission = async (inviteId, newLevel) => {
    setLoading(true);
    const result = await updatePermissionLevel(inviteId, newLevel);
    if (result.success) {
      loadAllData();
    }
    setLoading(false);
  };

  // Don't render for non-team leads
  if (!canManageSharing) {
    return (
      <div className="content-card" style={{ textAlign: 'center', padding: '2rem' }}>
        <p style={{ color: 'var(--text-muted)' }}>
          🔒 Team sharing is only available for Team Leads
        </p>
      </div>
    );
  }

  const pendingIncoming = incomingInvites.filter(i => i.status === 'pending');
  const pendingOutgoing = outgoingInvites.filter(i => i.status === 'pending');

  return (
    <div className="content-card">
      <h2 style={{ marginBottom: '1.5rem' }}>🤝 Team Data Sharing</h2>
      
      {/* Message display */}
      {message.text && (
        <div style={{
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          borderRadius: '8px',
          background: message.type === 'success' ? 'rgba(76, 175, 80, 0.15)' : 'rgba(244, 67, 54, 0.15)',
          color: message.type === 'success' ? '#4CAF50' : '#F44336',
          fontSize: '0.9rem'
        }}>
          {message.text}
        </div>
      )}

      {/* Send Invite Form */}
      <form onSubmit={handleSendInvite} style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>📨 Send Invite</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="email"
            placeholder="Team lead's email..."
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            style={{
              flex: '1 1 200px',
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--input-bg)',
              color: 'var(--text-color)'
            }}
          />
          <select
            value={invitePermission}
            onChange={(e) => setInvitePermission(e.target.value)}
            style={{
              padding: '0.6rem 1rem',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--input-bg)',
              color: 'var(--text-color)'
            }}
          >
            {Object.entries(PERMISSION_LEVELS).map(([key, val]) => (
              <option key={key} value={key}>{val.icon} {val.label}</option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary" disabled={loading || !inviteEmail.trim()}>
            Send Invite
          </button>
        </div>
      </form>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveTab('incoming')}
          style={{
            padding: '0.5rem 1rem',
            background: activeTab === 'incoming' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'incoming' ? 'white' : 'var(--text-color)',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          📥 Incoming {pendingIncoming.length > 0 && <span style={{ background: '#F44336', color: 'white', padding: '2px 6px', borderRadius: '10px', marginLeft: '4px', fontSize: '0.75rem' }}>{pendingIncoming.length}</span>}
        </button>
        <button
          onClick={() => setActiveTab('outgoing')}
          style={{
            padding: '0.5rem 1rem',
            background: activeTab === 'outgoing' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'outgoing' ? 'white' : 'var(--text-color)',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          📤 Outgoing {pendingOutgoing.length > 0 && <span style={{ background: '#FF9800', color: 'white', padding: '2px 6px', borderRadius: '10px', marginLeft: '4px', fontSize: '0.75rem' }}>{pendingOutgoing.length}</span>}
        </button>
        <button
          onClick={() => setActiveTab('active')}
          style={{
            padding: '0.5rem 1rem',
            background: activeTab === 'active' ? 'var(--primary)' : 'transparent',
            color: activeTab === 'active' ? 'white' : 'var(--text-color)',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          ✅ Active ({activeSharing.sharingWithMe.length + activeSharing.imSharingWith.length})
        </button>
      </div>

      {/* Tab Content */}
      {loading ? (
        <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</p>
      ) : (
        <>
          {/* INCOMING TAB */}
          {activeTab === 'incoming' && (
            <div>
              {pendingIncoming.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No pending invites</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {pendingIncoming.map(invite => (
                    <div key={invite.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.75rem 1rem',
                      background: 'var(--card-bg-alt)',
                      borderRadius: '8px',
                      flexWrap: 'wrap',
                      gap: '0.5rem'
                    }}>
                      <div>
                        <strong>Team {invite.owner?.team_number || '?'}</strong>
                        <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{invite.owner?.display_name}</span>
                        <span style={{ marginLeft: '0.75rem', fontSize: '0.8rem', padding: '2px 8px', background: 'rgba(156, 39, 176, 0.2)', borderRadius: '4px', color: '#9C27B0' }}>
                          {PERMISSION_LEVELS[invite.permission_level]?.label || invite.permission_level}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => handleAccept(invite.id)} className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                          ✓ Accept
                        </button>
                        <button onClick={() => handleReject(invite.id)} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                          ✕ Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* OUTGOING TAB */}
          {activeTab === 'outgoing' && (
            <div>
              {outgoingInvites.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No outgoing invites</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {outgoingInvites.map(invite => (
                    <div key={invite.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.75rem 1rem',
                      background: 'var(--card-bg-alt)',
                      borderRadius: '8px',
                      flexWrap: 'wrap',
                      gap: '0.5rem'
                    }}>
                      <div>
                        <strong>Team {invite.recipient?.team_number || '?'}</strong>
                        <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{invite.recipient?.display_name}</span>
                        <span style={{
                          marginLeft: '0.75rem',
                          fontSize: '0.75rem',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: invite.status === 'pending' ? 'rgba(255, 193, 7, 0.2)' : invite.status === 'accepted' ? 'rgba(76, 175, 80, 0.2)' : 'rgba(244, 67, 54, 0.2)',
                          color: invite.status === 'pending' ? '#FF9800' : invite.status === 'accepted' ? '#4CAF50' : '#F44336'
                        }}>
                          {invite.status}
                        </span>
                      </div>
                      <button onClick={() => handleRevoke(invite.id)} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ACTIVE TAB */}
          {activeTab === 'active' && (
            <div>
              {/* Teams sharing with me */}
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>📥 Teams Sharing With Me</h4>
              {activeSharing.sharingWithMe.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>None</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                  {activeSharing.sharingWithMe.map(share => (
                    <div key={share.id} style={{ padding: '0.5rem 0.75rem', background: 'var(--card-bg-alt)', borderRadius: '6px', fontSize: '0.9rem' }}>
                      <strong>Team {share.owner?.team_number}</strong> - {share.owner?.display_name}
                      <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        ({PERMISSION_LEVELS[share.permission_level]?.label})
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Teams I'm sharing with */}
              <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>📤 I'm Sharing With</h4>
              {activeSharing.imSharingWith.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>None</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {activeSharing.imSharingWith.map(share => (
                    <div key={share.id} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.5rem 0.75rem',
                      background: 'var(--card-bg-alt)',
                      borderRadius: '6px',
                      fontSize: '0.9rem'
                    }}>
                      <div>
                        <strong>Team {share.recipient?.team_number}</strong> - {share.recipient?.display_name}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <select
                          value={share.permission_level}
                          onChange={(e) => handleUpdatePermission(share.id, e.target.value)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            fontSize: '0.8rem',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--input-bg)',
                            color: 'var(--text-color)'
                          }}
                        >
                          {Object.entries(PERMISSION_LEVELS).map(([key, val]) => (
                            <option key={key} value={key}>{val.label}</option>
                          ))}
                        </select>
                        <button onClick={() => handleRevoke(share.id)} style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#F44336',
                          cursor: 'pointer',
                          fontSize: '1rem'
                        }}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

