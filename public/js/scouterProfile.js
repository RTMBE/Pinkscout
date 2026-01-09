/**
 * SCOUTERPROFILE.JS - User Profile Page Handler
 */

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { collection, query, where, getDocs, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { signOutUser } from './app.js';
import { getUserProfile, updateUserProfile, getUserScoutingStats } from './user.js';

const userInfo = document.getElementById('userInfo');
const userEmail = document.getElementById('userEmail');
const logoutBtn = document.getElementById('logoutBtn');
const profileForm = document.getElementById('profileForm');
const displayNameInput = document.getElementById('displayName');
const teamNumberInput = document.getElementById('teamNumber');
const emailDisplay = document.getElementById('emailDisplay');
const profileStatus = document.getElementById('profileStatus');
const recentEntries = document.getElementById('recentEntries');

let currentUser = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = 'login.html'; return; }
  currentUser = user;
  if (userInfo) userInfo.style.display = 'block';
  if (userEmail) userEmail.textContent = user.email;
  if (emailDisplay) emailDisplay.value = user.email;
  
  await loadProfile();
  await loadScoutingStats();
  await loadRecentEntries();
});

if (logoutBtn) logoutBtn.addEventListener('click', signOutUser);
if (profileForm) profileForm.addEventListener('submit', saveProfile);

async function loadProfile() {
  try {
    const profile = await getUserProfile(currentUser.uid);
    if (profile) {
      if (displayNameInput) displayNameInput.value = profile.displayName || '';
      if (teamNumberInput) teamNumberInput.value = profile.teamNumber || '';
    }
  } catch (error) {
    console.error('Error loading profile:', error);
  }
}

async function saveProfile(e) {
  e.preventDefault();
  
  const displayName = displayNameInput.value.trim();
  const teamNumber = parseInt(teamNumberInput.value) || null;
  
  try {
    profileStatus.className = 'submit-status loading';
    profileStatus.textContent = 'Saving...';
    
    await updateUserProfile(currentUser.uid, {
      displayName: displayName,
      teamNumber: teamNumber
    });
    
    profileStatus.className = 'submit-status success';
    profileStatus.textContent = '✅ Profile saved!';
    
    setTimeout(() => {
      profileStatus.textContent = '';
      profileStatus.className = 'submit-status';
    }, 3000);
  } catch (error) {
    profileStatus.className = 'submit-status error';
    profileStatus.textContent = '❌ Error: ' + error.message;
  }
}

async function loadScoutingStats() {
  try {
    // Get scouter name from profile or email
    const profile = await getUserProfile(currentUser.uid);
    const scouterName = profile?.displayName || currentUser.email.split('@')[0];
    
    const stats = await getUserScoutingStats(scouterName);
    
    document.getElementById('myTotalEntries').textContent = stats.totalEntries;
    document.getElementById('myTeamsScounted').textContent = stats.teamsScounted;
    document.getElementById('myMatchesScounted').textContent = stats.matchesScounted;
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

async function loadRecentEntries() {
  try {
    const profile = await getUserProfile(currentUser.uid);
    const scouterName = profile?.displayName || currentUser.email.split('@')[0];
    
    const scoutingRef = collection(db, 'scouting');
    const q = query(
      scoutingRef,
      where('scouterName', '==', scouterName),
      orderBy('timestamp', 'desc'),
      limit(10)
    );
    
    const snapshot = await getDocs(q);
    const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    if (entries.length === 0) {
      recentEntries.innerHTML = '<p class="no-data">No scouting entries yet</p>';
      return;
    }
    
    let html = '<div class="entries-grid">';
    entries.forEach(entry => {
      const date = entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : 'Unknown';
      html += '<div class="entry-card">' +
        '<div class="entry-header">' +
        '<span class="team-num">Team ' + entry.teamNumber + '</span>' +
        '<span class="match-num">Match ' + entry.matchNumber + '</span>' +
        '</div>' +
        '<div class="entry-details">' +
        '<span>Auto: ' + ((entry.autoSpeaker || 0) + (entry.autoAmp || 0)) + '</span>' +
        '<span>Teleop: ' + ((entry.teleopSpeaker || 0) + (entry.teleopAmp || 0)) + '</span>' +
        '</div>' +
        '<div class="entry-date">' + date + '</div>' +
        '</div>';
    });
    html += '</div>';
    recentEntries.innerHTML = html;
  } catch (error) {
    console.error('Error loading entries:', error);
    recentEntries.innerHTML = '<p class="error">Error loading entries</p>';
  }
}

console.log('👤 Scouter Profile module loaded');

