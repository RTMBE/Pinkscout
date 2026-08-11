/**
 * =============================================================================
 * SUPABASE.JS - Supabase Client Configuration
 * =============================================================================
 *
 * WHAT IS THIS FILE?
 * Central configuration for Supabase client used throughout the app.
 * This is the primary backend client for authentication and database.
 *
 * EXPORTS:
 * - supabase: Supabase client instance
 * - PRIMARY_ADMIN_EMAIL: Master admin email
 *
 * =============================================================================
 */

import { createClient } from '@supabase/supabase-js';

// =============================================================================
// SUPABASE CONFIGURATION
// =============================================================================

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase environment variables!');
  console.error('Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local');
}

// PKCE needs the verifier to survive an OAuth/email-confirmation redirect, but
// shared scouting tablets must not retain a session after their browser tab is
// closed. Session storage gives us both properties and avoids localStorage.
const sessionStorageAdapter = {
  getItem(key) {
    try {
      return globalThis.sessionStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      globalThis.sessionStorage?.setItem(key, value);
    } catch {
      // Auth will surface a normal session error if storage is unavailable.
    }
  },
  removeItem(key) {
    try {
      globalThis.sessionStorage?.removeItem(key);
    } catch {
      // Best-effort cleanup for restrictive browser privacy modes.
    }
  }
};

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    // `persistSession` works with the storage adapter above: it survives an
    // authorization redirect but expires when the browser tab/session ends.
    persistSession: true,
    storage: sessionStorageAdapter,
    detectSessionInUrl: true,
    flowType: 'pkce'
  }
});

// =============================================================================
// PRIMARY ADMIN EMAIL
// =============================================================================
// This value is UI metadata only. Platform access is determined by the
// server-side `platform_admins` table and RLS, never an email in browser code.
export const PRIMARY_ADMIN_EMAIL = null;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get current authenticated user
 * @returns {Promise<Object|null>} - Current user or null
 */
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Get current session
 * @returns {Promise<Object|null>} - Current session or null
 */
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// Export for backwards compatibility during migration
export default supabase;
