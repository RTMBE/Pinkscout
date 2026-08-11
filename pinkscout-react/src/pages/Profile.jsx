import { useCallback, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../services/supabase';
import { getAllScoutingData } from '../services/scoutingService';
import {
  createMyTeam,
  createTeamInvite,
  getTeamInvites,
  getTeamMembers,
  isInviteToken,
  redeemTeamInvite,
  revokeTeamInvite,
  revokeTeamMember
} from '../services/teamCodeService';
import { getUserSettings, isMobileDevice, saveUserSettings } from '../services/userSettingsService';
import TeamSharing from '../components/TeamSharing';

function applySettings(settings) {
  document.body.classList.toggle('large-button-mode', Boolean(settings.largeButtonMode));
  document.body.classList.remove('theme-frc-red', 'theme-frc-blue', 'theme-high-contrast');
  if (settings.theme && settings.theme !== 'default') {
    document.body.classList.add(`theme-${settings.theme.replace('_', '-')}`);
  }
}

export default function Profile() {
  const { user, userProfile, isAdmin, roleContext, updateUserProfile, refreshRoleContext } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [teamNumber, setTeamNumber] = useState('');
  const [stats, setStats] = useState({ entries: 0, teams: 0 });
  const [teamMembers, setTeamMembers] = useState([]);
  const [teamInvites, setTeamInvites] = useState([]);
  const [teamStats, setTeamStats] = useState({ members: 0, totalEntries: 0 });
  const [inviteToken, setInviteToken] = useState('');
  const [joinToken, setJoinToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [joiningTeam, setJoiningTeam] = useState(false);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [revokingInviteId, setRevokingInviteId] = useState('');
  const [removingMemberId, setRemovingMemberId] = useState('');
  const [mfaFactors, setMfaFactors] = useState([]);
  const [mfaLevel, setMfaLevel] = useState('aal1');
  const [mfaEnrollment, setMfaEnrollment] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [userSettings, setUserSettings] = useState({
    largeButtonMode: false,
    theme: 'default',
    offlineEnabled: true
  });
  const [savingSettings, setSavingSettings] = useState(false);

  const hasTeam = Boolean(roleContext?.activeTeamId);
  const canManageTeam = Boolean(roleContext?.isTeamLead && hasTeam);
  const teamVerified = roleContext?.teamVerified === true;

  useEffect(() => {
    if (!user) return;
    setDisplayName(userProfile?.displayName || user.user_metadata?.display_name || user.email?.split('@')[0] || '');
    setTeamNumber(roleContext?.teamNumber || '');
  }, [user, userProfile, roleContext?.teamNumber]);

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      if (!user?.id) return;
      try {
        const settings = await getUserSettings(user.id);
        if (!active) return;
        setUserSettings(settings);
        applySettings(settings);
      } catch {
        const fallback = { largeButtonMode: isMobileDevice(), theme: 'default', offlineEnabled: true };
        if (active) {
          setUserSettings(fallback);
          applySettings(fallback);
        }
      }
    }
    void loadSettings();
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    async function loadStats() {
      if (!user?.id) return;
      try {
        const entries = await getAllScoutingData(roleContext);
        if (!active) return;
        const ownEntries = entries.filter((entry) => entry.scouterUid === user.id);
        setStats({
          entries: ownEntries.length,
          teams: new Set(ownEntries.map((entry) => entry.teamNumber)).size
        });
        if (canManageTeam) {
          setTeamStats((current) => ({ ...current, totalEntries: entries.length }));
        }
      } catch {
        if (active) setStats({ entries: 0, teams: 0 });
      }
    }
    void loadStats();
    return () => { active = false; };
  }, [user?.id, roleContext, canManageTeam]);

  useEffect(() => {
    let active = true;
    async function loadMembers() {
      if (!canManageTeam) {
        setTeamMembers([]);
        setTeamInvites([]);
        return;
      }
      setLoadingTeam(true);
      try {
        const [members, invites] = await Promise.all([getTeamMembers(), getTeamInvites()]);
        if (active) {
          setTeamMembers(members);
          setTeamInvites(invites);
          setTeamStats((current) => ({ ...current, members: members.length }));
        }
      } catch (error) {
        if (active) setMessage({ type: 'error', text: error.message || 'Unable to load team members.' });
      } finally {
        if (active) setLoadingTeam(false);
      }
    }
    void loadMembers();
    return () => { active = false; };
  }, [canManageTeam, roleContext?.activeTeamId]);

  const loadMfaStatus = useCallback(async () => {
    if (!canManageTeam) {
      setMfaFactors([]);
      setMfaLevel('aal1');
      return;
    }
    const [factorsResult, assuranceResult] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    ]);
    if (factorsResult.error) throw factorsResult.error;
    if (assuranceResult.error) throw assuranceResult.error;
    setMfaFactors((factorsResult.data?.totp || []).filter((factor) => factor.status === 'verified'));
    setMfaLevel(assuranceResult.data?.currentLevel || 'aal1');
  }, [canManageTeam]);

  useEffect(() => {
    let active = true;
    if (!canManageTeam) return undefined;
    void loadMfaStatus().catch(() => {
      if (active) setMfaFactors([]);
    });
    return () => { active = false; };
  }, [canManageTeam, loadMfaStatus, roleContext?.activeTeamId]);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: '', text: '' }), 5000);
  };

  const handleProfileSave = async (event) => {
    event.preventDefault();
    if (!displayName.trim()) {
      showMessage('error', 'Display name is required.');
      return;
    }
    setSaving(true);
    try {
      await updateUserProfile({ displayName: displayName.trim() });
      showMessage('success', 'Profile updated.');
    } catch (error) {
      showMessage('error', error.message || 'Unable to update your profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTeam = async () => {
    const normalizedTeamNumber = teamNumber === '' ? null : Number(teamNumber);
    if (normalizedTeamNumber !== null && (!Number.isInteger(normalizedTeamNumber)
      || normalizedTeamNumber < 1 || normalizedTeamNumber > 99999)) {
      showMessage('error', 'Enter a valid FRC team number first.');
      return;
    }
    setCreatingTeam(true);
    try {
      await createMyTeam(normalizedTeamNumber);
      await refreshRoleContext();
      showMessage('success', 'Team created. An operator must verify the FRC affiliation before you can invite scouts.');
    } catch (error) {
      showMessage('error', error.message || 'Unable to create team.');
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleCreateInvite = async () => {
    setCreatingInvite(true);
    setInviteToken('');
    try {
      const invite = await createTeamInvite(72);
      setInviteToken(invite.token);
      setTeamInvites((current) => [{
        id: invite.invite_id,
        role: 'scout',
        createdAt: new Date().toISOString(),
        expiresAt: invite.expires_at,
        useCount: 0,
        maxUses: 1
      }, ...current]);
      showMessage('success', 'One-time invite created. It expires in 72 hours. Copy it now; it cannot be shown again.');
    } catch (error) {
      showMessage('error', error.message || 'Unable to create an invite.');
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteToken);
      showMessage('success', 'Invite copied. Send it privately, not in a public chat.');
    } catch {
      showMessage('error', 'Copy failed. Select the token and copy it manually.');
    }
  };

  const handleJoinTeam = async (event) => {
    event.preventDefault();
    if (!isInviteToken(joinToken)) {
      showMessage('error', 'Enter the 64-character invite token from your team owner.');
      return;
    }
    setJoiningTeam(true);
    try {
      await redeemTeamInvite(joinToken);
      await refreshRoleContext();
      setJoinToken('');
      showMessage('success', 'You joined the team.');
    } catch {
      showMessage('error', 'Invite could not be redeemed. Check the token and try again.');
    } finally {
      setJoiningTeam(false);
    }
  };

  const handleStartMfaEnrollment = async () => {
    setMfaBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'PinkScout team manager'
      });
      if (error || !data?.id || !data?.totp?.qr_code) {
        throw error || new Error('Unable to begin authenticator setup.');
      }
      setMfaEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret || ''
      });
      setMfaCode('');
      showMessage('success', 'Scan the QR code with an authenticator app, then enter its six-digit code.');
    } catch (error) {
      showMessage('error', error.message || 'Unable to begin authenticator setup.');
    } finally {
      setMfaBusy(false);
    }
  };

  const handleVerifyMfa = async (event) => {
    event.preventDefault();
    const factorId = mfaEnrollment?.factorId || mfaFactors[0]?.id;
    const code = mfaCode.trim();
    if (!factorId || !/^\d{6}$/.test(code)) {
      showMessage('error', 'Enter the current six-digit authenticator code.');
      return;
    }
    setMfaBusy(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError || !challenge?.id) throw challengeError || new Error('Unable to verify authenticator.');
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code
      });
      if (verifyError) throw verifyError;
      await supabase.auth.refreshSession();
      setMfaEnrollment(null);
      setMfaCode('');
      await loadMfaStatus();
      showMessage('success', 'Authenticator verified. Sensitive team controls are now enabled for this session.');
    } catch (error) {
      showMessage('error', error.message || 'Authenticator verification failed. Try a fresh code.');
    } finally {
      setMfaBusy(false);
    }
  };

  const handleRevokeInvite = async (inviteId) => {
    if (!window.confirm('Revoke this unused invite? It cannot be restored.')) return;
    setRevokingInviteId(inviteId);
    try {
      await revokeTeamInvite(inviteId);
      setTeamInvites((current) => current.filter((invite) => invite.id !== inviteId));
      showMessage('success', 'Invite revoked.');
    } catch (error) {
      showMessage('error', error.message || 'Invite could not be revoked.');
    } finally {
      setRevokingInviteId('');
    }
  };

  const handleRemoveMember = async (member) => {
    if (!window.confirm(`Remove ${member.displayName || 'this scout'} from the team? They will immediately lose access.`)) return;
    setRemovingMemberId(member.uid);
    try {
      await revokeTeamMember(member.uid);
      setTeamMembers((current) => current.filter((currentMember) => currentMember.uid !== member.uid));
      setTeamStats((current) => ({ ...current, members: Math.max(0, current.members - 1) }));
      showMessage('success', 'Member removed.');
    } catch (error) {
      showMessage('error', error.message || 'Member could not be removed.');
    } finally {
      setRemovingMemberId('');
    }
  };

  const handleSettingChange = async (key, value) => {
    if (!user?.id) return;
    const next = { ...userSettings, [key]: value };
    setSavingSettings(true);
    setUserSettings(next);
    applySettings(next);
    try {
      await saveUserSettings(user.id, next);
    } catch {
      showMessage('error', 'Unable to save that preference.');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <>
      <Helmet><title>Profile - PinkScout</title></Helmet>
      <header className="page-header">
        <h1>👤 Your Profile</h1>
        <p>Manage your account and secure team membership.</p>
      </header>

      {message.text && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-value">{stats.entries}</div><div className="stat-label">Entries Submitted</div></div>
        <div className="stat-card"><div className="stat-value">{stats.teams}</div><div className="stat-label">Teams Scouted</div></div>
        <div className="stat-card"><div className="stat-value">{isAdmin ? '✅' : '—'}</div><div className="stat-label">Platform Admin</div></div>
      </div>

      {hasTeam ? (
        <div className="content-card" style={{ marginBottom: '1.5rem', borderLeft: '4px solid var(--primary)' }}>
          <h3>👥 Team Membership</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            You are a <strong>{roleContext.membershipRole || 'scout'}</strong> on
            {roleContext.teamNumber ? ` FRC Team ${roleContext.teamNumber}` : ' your team'}.
            Team access is enforced by membership, not a profile setting.
          </p>

          {!teamVerified && (
            <div className="alert alert-warning" style={{ marginTop: '1rem' }}>
              Team affiliation is pending operator verification. Scouting is available to the owner, but invite creation stays disabled until the FRC team claim is reviewed.
            </div>
          )}

          {canManageTeam && (
            <>
              <div style={{ background: 'var(--surface-alt)', padding: '1rem', borderRadius: '8px', margin: '1rem 0' }}>
                <h4 style={{ marginTop: 0 }}>🔐 Manager MFA</h4>
                {mfaLevel === 'aal2' ? (
                  <p style={{ marginBottom: 0, color: 'var(--success, #15803d)' }}>Authenticator verified for this session.</p>
                ) : mfaEnrollment ? (
                  <form onSubmit={handleVerifyMfa}>
                    <p style={{ color: 'var(--text-secondary)' }}>Scan this one-time setup QR code in an authenticator app. It is not stored by PinkScout.</p>
                    <img src={mfaEnrollment.qrCode} alt="Authenticator setup QR code" style={{ width: '180px', height: '180px', background: 'white', padding: '0.5rem', borderRadius: '6px' }} />
                    {mfaEnrollment.secret && <p style={{ fontFamily: 'monospace', overflowWrap: 'anywhere' }}>Manual key: {mfaEnrollment.secret}</p>}
                    <label htmlFor="mfa-enrollment-code">Six-digit code</label>
                    <input id="mfa-enrollment-code" inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
                    <button type="submit" className="btn btn-primary" disabled={mfaBusy} style={{ marginTop: '0.5rem' }}>{mfaBusy ? 'Verifying…' : 'Verify authenticator'}</button>
                  </form>
                ) : mfaFactors.length > 0 ? (
                  <form onSubmit={handleVerifyMfa}>
                    <p style={{ color: 'var(--text-secondary)' }}>Enter a fresh code from your authenticator to unlock invite and membership controls in this session.</p>
                    <label htmlFor="mfa-session-code">Six-digit code</label>
                    <input id="mfa-session-code" inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
                    <button type="submit" className="btn btn-primary" disabled={mfaBusy} style={{ marginTop: '0.5rem' }}>{mfaBusy ? 'Verifying…' : 'Verify authenticator'}</button>
                  </form>
                ) : (
                  <>
                    <p style={{ color: 'var(--text-secondary)' }}>Team managers need an authenticator app before using invite or member-removal controls.</p>
                    <button type="button" className="btn btn-primary" onClick={handleStartMfaEnrollment} disabled={mfaBusy}>{mfaBusy ? 'Starting…' : 'Set up authenticator app'}</button>
                  </>
                )}
              </div>

              <div style={{ background: 'var(--surface-alt)', padding: '1rem', borderRadius: '8px', margin: '1rem 0' }}>
                <h4 style={{ marginTop: 0 }}>Create a one-time invite</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Invites are 256-bit, single-use, and expire in 72 hours. The token is shown once and is never stored in your profile. MFA verification is required for invite and membership changes.
                </p>
                <button type="button" className="btn btn-primary" onClick={handleCreateInvite} disabled={creatingInvite || mfaLevel !== 'aal2' || !teamVerified}>
                  {creatingInvite ? 'Creating…' : 'Create 72-hour invite'}
                </button>
                {inviteToken && (
                  <div style={{ marginTop: '1rem' }}>
                    <label htmlFor="invite-token">One-time invite token</label>
                    <textarea id="invite-token" readOnly value={inviteToken} rows={3} style={{ width: '100%', fontFamily: 'monospace', marginTop: '0.4rem' }} />
                    <button type="button" className="btn btn-secondary" onClick={handleCopyInvite} style={{ marginTop: '0.5rem' }}>Copy token</button>
                  </div>
                )}
              </div>

              <div className="stats-grid" style={{ marginBottom: '1rem' }}>
                <div className="stat-card"><div className="stat-value">{loadingTeam ? '…' : teamStats.members}</div><div className="stat-label">Team Members</div></div>
                <div className="stat-card"><div className="stat-value">{teamStats.totalEntries}</div><div className="stat-label">Team Entries</div></div>
              </div>
              <h4>Team Members</h4>
              {loadingTeam ? <p>Loading team members…</p> : (
                <div style={{ background: 'var(--surface-alt)', borderRadius: '8px', overflow: 'hidden' }}>
                  {teamMembers.map((member, index) => (
                    <div key={member.uid} style={{ padding: '0.75rem 1rem', borderBottom: index < teamMembers.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                      <strong>{member.displayName || 'Unnamed scout'}</strong>
                      <span style={{ color: 'var(--text-secondary)' }}>{member.role}</span>
                      {member.uid !== user?.id && member.role !== 'owner' && (
                        <button type="button" className="btn btn-secondary" onClick={() => handleRemoveMember(member)} disabled={removingMemberId === member.uid || mfaLevel !== 'aal2'}>
                          {removingMemberId === member.uid ? 'Removing…' : 'Remove'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <h4 style={{ marginTop: '1.25rem' }}>Active Invites</h4>
              {loadingTeam ? <p>Loading active invites…</p> : teamInvites.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }}>No active invites.</p>
              ) : (
                <div style={{ background: 'var(--surface-alt)', borderRadius: '8px', overflow: 'hidden' }}>
                  {teamInvites.map((invite, index) => (
                    <div key={invite.id} style={{ padding: '0.75rem 1rem', borderBottom: index < teamInvites.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                      <span>Scout invite · expires {new Date(invite.expiresAt).toLocaleString()}</span>
                      <button type="button" className="btn btn-secondary" onClick={() => handleRevokeInvite(invite.id)} disabled={revokingInviteId === invite.id || mfaLevel !== 'aal2'}>
                        {revokingInviteId === invite.id ? 'Revoking…' : 'Revoke'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="content-card" style={{ marginBottom: '1.5rem' }}>
          <h3>🏁 Join or Create a Team</h3>
          <p style={{ color: 'var(--text-secondary)' }}>
            Team membership is required before private scouting data can be saved. Choose one path; an account has one active team at a time.
          </p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 280px' }}>
              <h4>Create a team</h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Create a team you will own and administer.</p>
              <div className="form-group">
                <label htmlFor="new-team-number">FRC Team Number</label>
                <input
                  type="number"
                  id="new-team-number"
                  value={teamNumber}
                  onChange={(event) => setTeamNumber(event.target.value)}
                  placeholder="e.g. 1551"
                  min={1}
                  max={99999}
                />
              </div>
              <button type="button" className="btn btn-primary" onClick={handleCreateTeam} disabled={creatingTeam}>
                {creatingTeam ? 'Creating…' : 'Create my team'}
              </button>
            </div>
            <form onSubmit={handleJoinTeam} style={{ flex: '1 1 280px' }}>
              <h4>Join with an invite</h4>
              <textarea value={joinToken} onChange={(event) => setJoinToken(event.target.value)} placeholder="Paste the 64-character invite token" rows={3} style={{ width: '100%', fontFamily: 'monospace' }} />
              <button type="submit" className="btn btn-secondary" disabled={joiningTeam || !joinToken.trim()} style={{ marginTop: '0.5rem' }}>
                {joiningTeam ? 'Joining…' : 'Join team'}
              </button>
            </form>
          </div>
        </div>
      )}

      {canManageTeam && <TeamSharing />}

      <div className="content-card">
        <h3>Account Information</h3>
        <form onSubmit={handleProfileSave} className="profile-form">
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input type="email" id="email" value={user?.email || ''} disabled className="input-disabled" />
          </div>
          <div className="form-group">
            <label htmlFor="displayName">Display Name</label>
            <input type="text" id="displayName" value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={30} />
          </div>
          <div className="form-group">
            <label htmlFor="teamNumber">FRC Team Number</label>
            <input type="number" id="teamNumber" value={roleContext?.teamNumber || ''} disabled className="input-disabled" />
            <small className="form-hint">Team identity is managed by the secure team membership record.</small>
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </form>
      </div>

      <div className="content-card">
        <h3>⚙️ App Settings</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', marginBottom: '1.5rem' }}>
          <input type="checkbox" checked={userSettings.largeButtonMode} onChange={(event) => handleSettingChange('largeButtonMode', event.target.checked)} disabled={savingSettings} style={{ width: '20px', height: '20px' }} />
          <span><strong>Large Button Mode</strong><small style={{ display: 'block', color: 'var(--text-secondary)' }}>Easier tapping on phones and tablets.</small></span>
        </label>
        <div className="form-group">
          <label htmlFor="theme">Theme</label>
          <select id="theme" value={userSettings.theme} onChange={(event) => handleSettingChange('theme', event.target.value)} disabled={savingSettings}>
            <option value="default">Default (Pink)</option>
            <option value="frc_red">FRC Red Alliance</option>
            <option value="frc_blue">FRC Blue Alliance</option>
            <option value="high_contrast">High Contrast</option>
          </select>
        </div>
      </div>
    </>
  );
}
