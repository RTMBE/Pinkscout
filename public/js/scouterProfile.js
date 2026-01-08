/**
 * =============================================================================
 * SCOUTER PROFILE.JS - User Profile Management
 * =============================================================================
 *
 * This module handles the Scouter Profile page:
 * - Display and edit user profile information
 * - Show scouting statistics for the current user
 * - Display recent scouting activity
 *
 * =============================================================================
 */

// =============================================================================
// IMPORTS
// =============================================================================

import { auth, db, requireAuth } from './firebase.js';
import { collection, query, where, getDocs, orderBy, limit as firestoreLimit } from './firebase.js';
import {
  initUserProfileListener,
  setupUserNav,
  getCurrentProfile,
  updateUserProfile
} from './user.js';

// =============================================================================
// STATE
// =============================================================================

let currentUser = null;
let currentProfile = null;

// =============================================================================
// PAGE INITIALIZATION
// =============================================================================

async function initProfilePage() {
  console.log('👤 Initializing Profile page...');

  // Require authentication
  await requireAuth();

  // Set up user profile listener
  initUserProfileListener((profile) => {
    if (profile) {
      currentProfile = profile;
      setupUserNav();
      displayProfile(profile);
    }
  });

  // Get current user
  currentUser = auth.currentUser;

  // Set up form submission
  document.getElementById('profile-form')?.addEventListener('submit', handleProfileSubmit);

  // Set up sign out buttons
  document.getElementById('logoutBtn')?.addEventListener('click', handleSignOut);
  document.getElementById('signOutBtn')?.addEventListener('click', handleSignOut);

  // Set up delete account
  document.getElementById('deleteAccountBtn')?.addEventListener('click', () => {
    document.getElementById('deleteAccountModal').style.display = 'flex';
  });

  document.getElementById('cancelDeleteBtn')?.addEventListener('click', () => {
    document.getElementById('deleteAccountModal').style.display = 'none';
  });

  document.getElementById('confirmDeleteBtn')?.addEventListener('click', handleDeleteAccount);

  // Load scouting stats
  await loadScoutingStats();

  // Load recent activity
  await loadRecentActivity();
}

// =============================================================================
// DISPLAY PROFILE
// =============================================================================

function displayProfile(profile) {
  // Update header
  const displayName = profile.displayName || profile.email?.split('@')[0] || 'Scouter';
  document.getElementById('profile-display-name').textContent = displayName;
  document.getElementById('profile-email').textContent = profile.email || '';
  document.getElementById('profile-role').textContent = profile.role || 'Scouter';

  // Update avatar
  const avatar = document.getElementById('profile-avatar');
  if (avatar) {
    avatar.textContent = displayName.charAt(0).toUpperCase();
  }

  // Fill form
  document.getElementById('display-name').value = profile.displayName || '';
  document.getElementById('team-number').value = profile.teamNumber || '';
  document.getElementById('preferred-position').value = profile.preferredPosition || '';
}

// =============================================================================
// HANDLE PROFILE SUBMIT
// =============================================================================

async function handleProfileSubmit(e) {
  e.preventDefault();

  const displayName = document.getElementById('display-name').value.trim();
  const teamNumber = document.getElementById('team-number').value.trim();
  const preferredPosition = document.getElementById('preferred-position').value;

  try {
    await updateUserProfile({
      displayName,
      teamNumber: teamNumber ? parseInt(teamNumber) : null,
      preferredPosition
    });

    alert('Profile updated successfully!');
  } catch (error) {
    console.error('Error updating profile:', error);
    alert('Error updating profile: ' + error.message);
  }
}

// =============================================================================
// LOAD SCOUTING STATS
// =============================================================================

