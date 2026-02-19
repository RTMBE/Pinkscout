/**
 * =============================================================================
 * USER SETTINGS SERVICE - User preferences storage and retrieval
 * =============================================================================
 * 
 * Handles user preferences like large button mode and themes.
 * Settings are stored in the user_settings table in Supabase.
 * 
 * =============================================================================
 */

import { supabase } from './supabase';

// Default settings
const DEFAULT_SETTINGS = {
  large_button_mode: false,
  theme: 'default',
  offline_enabled: true
};

// =============================================================================
// GET USER SETTINGS
// =============================================================================

/**
 * Get user settings
 * @param {string} userId - The user's ID
 * @returns {Promise<Object>} User settings object
 */
export async function getUserSettings(userId) {
  if (!userId) {
    return { ...DEFAULT_SETTINGS };
  }

  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching user settings:', error);
    throw error;
  }

  // Return data or defaults
  return data ? {
    largeButtonMode: data.large_button_mode ?? DEFAULT_SETTINGS.large_button_mode,
    theme: data.theme ?? DEFAULT_SETTINGS.theme,
    offlineEnabled: data.offline_enabled ?? DEFAULT_SETTINGS.offline_enabled
  } : {
    largeButtonMode: DEFAULT_SETTINGS.large_button_mode,
    theme: DEFAULT_SETTINGS.theme,
    offlineEnabled: DEFAULT_SETTINGS.offline_enabled
  };
}

// =============================================================================
// SAVE USER SETTINGS
// =============================================================================

/**
 * Save or update user settings
 * @param {string} userId - The user's ID
 * @param {Object} settings - Settings to save
 * @returns {Promise<Object>} Saved settings
 */
export async function saveUserSettings(userId, settings) {
  if (!userId) {
    throw new Error('User ID is required');
  }

  const dbData = {
    id: userId,
    large_button_mode: settings.largeButtonMode ?? DEFAULT_SETTINGS.large_button_mode,
    theme: settings.theme ?? DEFAULT_SETTINGS.theme,
    offline_enabled: settings.offlineEnabled ?? DEFAULT_SETTINGS.offline_enabled
  };

  const { data, error } = await supabase
    .from('user_settings')
    .upsert(dbData, {
      onConflict: 'id'
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving user settings:', error);
    throw error;
  }

  return {
    largeButtonMode: data.large_button_mode,
    theme: data.theme,
    offlineEnabled: data.offline_enabled
  };
}

// =============================================================================
// UPDATE SINGLE SETTING
// =============================================================================

/**
 * Update a single setting
 * @param {string} userId - The user's ID
 * @param {string} key - Setting key (largeButtonMode, theme, offlineEnabled)
 * @param {*} value - Setting value
 * @returns {Promise<Object>} Updated settings
 */
export async function updateSingleSetting(userId, key, value) {
  // First get current settings
  const current = await getUserSettings(userId);
  
  // Update the specific key
  const updated = { ...current };
  updated[key] = value;

  // Save all settings
  return saveUserSettings(userId, updated);
}

// =============================================================================
// DETECT MOBILE DEVICE
// =============================================================================

/**
 * Check if the current device is a mobile/phone
 * Used to default large button mode to ON for phones
 * @returns {boolean} True if mobile device
 */
export function isMobileDevice() {
  if (typeof window === 'undefined') return false;
  
  const ua = navigator.userAgent || navigator.vendor || window.opera;
  
  // Check for mobile keywords
  if (/android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(ua.toLowerCase())) {
    return true;
  }
  
  // Check screen size (phones typically < 768px width)
  if (window.innerWidth < 768) {
    return true;
  }
  
  return false;
}

/**
 * Check if device is tablet
 * @returns {boolean} True if tablet device
 */
export function isTabletDevice() {
  if (typeof window === 'undefined') return false;
  
  const ua = navigator.userAgent.toLowerCase();
  
  // iPad detection
  if (/ipad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return true;
  }
  
  // Android tablet (android without mobile)
  if (/android/.test(ua) && !/mobile/.test(ua)) {
    return true;
  }
  
  // Check screen size (tablets typically 768-1024px)
  if (window.innerWidth >= 768 && window.innerWidth <= 1024) {
    return true;
  }
  
  return false;
}

