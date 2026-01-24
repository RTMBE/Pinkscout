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
 * - API_KEYS: External API keys (TBA, Nexus)
 * - API_URLS: External API URLs
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

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

// =============================================================================
// EXTERNAL API CONFIGURATION
// =============================================================================

export const API_KEYS = {
  TBA: import.meta.env.VITE_TBA_API_KEY || '',
  NEXUS: import.meta.env.VITE_NEXUS_API_KEY || ''
};

export const API_URLS = {
  TBA: 'https://www.thebluealliance.com/api/v3',
  STATBOTICS: 'https://api.statbotics.io/v3',
  NEXUS: 'https://frc.nexus/api/v1'
};

// =============================================================================
// PRIMARY ADMIN EMAIL
// =============================================================================
// The master admin email - has unrestricted access
export const PRIMARY_ADMIN_EMAIL = import.meta.env.VITE_PRIMARY_ADMIN_EMAIL || 'rtmbe20@gmail.com';

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

