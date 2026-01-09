/**
 * USER.JS - User Profile Management
 * 
 * This module handles user profile operations:
 * - Creating user profiles on signup
 * - Updating user profiles
 * - Getting user statistics
 * - Managing user preferences
 */

import { auth, db } from './firebase.js';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

/**
 * CREATE USER PROFILE
 * Creates a new user profile document in Firestore
 * Called after successful signup
 * 
 * @param {string} uid - Firebase user ID
 * @param {Object} profileData - Initial profile data
 * @returns {Promise<void>}
 */
export async function createUserProfile(uid, profileData) {
  const userRef = doc(db, 'users', uid);
  const profile = {
    email: profileData.email || '',
    displayName: profileData.displayName || '',
    teamNumber: profileData.teamNumber || null,
    role: 'scouter', // Default role
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
    scoutingCount: 0,
    preferences: {
      theme: 'light',
      notifications: true
    }
  };
  await setDoc(userRef, profile);
  console.log('👤 User profile created:', uid);
  return profile;
}

/**
 * GET USER PROFILE
 * Retrieves user profile from Firestore
 * 
 * @param {string} uid - Firebase user ID
 * @returns {Promise<Object|null>} User profile or null
 */
export async function getUserProfile(uid) {
  const userRef = doc(db, 'users', uid);
  const snapshot = await getDoc(userRef);
  if (snapshot.exists()) {
    return { id: snapshot.id, ...snapshot.data() };
  }
  return null;
}

/**
 * UPDATE USER PROFILE
 * Updates specific fields in user profile
 * Creates the profile if it doesn't exist (upsert)
 *
 * @param {string} uid - Firebase user ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<void>}
 */
export async function updateUserProfile(uid, updates) {
  const userRef = doc(db, 'users', uid);

  // Check if profile exists first
  const snapshot = await getDoc(userRef);

  if (snapshot.exists()) {
    // Update existing profile
    await updateDoc(userRef, {
      ...updates,
      updatedAt: new Date().toISOString()
    });
  } else {
    // Create new profile with defaults
    await setDoc(userRef, {
      displayName: updates.displayName || '',
      teamNumber: updates.teamNumber || null,
      role: 'scouter',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      scoutingCount: 0,
      preferences: {
        theme: 'light',
        notifications: true
      }
    });
  }
  console.log('👤 User profile updated:', uid);
}

/**
 * UPDATE LAST LOGIN
 * Updates the lastLogin timestamp
 * 
 * @param {string} uid - Firebase user ID
 * @returns {Promise<void>}
 */
export async function updateLastLogin(uid) {
  const userRef = doc(db, 'users', uid);
  await updateDoc(userRef, {
    lastLogin: new Date().toISOString()
  });
}

/**
 * GET USER SCOUTING STATS
 * Calculates statistics for a specific user's scouting entries
 * 
 * @param {string} scouterName - Name of the scouter
 * @returns {Promise<Object>} Scouting statistics
 */
export async function getUserScoutingStats(scouterName) {
  const scoutingRef = collection(db, 'scouting');
  const q = query(
    scoutingRef,
    where('scouterName', '==', scouterName),
    orderBy('timestamp', 'desc')
  );
  
  const snapshot = await getDocs(q);
  const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  if (entries.length === 0) {
    return {
      totalEntries: 0,
      teamsScounted: 0,
      matchesScounted: 0,
      recentEntries: []
    };
  }
  
  const uniqueTeams = new Set(entries.map(e => e.teamNumber));
  const uniqueMatches = new Set(entries.map(e => e.matchNumber));
  
  return {
    totalEntries: entries.length,
    teamsScounted: uniqueTeams.size,
    matchesScounted: uniqueMatches.size,
    recentEntries: entries.slice(0, 5)
  };
}

/**
 * INCREMENT SCOUTING COUNT
 * Increments the user's scouting count after successful submission
 * 
 * @param {string} uid - Firebase user ID
 * @returns {Promise<void>}
 */
export async function incrementScoutingCount(uid) {
  const profile = await getUserProfile(uid);
  if (profile) {
    await updateUserProfile(uid, {
      scoutingCount: (profile.scoutingCount || 0) + 1
    });
  }
}

console.log('👤 User module loaded');

