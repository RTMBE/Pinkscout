/**
 * TEAM.JS - Team Statistics Page
 * Handles team search and displays team-specific scouting data.
 */

import { db, auth } from './firebase.js';
import { collection, query, where, getDocs, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { signOut } from './firebase.js';

let performanceChart = null;

// Auth state listener
onAuthStateChanged(auth, (user) => {
  if (user) {
    document.getElementById('userInfo').style.display = 'block';
    document.getElementById('userEmail').textContent = user.email;
    
    // Check URL for team number
    const urlParams = new URLSearchParams(window.location.search);
    const teamNum = urlParams.get('team');
    if (teamNum) {
      document.getElementById('teamSearchInput').value = teamNum;
      searchTeam(parseInt(teamNum));
    }
  } else {
    window.location.href = 'login.html';
  }
});

// Event listeners
document.getElementById('searchBtn').addEventListener('click', () => {
  const teamNum = parseInt(document.getElementById('teamSearchInput').value);
  if (teamNum) searchTeam(teamNum);
});

document.getElementById('teamSearchInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const teamNum = parseInt(document.getElementById('teamSearchInput').value);
    if (teamNum) searchTeam(teamNum);
  }
});

document.getElementById('logoutBtn').addEventListener('click', signOut);

// Search for team data
async function searchTeam(teamNumber) {
  try {
    const q = query(
      collection(db, 'scoutingData'),
      where('teamNumber', '==', teamNumber),
      orderBy('matchNumber', 'asc')
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      document.getElementById('teamResults').style.display = 'none';
      document.getElementById('noResults').style.display = 'block';
      return;
    }
    
    const matches = [];
    snapshot.forEach(doc => matches.push(doc.data()));
    
    displayTeamData(teamNumber, matches);
    
  } catch (error) {
    console.error('Error searching team:', error);
    alert('Error searching for team. Please try again.');
  }
}

function displayTeamData(teamNumber, matches) {
  document.getElementById('teamResults').style.display = 'block';
  document.getElementById('noResults').style.display = 'none';
  document.getElementById('teamNumber').textContent = teamNumber;
  
  // Calculate stats
  const totalMatches = matches.length;
  const avgAuto = matches.reduce((sum, m) => sum + (m.autoPoints || 0), 0) / totalMatches;
  const avgTeleop = matches.reduce((sum, m) => sum + (m.teleopPoints || 0), 0) / totalMatches;
  const avgTotal = matches.reduce((sum, m) => sum + ((m.autoPoints || 0) + (m.teleopPoints || 0)), 0) / totalMatches;
  
  // Display stats
  document.getElementById('scoringStats').innerHTML = `
    <div class="stat-card"><div class="stat-value">${totalMatches}</div><div class="stat-label">Matches</div></div>
    <div class="stat-card"><div class="stat-value">${avgAuto.toFixed(1)}</div><div class="stat-label">Avg Auto</div></div>
    <div class="stat-card"><div class="stat-value">${avgTeleop.toFixed(1)}</div><div class="stat-label">Avg Teleop</div></div>
    <div class="stat-card"><div class="stat-value">${avgTotal.toFixed(1)}</div><div class="stat-label">Avg Total</div></div>
  `;
  
  // Display match history
  const tbody = document.getElementById('matchHistoryBody');
  tbody.innerHTML = matches.map(m => `
    <tr>
      <td>${m.matchNumber || 'N/A'}</td>
      <td>${m.autoPoints || 0}</td>
      <td>${m.teleopPoints || 0}</td>
      <td>${m.endgame || 'None'}</td>
      <td>${(m.autoPoints || 0) + (m.teleopPoints || 0)}</td>
    </tr>
  `).join('');
  
  // Create chart
  createPerformanceChart(matches);
}

function createPerformanceChart(matches) {
  const ctx = document.getElementById('teamPerformanceChart').getContext('2d');
  
  if (performanceChart) performanceChart.destroy();
  
  performanceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: matches.map(m => `Match ${m.matchNumber || '?'}`),
      datasets: [
        {
          label: 'Auto Points',
          data: matches.map(m => m.autoPoints || 0),
          borderColor: '#ff6b9d',
          tension: 0.1
        },
        {
          label: 'Teleop Points',
          data: matches.map(m => m.teleopPoints || 0),
          borderColor: '#4a90d9',
          tension: 0.1
        }
      ]
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true } }
    }
  });
}

