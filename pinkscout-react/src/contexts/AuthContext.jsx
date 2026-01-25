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
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      const supabaseUser = session?.user || null;
      handleAuthChange(supabaseUser);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const supabaseUser = session?.user || null;
        await handleAuthChange(supabaseUser);
      }
    );

    // Cleanup subscription on unmount
    return () => subscription.unsubscribe();
  }, []);

  // Handle auth state changes
  async function handleAuthChange(supabaseUser) {
    setUser(supabaseUser);

    if (supabaseUser) {
      // Check admin rights
      const adminStatus = await checkAdminRights(supabaseUser);
      setIsAdmin(adminStatus);

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
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error loading user profile:', error);
        }
      }
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

    setLoading(false);
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
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: username
        }
      }
    });

    if (authError) throw authError;
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

    const { error: profileError } = await supabase
      .from('profiles')
      .insert(profileData);

    if (profileError) {
      console.error('Error creating profile:', profileError);
      // Don't throw - user was created, they can update profile later
    }

    // If Team Lead, generate their team code after profile creation
    if (isTeamLead) {
      try {
        const generatedCode = await generateTeamCode(newUser.id, newUser.email);
        teamCode = generatedCode;
      } catch (error) {
        // Non-critical - they can generate code later from Team Admin section
        if (import.meta.env.DEV) {
          console.error('Error generating team code:', error);
        }
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

    const { error } = await supabase
      .from('profiles')
      .update(snakeCaseUpdates)
      .eq('id', user.id);

    if (error) throw error;

    // Update local profile state with camelCase keys for consistent access
    setUserProfile(prev => ({ ...prev, ...updates }));

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
    signup,             // Function: signup(email, password, username, signupCode, teamNumber)
    logout,             // Function: logout()
    updateUserProfile,  // Function: updateUserProfile(updates)
    refreshRoleContext  // Function: refreshRoleContext() - call after role changes
  };

  // Don't render children until auth state is determined
  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
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

