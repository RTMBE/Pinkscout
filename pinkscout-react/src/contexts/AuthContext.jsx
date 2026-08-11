/**
 * Authentication and membership context.
 *
 * Authorization is loaded from the membership-backed `get_my_team` RPC; UI
 * state is never trusted by the database. Browser sessions are ephemeral for
 * shared scouting tablets and local private caches are cleared on sign-out.
 */

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import { getRoleContext } from '../services/roleService';
import {
  createMyTeam,
  isInviteToken,
  redeemTeamInvite
} from '../services/teamCodeService';
import { getUserSettings, isMobileDevice } from '../services/userSettingsService';
import { clearOfflineQueue, purgeLegacyPrivateCaches } from '../services/offlineSyncService';

const AuthContext = createContext(null);
const PENDING_ENROLLMENT_KEY = 'pinkscout_pending_enrollment';

const EMPTY_ROLE_CONTEXT = Object.freeze({
  role: null,
  membershipRole: null,
  activeTeamId: null,
  teamNumber: null,
  teamVerified: false,
  scoutingId: null,
  userUid: null,
  isMasterAdmin: false,
  canViewAll: false,
  isTeamLead: false,
  teamLeadUid: null,
  teamCode: null
});

function snakeToCamelCase(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      value
    ])
  );
}

function browserSessionStorage() {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

function savePendingEnrollment(enrollment) {
  const storage = browserSessionStorage();
  if (!storage) return;
  storage.setItem(PENDING_ENROLLMENT_KEY, JSON.stringify(enrollment));
}

function takePendingEnrollment(userId) {
  const storage = browserSessionStorage();
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(PENDING_ENROLLMENT_KEY) || 'null');
    if (!parsed || parsed.userId !== userId || Date.now() - parsed.createdAt > 60 * 60 * 1000) {
      storage.removeItem(PENDING_ENROLLMENT_KEY);
      return null;
    }
    storage.removeItem(PENDING_ENROLLMENT_KEY);
    return parsed;
  } catch {
    storage.removeItem(PENDING_ENROLLMENT_KEY);
    return null;
  }
}

function applyUserSettings(settings) {
  if (typeof document === 'undefined') return;
  document.body.classList.toggle('large-button-mode', Boolean(settings?.largeButtonMode));
  document.body.classList.remove('theme-frc-red', 'theme-frc-blue', 'theme-high-contrast');
  if (settings?.theme && settings.theme !== 'default') {
    document.body.classList.add(`theme-${settings.theme.replace('_', '-')}`);
  }
}