async function loadScoutingStats() {
  if (!currentUser) return;

  try {
    // Query scouting entries by this user
    const scoutingRef = collection(db, 'scouting');
    const q = query(
      scoutingRef,
      where('scouterEmail', '==', currentUser.email)
    );

    const snapshot = await getDocs(q);
    const entries = snapshot.docs.map(doc => doc.data());

    // Calculate stats
    const totalScouted = entries.length;
    const uniqueTeams = new Set(entries.map(e => e.teamNumber)).size;
    const uniqueEvents = new Set(entries.map(e => e.eventCode).filter(Boolean)).size;

    // Calculate streak (simplified)
    const streak = calculateStreak(entries);

    // Update UI
    document.getElementById('total-scouted').textContent = totalScouted;
    document.getElementById('teams-scouted').textContent = uniqueTeams;
    document.getElementById('events-scouted').textContent = uniqueEvents || '-';
    document.getElementById('scouting-streak').textContent = streak;

  } catch (error) {
    console.error('Error loading scouting stats:', error);
  }
}

function calculateStreak(entries) {
  if (entries.length === 0) return 0;

  // Get unique dates
  const dates = entries
    .map(e => e.createdAt?.toDate?.()?.toDateString())
    .filter(Boolean);

  const uniqueDates = [...new Set(dates)].sort().reverse();
  if (uniqueDates.length === 0) return 0;

  // Check if most recent is today or yesterday
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) {
    return 0;
  }

  return Math.min(uniqueDates.length, 7); // Cap at 7 for simplicity
}

// =============================================================================
// LOAD RECENT ACTIVITY
// =============================================================================

async function loadRecentActivity() {
  if (!currentUser) return;

  const container = document.getElementById('recent-activity');
  if (!container) return;

  try {
    const scoutingRef = collection(db, 'scouting');
    const q = query(
      scoutingRef,
      where('scouterEmail', '==', currentUser.email),
      orderBy('createdAt', 'desc'),
      firestoreLimit(10)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      container.innerHTML = '<div class="empty-state">No scouting activity yet</div>';
      return;
    }

    const entries = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    container.innerHTML = entries.map(entry => `
      <div class="activity-item">
        <div class="activity-icon">📝</div>
        <div class="activity-content">
          <p><strong>Team ${entry.teamNumber}</strong> - Match ${entry.matchNumber || 'N/A'}</p>
          <span class="activity-time">${formatTime(entry.createdAt)}</span>
        </div>
        <div class="activity-score">${entry.totalScore || 0} pts</div>
      </div>
    `).join('');

  } catch (error) {
    console.error('Error loading recent activity:', error);
    container.innerHTML = '<div class="error-state">Error loading activity</div>';
  }
}

function formatTime(timestamp) {
  if (!timestamp) return 'Unknown';

  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  // Less than 1 hour
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins} min${mins !== 1 ? 's' : ''} ago`;
  }

  // Less than 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  }

  // Otherwise show date
  return date.toLocaleDateString();
}

// =============================================================================
// SIGN OUT
// =============================================================================

async function handleSignOut() {
  try {
    const { signOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
    await signOut(auth);
    window.location.href = 'login.html';
  } catch (error) {
    console.error('Sign out error:', error);
    alert('Failed to sign out. Please try again.');
  }
}

// =============================================================================
// DELETE ACCOUNT
// =============================================================================

async function handleDeleteAccount() {
  try {
    const user = auth.currentUser;
    if (!user) {
      alert('No user logged in.');
      return;
    }

    // Import Firebase auth functions
    const { deleteUser } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
    const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

    // Delete user profile from Firestore
    try {
      const userRef = doc(db, 'users', user.uid);
      await deleteDoc(userRef);
      console.log('✅ User profile deleted from Firestore');
    } catch (e) {
      console.error('Error deleting user profile:', e);
    }

    // Delete Firebase Auth account
    await deleteUser(user);
    console.log('✅ User account deleted');

    // Redirect to login
    alert('Your account has been deleted.');
    window.location.href = 'login.html';

  } catch (error) {
    console.error('Delete account error:', error);

    if (error.code === 'auth/requires-recent-login') {
      alert('For security, please sign out and sign back in before deleting your account.');
    } else {
      alert('Failed to delete account: ' + error.message);
    }
  }
}

// =============================================================================
// INITIALIZATION
// =============================================================================

document.addEventListener('DOMContentLoaded', initProfilePage);

