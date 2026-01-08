/**
 * =============================================================================
 * USER MODULE - FRC Scouting App (Pinkscout)
 * =============================================================================
 *
 * This module handles user profile management:
 * - Creating/updating user profiles in Firestore
 * - Auto-filling scouter name in forms
 * - Managing user roles (scouter, analyst, admin)
 * - Tracking scouting statistics
 *
 * USER PROFILE STRUCTURE:
 * users/{uid}
 *   - displayName: string (the scouter's name)
 *   - email: string
 *   - role: string ('scouter' | 'analyst' | 'admin')
 *   - createdAt: timestamp
 *   - updatedAt: timestamp
 *   - scoutingCount: number (how many entries submitted)
 *   - photoURL: string (optional)
 *
 * =============================================================================
 */

// =============================================================================
// IMPORTS
// =============================================================================

import { db, auth } from './firebase.js';
import {
  doc, getDoc, setDoc, updateDoc, increment, serverTimestamp, onSnapshot
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { onAuthStateChanged, updateProfile } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// =============================================================================
// CURRENT USER STATE
// =============================================================================

// Cache the current user's profile
let currentUserProfile = null;
let profileUnsubscribe = null;

// =============================================================================
// PROFILE MANAGEMENT
// =============================================================================

/**
 * GET USER PROFILE
 * ----------------
 * Fetches the user's profile from Firestore.
 * Creates a new profile if one doesn't exist.
 *
 * @param {string} uid - The user's Firebase Auth UID
 * @returns {Promise<Object>} - The user profile
 */
export async function getUserProfile(uid) {
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      return { uid, ...userSnap.data() };
    }

    // Profile doesn't exist - create default one
    return null;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
}

/**
 * CREATE USER PROFILE
 * -------------------
 * Creates a new user profile when they first sign up.
 *
 * @param {Object} user - Firebase Auth user object
 * @param {Object} additionalData - Extra data to store
 * @returns {Promise<Object>} - The created profile
 */
export async function createUserProfile(user, additionalData = {}) {
  try {
    const userRef = doc(db, 'users', user.uid);

    const profileData = {
      displayName: additionalData.displayName || user.displayName || user.email.split('@')[0],
      email: user.email,
      role: 'scouter', // Default role - admins upgrade manually
      scoutingCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...additionalData
    };

    await setDoc(userRef, profileData);
    console.log('✅ User profile created:', user.uid);

    return { uid: user.uid, ...profileData };
  } catch (error) {
    console.error('Error creating user profile:', error);
    throw error;
  }
}

/**
 * UPDATE USER PROFILE
 * -------------------
 * Updates specific fields in the user's profile.
 *
 * @param {string} uid - The user's UID
 * @param {Object} updates - Fields to update
 */
export async function updateUserProfile(uid, updates) {
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    console.log('✅ User profile updated:', uid);
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw error;
  }
}

/**
 * INCREMENT SCOUTING COUNT
 * ------------------------
 * Increments the user's scouting entry count by 1.
 * Called whenever they submit a new scouting entry.
 *
 * @param {string} uid - The user's UID
 */
export async function incrementScoutingCount(uid) {
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      scoutingCount: increment(1),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Error incrementing scouting count:', error);
  }
}

/**
 * INITIALIZE USER PROFILE LISTENER
 * ---------------------------------
 * Sets up a real-time listener for the current user's profile.
 * Automatically updates the cached profile when it changes.
 *
 * @param {Function} onChange - Callback when profile changes
 */
export function initUserProfileListener(onChange) {
  // Unsubscribe from previous listener if exists
  if (profileUnsubscribe) {
    profileUnsubscribe();
    profileUnsubscribe = null;
  }

  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentUserProfile = null;
      if (onChange) onChange(null);
      return;
    }

    // Get or create profile
    let profile = await getUserProfile(user.uid);
    if (!profile) {
      profile = await createUserProfile(user);
    }
    currentUserProfile = profile;

    // Set up real-time listener
    const userRef = doc(db, 'users', user.uid);
    profileUnsubscribe = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        currentUserProfile = { uid: user.uid, ...snap.data() };
        if (onChange) onChange(currentUserProfile);
      }
    });

    if (onChange) onChange(currentUserProfile);
  });
}