function resetUserSettings() {
  applyUserSettings({ largeButtonMode: false, theme: 'default' });
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [roleContext, setRoleContext] = useState(EMPTY_ROLE_CONTEXT);
  const authGeneration = useRef(0);
  const mounted = useRef(true);

  const isCurrent = (candidate, generation) => (
    mounted.current
    && authGeneration.current === generation
    && candidate?.id
    && candidate.id === userRef.current?.id
  );
  const userRef = useRef(null);

  const resetAuthState = () => {
    userRef.current = null;
    setUser(null);
    setIsAdmin(false);
    setUserProfile(null);
    setRoleContext(EMPTY_ROLE_CONTEXT);
    resetUserSettings();
  };

  const purgePrivateClientState = async () => {
    await Promise.allSettled([clearOfflineQueue(), purgeLegacyPrivateCaches()]);
  };

  async function finishPendingEnrollment(currentUser, context) {
    const pending = takePendingEnrollment(currentUser.id);
    if (!pending || context?.activeTeamId) return { context, notice: null };

    try {
      if (pending.action === 'create') {
        await createMyTeam(pending.teamNumber);
        return {
          context: await getRoleContext(currentUser),
          notice: 'Your team was created. Set up MFA in your profile before creating an invite.'
        };
      }
      if (pending.action === 'redeem' && isInviteToken(pending.token)) {
        await redeemTeamInvite(pending.token);
        return { context: await getRoleContext(currentUser), notice: 'You joined your team.' };
      }
    } catch (error) {
      // Do not retry a stale/invalid invite forever or reveal why it failed.
      if (import.meta.env.DEV) console.error('Pending enrollment could not finish:', error);
    }
    return { context, notice: null };
  }

  async function loadUserData(currentUser, generation) {
    const [contextResult, profileResult, settingsResult] = await Promise.allSettled([
      getRoleContext(currentUser),
      supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle(),
      getUserSettings(currentUser.id)
    ]);

    if (!isCurrent(currentUser, generation)) return;

    let context = contextResult.status === 'fulfilled'
      ? contextResult.value
      : { ...EMPTY_ROLE_CONTEXT, userUid: currentUser.id };
    const enrollment = await finishPendingEnrollment(currentUser, context);
    if (!isCurrent(currentUser, generation)) return;
    context = enrollment.context;

    setRoleContext(context);
    setIsAdmin(Boolean(context?.isMasterAdmin));

    if (profileResult.status === 'fulfilled' && profileResult.value?.data && !profileResult.value.error) {
      setUserProfile(snakeToCamelCase(profileResult.value.data));
    } else {
      // The auth trigger may be processing; use a non-authoritative display
      // fallback but never create/update a profile from the browser.
      setUserProfile({
        id: currentUser.id,
        email: currentUser.email,
        displayName: currentUser.user_metadata?.display_name || currentUser.email?.split('@')[0] || 'Scout',
        teamNumber: context?.teamNumber || null
      });
    }

    if (settingsResult.status === 'fulfilled') {
      applyUserSettings(settingsResult.value);
    } else {
      applyUserSettings({ largeButtonMode: isMobileDevice(), theme: 'default' });
    }
  }

  async function handleAuthChange(nextUser, generation) {
    if (!mounted.current || generation !== authGeneration.current) return;
    userRef.current = nextUser;
    setUser(nextUser);
    setLoading(false);

    if (!nextUser) {
      resetAuthState();
      void purgePrivateClientState();
      return;
    }

    // Load after the state is committed, guarded against account switches.
    void loadUserData(nextUser, generation);
  }

  useEffect(() => {
    mounted.current = true;
    void purgeLegacyPrivateCaches();

    const initialize = async () => {
      const generation = ++authGeneration.current;
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        await handleAuthChange(data.session?.user || null, generation);
      } catch (error) {
        if (import.meta.env.DEV) console.error('Error getting initial session:', error);
        if (mounted.current) setLoading(false);
      }
    };
    void initialize();

    // Supabase recommends keeping this callback synchronous. Defer work so
    // database calls cannot deadlock the auth state-change callback.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      const generation = ++authGeneration.current;
      setTimeout(() => {
        void handleAuthChange(session?.user || null, generation);
      }, 0);
    });

    return () => {
      mounted.current = false;
      authGeneration.current += 1;
      subscription.unsubscribe();
    };
  }, []);

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` }
    });
    if (error) throw error;
    return data;
  }

  async function signInWithDiscord() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: `${window.location.origin}/dashboard` }
    });
    if (error) throw error;
    return data;
  }

  /**
   * Sign up without pre-validating a team invite. A raw invite is redeemed only
   * after authentication, and validation failures reveal no team information.
   */
  async function signup(email, password, username, inviteToken, teamNumber = null, createTeam = false) {
    if (!createTeam && !isInviteToken(inviteToken)) {
      throw new Error('Enter the 64-character invite token supplied by your team owner.');
    }
    const normalizedTeamNumber = teamNumber === '' || teamNumber === null
      ? null
      : Number(teamNumber);
    if (normalizedTeamNumber !== null && (!Number.isInteger(normalizedTeamNumber)
      || normalizedTeamNumber < 1 || normalizedTeamNumber > 99999)) {
      throw new Error('Enter a valid FRC team number.');
    }

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: username },
        emailRedirectTo: `${window.location.origin}/login`
      }
    });
    if (authError) throw authError;
    if (!authData.user) throw new Error('Failed to create user account.');

    const enrollment = {
      userId: authData.user.id,
      action: createTeam ? 'create' : 'redeem',
      teamNumber: normalizedTeamNumber,
      token: createTeam ? null : inviteToken.trim().toLowerCase(),
      createdAt: Date.now()
    };

    // Email confirmation commonly returns no session. Keep only a short-lived
    // sessionStorage record for the same account and finish after it signs in.
    if (!authData.session?.user || authData.session.user.id !== authData.user.id) {
      savePendingEnrollment(enrollment);
      return { user: authData.user, requiresEmailConfirmation: true, teamCode: null };
    }

    if (createTeam) {
      await createMyTeam(normalizedTeamNumber);
    } else {
      await redeemTeamInvite(enrollment.token);
    }
    await refreshRoleContext();
    return { user: authData.user, requiresEmailConfirmation: false };
  }

  async function updateUserProfile(updates) {
    if (!userRef.current) throw new Error('No user logged in.');
    const allowed = {};
    if (typeof updates.displayName === 'string') {
      allowed.display_name = updates.displayName.trim().slice(0, 100);
    }
    if (!Object.keys(allowed).length) {
      throw new Error('No editable profile fields were supplied.');
    }

    const { data, error } = await supabase
      .from('profiles')
      .update(allowed)
      .eq('id', userRef.current.id)
      .select('*')
      .single();
    if (error) throw error;
    setUserProfile(snakeToCamelCase(data));
    return true;
  }

  async function refreshRoleContext() {
    const currentUser = userRef.current;
    if (!currentUser) return EMPTY_ROLE_CONTEXT;
    const generation = authGeneration.current;
    const context = await getRoleContext(currentUser);
    if (!isCurrent(currentUser, generation)) return EMPTY_ROLE_CONTEXT;
    setRoleContext(context);
    setIsAdmin(Boolean(context?.isMasterAdmin));
    return context;
  }

  async function logout() {
    let signOutError;
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      signOutError = error;
    } finally {
      authGeneration.current += 1;
      resetAuthState();
      await purgePrivateClientState();
    }
    if (signOutError) throw signOutError;
  }

  return (
    <AuthContext.Provider value={{
      user,
      userProfile,
      isAdmin,
      loading,
      roleContext,
      login,
      signInWithGoogle,
      signInWithDiscord,
      signup,
      logout,
      updateUserProfile,
      refreshRoleContext
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
