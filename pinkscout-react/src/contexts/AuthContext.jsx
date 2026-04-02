/**
 * =============================================================================
 * AUTHCONTEXT.JSX - Supabase Authentication Context Provider
 * =============================================================================
 *
 * WHAT IS THIS FILE?
 * Provides global authentication state throughout the React app using Context API.
 *
 * FEATURES:
 * - Tracks current user state
 * - Provides login, signup, logout functions
 * - Checks admin rights
 * - Stores user profile in Supabase on signup
 *
 * USAGE:
 * 1. Wrap your app with <AuthProvider>
 * 2. Use the useAuth() hook in any component to access auth state/functions
 *
 * EXAMPLE:
 *   const { user, login, logout, isAdmin } = useAuth();
 *   if (!user) return <Navigate to="/login" />;
 *
 * =============================================================================
 */

import { createContext, useContext, useState, useEffect } from 'react';
import { supabase, PRIMARY_ADMIN_EMAIL } from '../services/supabase';
import { getRoleContext, ROLES, MASTER_ADMIN_EMAIL, isMasterAdmin } from '../services/roleService';
import {
  validateTeamCode,
  linkMemberToTeam,
  generateTeamCode
} from '../services/teamCodeService';
import { getUserSettings, isMobileDevice } from '../services/userSettingsService';

// =============================================================================
// UTILITY: Convert snake_case to camelCase
// =============================================================================