/**
 * AUTO-FILL SCOUTER NAME
 * ----------------------
 * Automatically fills in the scouter name field in forms.
 * Looks for input with name="scouterName" or id="scouterName".
 */
export function autoFillScouterName() {
  const profile = getCurrentProfile();
  if (!profile) return;

  // Find scouter name input
  const inputs = document.querySelectorAll('input[name="scouterName"], input#scouterName, #scouter-name');
  inputs.forEach(input => {
    if (input && !input.value) {
      input.value = profile.displayName || '';
    }
  });
}

/**
 * CHECK USER ROLE
 * ---------------
 * Checks if the current user has a specific role.
 *
 * @param {string} role - The role to check ('scouter', 'analyst', 'admin')
 * @returns {boolean}
 */
export function hasRole(role) {
  if (!currentUserProfile) return false;

  // Admins have all permissions
  if (currentUserProfile.role === 'admin') return true;

  // Analysts have analyst and scouter permissions
  if (currentUserProfile.role === 'analyst' && role === 'scouter') return true;

  return currentUserProfile.role === role;
}

/**
 * CHECK IF ADMIN
 * --------------
 * Quick check if current user is an admin.
 */
export function isAdmin() {
  return hasRole('admin');
}

/**
 * CHECK IF ANALYST OR ADMIN
 * -------------------------
 * Quick check if current user has analyst-level permissions.
 */
export function isAnalyst() {
  return hasRole('analyst');
}

/**
 * GET USER STATS
 * --------------
 * Gets statistics about the user's scouting activity.
 * Returns data for the scouter profile page.
 */
export async function getUserStats(uid) {
  const profile = await getUserProfile(uid);
  if (!profile) return null;

  // Query their scouting entries for more detailed stats
  // This is a simplified version - expand as needed
  return {
    displayName: profile.displayName,
    email: profile.email,
    role: profile.role,
    scoutingCount: profile.scoutingCount || 0,
    memberSince: profile.createdAt,
    lastActive: profile.updatedAt
  };
}

/**
 * SETUP USER NAV
 * --------------
 * Populates the navigation bar with user info and sign-out button.
 * Call this on every page to show the logged-in user.
 */
export function setupUserNav() {
  const profile = getCurrentProfile();

  // Find user display elements (check multiple selectors for compatibility)
  const userNameEl = document.querySelector('.user-name, #user-name, .username, #userEmail');
  const userEmailEl = document.querySelector('.user-email, #user-email, #userEmail');
  const userInfoEl = document.querySelector('.user-info, #userInfo');
  const signOutBtn = document.querySelector('.sign-out-btn, #sign-out-btn, #logoutBtn, [data-action="sign-out"]');

  // Show user info container if it exists
  if (userInfoEl) {
    userInfoEl.style.display = 'block';
  }

  if (userNameEl && profile) {
    userNameEl.textContent = profile.displayName || 'User';
  }

  if (userEmailEl && profile) {
    userEmailEl.textContent = profile.email || '';
  }

  if (signOutBtn) {
    signOutBtn.addEventListener('click', async () => {
      try {
        const { signOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        await signOut(auth);
        window.location.href = 'login.html';
      } catch (error) {
        console.error('Sign out error:', error);
      }
    });
  }
}

/**
 * GET CURRENT USER PROFILE
 * ------------------------
 * Returns the cached current user profile.
 * Call initUserProfileListener first to populate this.
 */
export function getCurrentProfile() {
  return currentUserProfile;
}

/**
 * UPDATE DISPLAY NAME
 * -------------------
 * Updates the user's display name in both Firestore and Firebase Auth.
 *
 * @param {string} newName - The new display name
 */
export async function updateDisplayName(newName) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');

  // Update Firebase Auth profile
  await updateProfile(user, { displayName: newName });

  // Update Firestore profile
  await updateUserProfile(user.uid, { displayName: newName });
}