function snakeToCamelCase(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

// =============================================================================
// CREATE CONTEXT
// =============================================================================

const AuthContext = createContext(null);

// =============================================================================
// AUTH PROVIDER COMPONENT
// =============================================================================

export function AuthProvider({ children }) {
  // Current authenticated user (null if not logged in)
  const [user, setUser] = useState(null);

  // Loading state while checking auth
  const [loading, setLoading] = useState(true);

  // Is current user an admin?
  const [isAdmin, setIsAdmin] = useState(false);

  // User profile from Supabase
  const [userProfile, setUserProfile] = useState(null);

  // Role context for RBAC (role-based access control)
  const [roleContext, setRoleContext] = useState({
    role: null,
    scoutingId: null,
    userUid: null,
    isMasterAdmin: false,
    canViewAll: false,
    isTeamLead: false,
    teamLeadUid: null,
    teamCode: null
  });

  // =========================================================================
  // AUTH STATE LISTENER
  // =========================================================================
  // Listens for Supabase auth state changes and updates context

  useEffect(() => {
    let isMounted = true;

    // Get initial session first, then set up listener
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (isMounted) {
          const supabaseUser = session?.user || null;
          await handleAuthChange(supabaseUser);
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error getting initial session:', error);
        }
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for subsequent auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Skip INITIAL_SESSION since we handle it above with getSession()
        if (event === 'INITIAL_SESSION') return;

        if (isMounted) {
          const supabaseUser = session?.user || null;
          await handleAuthChange(supabaseUser);
        }
      }
    );

    // Cleanup
    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Handle auth state changes
  async function handleAuthChange(supabaseUser) {
    // Set user and loading state IMMEDIATELY - don't wait for additional data
    setUser(supabaseUser);
    setLoading(false);

    if (supabaseUser) {
      // Load additional data in the background (non-blocking)
      // These don't affect the loading state - UI can render while these load
      loadUserData(supabaseUser);
    } else {
      setIsAdmin(false);
      setUserProfile(null);
      setRoleContext({
        role: null,
        scoutingId: null,
        userUid: null,
        isMasterAdmin: false,
        canViewAll: false,
        isTeamLead: false,
        teamLeadUid: null,
        teamCode: null
      });
    }
  }

  // Load additional user data in the background (non-blocking)
  async function loadUserData(supabaseUser) {
    // Check admin rights
    try {
      const adminStatus = await checkAdminRights(supabaseUser);
      setIsAdmin(adminStatus);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error checking admin rights:', error);
      }
      setIsAdmin(false);
    }

    // Load role context for RBAC
    try {
      const context = await getRoleContext(supabaseUser);
      setRoleContext(context);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error loading role context:', error);
      }
    }

    // Load user profile from Supabase
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();

      if (profile && !error) {
        // Convert snake_case keys to camelCase for consistent access
        setUserProfile(snakeToCamelCase(profile));
      } else if (error?.code === 'PGRST116') {
        // Profile doesn't exist - create it automatically
        // This can happen if profile creation failed during signup
        if (import.meta.env.DEV) {
          console.log('Creating missing profile for user:', supabaseUser.id);
        }
        const newProfile = {
          id: supabaseUser.id,
          email: supabaseUser.email,
          display_name: supabaseUser.user_metadata?.display_name || supabaseUser.email?.split('@')[0] || '',
          role: ROLES.SCOUT,
          is_team_lead: false
        };

        const { data: createdProfile, error: createError } = await supabase
          .from('profiles')
          .insert(newProfile)
          .select()
          .single();

        if (createdProfile && !createError) {
          setUserProfile(snakeToCamelCase(createdProfile));
          if (import.meta.env.DEV) {
            console.log('✅ Auto-created profile for user:', supabaseUser.id);
          }
        } else if (import.meta.env.DEV) {
          console.error('Error auto-creating profile:', createError);
        }
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error loading user profile:', error);
      }
    }

    // Load and apply user settings (large button mode, theme)
    try {
      const settings = await getUserSettings(supabaseUser.id);
      applyUserSettings(settings);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error loading user settings:', error);
      }
      // Apply defaults based on device
      const defaultLargeButton = isMobileDevice();
      applyUserSettings({ largeButtonMode: defaultLargeButton, theme: 'default' });
    }
  }

  // Apply user settings to the document body
  function applyUserSettings(settings) {
    // Apply large button mode
    if (settings.largeButtonMode) {
      document.body.classList.add('large-button-mode');
    } else {
      document.body.classList.remove('large-button-mode');
    }
    // Apply theme
    document.body.classList.remove('theme-frc-red', 'theme-frc-blue', 'theme-high-contrast');
    if (settings.theme && settings.theme !== 'default') {
      document.body.classList.add(`theme-${settings.theme.replace('_', '-')}`);
    }
  }

  // =========================================================================
  // CHECK ADMIN RIGHTS
  // =========================================================================

  async function checkAdminRights(user) {
    if (!user) return false;

    // Primary admin always has access
    if (user.email?.toLowerCase() === PRIMARY_ADMIN_EMAIL?.toLowerCase()) return true;

    // Check Supabase admin list
    try {
      const { data: admins, error } = await supabase
        .from('admins')
        .select('email');

      if (!error && admins) {
        const adminEmails = admins.map(a => a.email?.toLowerCase());
        return adminEmails.includes(user.email?.toLowerCase());
      }
    } catch (error) {
      console.error('Error checking admin rights:', error);
    }

    return false;
  }

  // =========================================================================
  // LOGIN FUNCTION
  // =========================================================================

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    return data;
  }

  // =========================================================================
  // GOOGLE OAUTH LOGIN
  // =========================================================================
  // Sign in with Google - no email limits, completely free!

  async function signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        }
      }
    });

    if (error) throw error;
    return data;
  }

  // =========================================================================
  // SIGNUP FUNCTION
  // =========================================================================

  /**
   * Sign up a new user as either a Team Lead or Member
   *
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {string} username - Display name
   * @param {string} signupCode - Team invite code (required for members)
   * @param {number|string|null} teamNumber - FRC team number (optional)
   * @param {boolean} isTeamLead - True if creating a Team Lead account
   * @returns {Promise<Object>} - { user, teamCode? }
   */
  async function signup(email, password, username, signupCode, teamNumber = null, isTeamLead = false) {
    let teamLeadUid = null;
    let teamCode = null;

    // If creating a Member account, validate the team code first
    if (!isTeamLead) {
      if (!signupCode || signupCode.trim().length === 0) {
        throw new Error('Team code is required. Get it from your Team Lead.');
      }

      const teamInfo = await validateTeamCode(signupCode);
      if (!teamInfo) {
        throw new Error('Invalid team code. Please check with your Team Lead.');
      }
      teamLeadUid = teamInfo.teamLeadUid;
      teamCode = signupCode.toUpperCase().trim();
    }

    // Create user in Supabase Auth
    // Note: emailRedirectTo helps with email confirmation flow
    // If email confirmation is disabled in Supabase dashboard, user logs in immediately
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: username
        },
        // Redirect back to the app after email confirmation (if enabled)
        emailRedirectTo: `${window.location.origin}/login`
      }
    });

    if (authError) {
      // Handle rate limiting specifically
      if (authError.message?.includes('rate limit') ||
          authError.message?.includes('email rate limit') ||
          authError.status === 429) {
        throw new Error('Too many signup attempts. Please wait a few minutes and try again, or contact your team lead.');
      }
      // Handle "User already registered" - suggest login instead
      if (authError.message?.includes('already registered') ||
          authError.message?.includes('already exists')) {
        throw new Error('An account with this email already exists. Please sign in instead.');
      }
      throw authError;
    }
    const newUser = authData.user;
    if (!newUser) throw new Error('Failed to create user account');

    // Create user profile in Supabase
    const profileData = {
      id: newUser.id,
      email: newUser.email,
      display_name: username,
      role: ROLES.SCOUT,
      is_team_lead: isTeamLead
    };

    // Add team number if provided
    if (teamNumber) {
      const teamNum = parseInt(teamNumber, 10);
      profileData.team_number = teamNum;
      profileData.scouting_id = String(teamNum);
    }

    // If Member, link to Team Lead
    if (!isTeamLead && teamLeadUid) {
      profileData.team_lead_uid = teamLeadUid;
      profileData.team_code = teamCode;
    }

    // IMPORTANT: Use .select() to verify the profile was actually created
    // and contains the correct is_team_lead value, team_number, and team_code
    let createdProfile = null;
    let profileError = null;

    try {
      const result = await supabase
        .from('profiles')
        .insert(profileData)
        .select('id, is_team_lead, team_lead_uid, team_code, team_number, scouting_id')
        .single();

      createdProfile = result.data;
      profileError = result.error;
    } catch (err) {
      profileError = err;
    }

    if (profileError) {
      console.error('Error creating profile:', profileError);
      // For Team Leads, this is critical - they need a profile to generate a team code
      if (isTeamLead) {
        throw new Error('Failed to create Team Lead profile. Please try signing up again.');
      }
      // For members, the error might be a conflict - try upsert approach
      // This handles the case where the profile was partially created by a trigger
      try {
        const { data: upsertProfile, error: upsertError } = await supabase
          .from('profiles')
          .upsert(profileData, { onConflict: 'id' })
          .select('id, is_team_lead, team_lead_uid, team_code, team_number, scouting_id')
          .single();

        if (!upsertError && upsertProfile) {
          createdProfile = upsertProfile;
          profileError = null;
          if (import.meta.env.DEV) {
            console.log('✅ Profile upserted after initial insert failed:', upsertProfile);
          }
        }
      } catch (upsertErr) {
        console.error('Upsert also failed:', upsertErr);
      }
    } else if (import.meta.env.DEV) {
      console.log('✅ Profile created:', createdProfile);
    }

    // Track what needs to be fixed
    const needsFixes = {};

    // Check is_team_lead
    if (isTeamLead && createdProfile && createdProfile.is_team_lead !== true) {
      needsFixes.is_team_lead = true;
    }

    // Check team_number
    const expectedTeamNum = teamNumber ? parseInt(teamNumber, 10) : null;
    if (expectedTeamNum && (!createdProfile || createdProfile.team_number !== expectedTeamNum)) {
      needsFixes.team_number = expectedTeamNum;
      needsFixes.scouting_id = String(expectedTeamNum);
    }

    // Check team_code for members
    if (!isTeamLead && teamCode && (!createdProfile || createdProfile.team_code !== teamCode)) {
      needsFixes.team_code = teamCode;
      needsFixes.team_lead_uid = teamLeadUid;
    }

    // Apply all fixes in a single update and verify
    if (Object.keys(needsFixes).length > 0) {
      console.log('🔧 Fixing missing profile fields:', Object.keys(needsFixes));

      const { data: fixedProfile, error: fixError } = await supabase
        .from('profiles')
        .update(needsFixes)
        .eq('id', newUser.id)
        .select('id, is_team_lead, team_lead_uid, team_code, team_number, scouting_id')
        .single();

      if (fixError) {
        console.error('Error fixing profile:', fixError);
        // This is critical for members - throw an error they can see
        if (!isTeamLead && (needsFixes.team_code || needsFixes.team_lead_uid)) {
          throw new Error('Failed to link your account to your team. Please try again or update your settings after login.');
        }
      } else if (fixedProfile) {
        createdProfile = fixedProfile;
        if (import.meta.env.DEV) {
          console.log('✅ Profile fixed successfully:', fixedProfile);
        }
      }
    }

    // If Team Lead, generate their team code after profile creation
    if (isTeamLead) {
      try {
        const generatedCode = await generateTeamCode(newUser.id, newUser.email);
        teamCode = generatedCode;
        if (import.meta.env.DEV) {
          console.log('✅ Team code generated for new Team Lead:', generatedCode);
        }
      } catch (error) {
        // For Team Leads, this is important - log prominently but allow signup to complete
        console.error('Error generating team code during signup:', error);
        // They can generate code later from Profile page
      }
    }

    return { user: newUser, teamCode };
  }

  // =========================================================================
  // UPDATE USER PROFILE
  // =========================================================================

  async function updateUserProfile(updates) {
    if (!user) throw new Error('No user logged in');

    // Convert camelCase keys to snake_case for Supabase
    const snakeCaseUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      snakeCaseUpdates[snakeKey] = value;
    }

    // IMPORTANT: Use .select() to verify the update actually happened
    // Without .select(), Supabase returns no error even if 0 rows were updated
    const { data: updatedProfile, error } = await supabase
      .from('profiles')
      .update(snakeCaseUpdates)
      .eq('id', user.id)
      .select('*')
      .single();

    if (error) throw error;

    // Verify the update actually happened
    if (!updatedProfile) {
      throw new Error('Profile update failed - no data returned');
    }

    if (import.meta.env.DEV) {
      console.log('✅ Profile updated:', Object.keys(snakeCaseUpdates), updatedProfile);
    }

    // Update local profile state with the returned profile (convert to camelCase)
    setUserProfile(snakeToCamelCase(updatedProfile));

    return true;
  }

  // =========================================================================
  // LOGOUT FUNCTION
  // =========================================================================

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  // =========================================================================
  // REFRESH ROLE CONTEXT
  // =========================================================================

  async function refreshRoleContext() {
    if (!user) return;
    try {
      const context = await getRoleContext(user);
      setRoleContext(context);

      // Also refresh user profile
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profile && !error) {
        setUserProfile(snakeToCamelCase(profile));
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error refreshing role context:', error);
      }
    }
  }

  // =========================================================================
  // CONTEXT VALUE
  // =========================================================================
  // All values and functions exposed to consumers

  const value = {
    user,               // Current Supabase user object
    userProfile,        // User profile from Supabase
    isAdmin,            // Boolean: is user an admin?
    loading,            // Boolean: is auth state being checked?
    roleContext,        // RBAC context: { role, scoutingId, isMasterAdmin, canViewAll }
    login,              // Function: login(email, password)
    signInWithGoogle,   // Function: signInWithGoogle() - OAuth login
    signup,             // Function: signup(email, password, username, signupCode, teamNumber)
    logout,             // Function: logout()
    updateUserProfile,  // Function: updateUserProfile(updates)
    refreshRoleContext  // Function: refreshRoleContext() - call after role changes
  };

  // Render children with loading state available via context
  // Note: We always render children now - components use the `loading` state
  // to show their own loading UI. This fixes blank page on tab duplication.
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// =============================================================================
// USE AUTH HOOK
// =============================================================================
// Custom hook to access auth context from any component

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

