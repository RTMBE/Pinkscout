/**
 * =============================================================================
 * TEAMS.JS - Combined Teams & Dashboard Page
 * =============================================================================
 *
 * This file handles:
 * - Statistics cards (matches, teams, averages)
 * - Team search with partial matching
 * - Leaderboard display
 * - Charts (scoring distribution, team performance)
 * - Recent scouting entries table
 * - Team detail modal
 *
 * =============================================================================
 */


// =============================================================================
// IMPORTS
// =============================================================================

import {
  searchTeams,
  getTeamStats,
  readTopTeams,
  getTeamScoutingData,
  getAllScoutingData
} from './app.js';

import { requireAuth, signOut, setupAuthListener } from './firebase.js';


// =============================================================================
// GLOBAL VARIABLES
// =============================================================================

let scoringChart = null;
let performanceChart = null;


// =============================================================================
// AUTHENTICATION SETUP
// =============================================================================

requireAuth();

setupAuthListener(
  (user) => {
    document.getElementById('userInfo').style.display = 'block';
    document.getElementById('userEmail').textContent = user.email;

    // Load all data
    loadAllData();
  }
);

document.getElementById('logoutBtn').addEventListener('click', signOut);


// =============================================================================
// MAIN DATA LOADING
// =============================================================================

async function loadAllData() {
  try {
    // Load scouting data for stats and charts
    const scoutingData = await getAllScoutingData();

    if (scoutingData.length > 0) {
      updateStats(scoutingData);
      createScoringChart(scoutingData);
      createPerformanceChart(scoutingData);
      displayRecentEntries(scoutingData);
    } else {
      showNoDataMessage();
    }

    // Load leaderboard
    await loadLeaderboard();

  } catch (error) {
    console.error('Error loading data:', error);
  }
}

function showNoDataMessage() {
  const recentEntries = document.getElementById('recentEntries');
  if (recentEntries) {
    recentEntries.innerHTML = '<p class="no-data">No scouting data yet. <a href="newscounting.html">Start scouting</a> to see data here.</p>';
  }
}


// =============================================================================
// STATISTICS
// =============================================================================

function updateStats(data) {
  // Total Matches
  const totalMatchesEl = document.getElementById('totalMatches');
  if (totalMatchesEl) totalMatchesEl.textContent = data.length;

  // Unique Teams
  const uniqueTeams = [...new Set(data.map(d => d.teamNumber))];
  const totalTeamsEl = document.getElementById('totalTeams');
  if (totalTeamsEl) totalTeamsEl.textContent = uniqueTeams.length;

  // Average Score
  const avgScore = data.reduce((sum, d) => {
    const autoScore = (d.autoSpeaker || 0) * 5 + (d.autoAmp || 0) * 2;
    const teleopScore = (d.teleopSpeaker || 0) * 2 + (d.teleopAmp || 0) + (d.amplifiedScored || 0) * 5;
    return sum + autoScore + teleopScore;
  }, 0) / data.length;
  const avgScoreEl = document.getElementById('avgScore');
  if (avgScoreEl) avgScoreEl.textContent = avgScore.toFixed(1);

  // Top Team
  const teamScores = {};
  data.forEach(d => {
    const score = (d.autoSpeaker || 0) * 5 + (d.autoAmp || 0) * 2 +
                  (d.teleopSpeaker || 0) * 2 + (d.teleopAmp || 0) + (d.amplifiedScored || 0) * 5;
    if (!teamScores[d.teamNumber]) {
      teamScores[d.teamNumber] = { total: 0, count: 0 };
    }
    teamScores[d.teamNumber].total += score;
    teamScores[d.teamNumber].count++;
  });

  let topTeam = '-';
  let topAvg = 0;
  for (const [team, scores] of Object.entries(teamScores)) {
    const avg = scores.total / scores.count;
    if (avg > topAvg) {
      topAvg = avg;
      topTeam = team;
    }
  }
  const topTeamEl = document.getElementById('topTeam');
  if (topTeamEl) topTeamEl.textContent = topTeam;
}


// =============================================================================
// CHARTS
// =============================================================================

function createScoringChart(data) {
  const canvas = document.getElementById('scoringChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  const totalAutoSpeaker = data.reduce((sum, d) => sum + (d.autoSpeaker || 0), 0);
  const totalAutoAmp = data.reduce((sum, d) => sum + (d.autoAmp || 0), 0);
  const totalTeleopSpeaker = data.reduce((sum, d) => sum + (d.teleopSpeaker || 0), 0);
  const totalTeleopAmp = data.reduce((sum, d) => sum + (d.teleopAmp || 0), 0);
  const totalAmplified = data.reduce((sum, d) => sum + (d.amplifiedScored || 0), 0);

  if (scoringChart) scoringChart.destroy();

  scoringChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Auto Speaker', 'Auto Amp', 'Teleop Speaker', 'Teleop Amp', 'Amplified'],
      datasets: [{
        data: [totalAutoSpeaker, totalAutoAmp, totalTeleopSpeaker, totalTeleopAmp, totalAmplified],
        backgroundColor: ['#e91e63', '#f48fb1', '#3f51b5', '#9fa8da', '#ff9800'],
        borderWidth: 2,
        borderColor: '#fff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'right' } }
    }
  });
}

function createPerformanceChart(data) {
  const canvas = document.getElementById('performanceChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  const teamData = {};
  data.forEach(d => {
    if (!teamData[d.teamNumber]) {
      teamData[d.teamNumber] = { autoScores: [], teleopScores: [], count: 0 };
    }
    const autoScore = (d.autoSpeaker || 0) * 5 + (d.autoAmp || 0) * 2;
    const teleopScore = (d.teleopSpeaker || 0) * 2 + (d.teleopAmp || 0) + (d.amplifiedScored || 0) * 5;
    teamData[d.teamNumber].autoScores.push(autoScore);
    teamData[d.teamNumber].teleopScores.push(teleopScore);
    teamData[d.teamNumber].count++;
  });

  const teams = Object.keys(teamData)
    .map(team => ({
      team,
      avgAuto: teamData[team].autoScores.reduce((a, b) => a + b, 0) / teamData[team].count,
      avgTeleop: teamData[team].teleopScores.reduce((a, b) => a + b, 0) / teamData[team].count
    }))
    .sort((a, b) => (b.avgAuto + b.avgTeleop) - (a.avgAuto + a.avgTeleop))
    .slice(0, 10);

  if (performanceChart) performanceChart.destroy();

  performanceChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: teams.map(t => `Team ${t.team}`),
      datasets: [
        { label: 'Avg Auto', data: teams.map(t => t.avgAuto.toFixed(1)), backgroundColor: '#e91e63' },
        { label: 'Avg Teleop', data: teams.map(t => t.avgTeleop.toFixed(1)), backgroundColor: '#3f51b5' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
      plugins: { legend: { position: 'top' } }
    }
  });
}


// =============================================================================
// RECENT ENTRIES TABLE
// =============================================================================

function displayRecentEntries(data) {
  const container = document.getElementById('recentEntries');
  if (!container) return;

  const recentData = data.slice(0, 10);

  let html = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Match</th>
          <th>Team</th>
          <th>Alliance</th>
          <th>Auto</th>
          <th>Teleop</th>
          <th>Climb</th>
          <th>Scouter</th>
        </tr>
      </thead>
      <tbody>
  `;

  recentData.forEach(entry => {
    const autoScore = (entry.autoSpeaker || 0) * 5 + (entry.autoAmp || 0) * 2;
    const teleopScore = (entry.teleopSpeaker || 0) * 2 + (entry.teleopAmp || 0) + (entry.amplifiedScored || 0) * 5;
    const allianceClass = entry.allianceColor === 'red' ? 'alliance-red' : 'alliance-blue';

    html += `
      <tr>
        <td>${entry.matchNumber || '-'}</td>
        <td><strong>${entry.teamNumber || '-'}</strong></td>
        <td class="${allianceClass}">${entry.allianceColor ? entry.allianceColor.toUpperCase() : '-'}</td>
        <td>${autoScore}</td>
        <td>${teleopScore}</td>
        <td>${entry.climbStatus || '-'}</td>
        <td>${entry.scouterName || '-'}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}


// =============================================================================
// DEBOUNCE UTILITY
// =============================================================================
//
// Debouncing prevents a function from being called too frequently.
// When the user types, we wait until they stop typing before searching.
//
// =============================================================================

/**
 * DEBOUNCE FUNCTION
 * -----------------
 * Creates a debounced version of a function that delays execution
 * until after a specified wait time has elapsed since the last call.
 *
 * @param {Function} func - The function to debounce
 * @param {number} wait - Milliseconds to wait before calling
 * @returns {Function} - The debounced function
 *
 * @example
 * const debouncedSearch = debounce(search, 300);
 * input.addEventListener('input', debouncedSearch);
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    // Clear any existing timeout
    clearTimeout(timeout);
    // Set a new timeout
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}


// =============================================================================
// TEAM SEARCH
// =============================================================================

/**
 * HANDLE SEARCH INPUT
 * -------------------
 * Called when the user types in the search box.
 * Searches for teams matching the input.
 */
async function handleSearchInput(event) {
  const query = event.target.value.trim();
  const resultsContainer = document.getElementById('searchResults');

  // If empty query, clear results and show leaderboard
  if (!query) {
    resultsContainer.innerHTML = '';
    return;
  }

  try {
    // Show loading state
    resultsContainer.innerHTML = '<p class="loading">Searching...</p>';

    // Search for matching teams
    const results = await searchTeams(query);

    // Display results
    displaySearchResults(results);

  } catch (error) {
    console.error('Search error:', error);
    resultsContainer.innerHTML = '<p class="error">Error searching teams.</p>';
  }
}

// Create debounced version of search (300ms delay)
const debouncedSearch = debounce(handleSearchInput, 300);


/**
 * DISPLAY SEARCH RESULTS
 * ----------------------
 * Shows the search results in a list format.
 */
function displaySearchResults(results) {
  const container = document.getElementById('searchResults');

  if (results.length === 0) {
    container.innerHTML = '<p class="no-results">No teams found.</p>';
    return;
  }

  let html = '<div class="search-results-list">';

  results.forEach(team => {
    html += `
      <div class="team-result-card" onclick="showTeamDetails(${team.teamNumber})">
        <div class="team-number">Team ${team.teamNumber}</div>
        <div class="team-stats">
          <span>Avg: ${team.avgTotal?.toFixed(1) || '-'}</span>
          <span>Matches: ${team.matchesPlayed || 0}</span>
        </div>
      </div>
    `;
  });

  html += '</div>';
  container.innerHTML = html;
}


// =============================================================================
// LEADERBOARD
// =============================================================================

/**
 * LOAD LEADERBOARD
 * ----------------
 * Loads and displays the top teams by average score.
 */
async function loadLeaderboard() {
  const container = document.getElementById('leaderboard');

  if (!container) {
    console.log('⚠️ No leaderboard container found');
    return;
  }

  try {
    container.innerHTML = '<p class="loading">Loading leaderboard...</p>';

    const topTeams = await readTopTeams(20);

    if (topTeams.length === 0) {
      container.innerHTML = '<p class="no-data">No team data available yet. Start scouting to see rankings!</p>';
      return;
    }

    let html = `
      <table class="data-table leaderboard-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Team</th>
            <th>Avg Total</th>
            <th>Avg Auto</th>
            <th>Avg Teleop</th>
            <th>Matches</th>
            <th>Best</th>
          </tr>
        </thead>
        <tbody>
    `;

    topTeams.forEach((team, index) => {
      let rankDisplay = `#${index + 1}`;
      if (index === 0) rankDisplay = '🥇';
      else if (index === 1) rankDisplay = '🥈';
      else if (index === 2) rankDisplay = '🥉';

      html += `
        <tr class="${index < 3 ? 'top-three' : ''}" onclick="showTeamDetails(${team.teamNumber})" style="cursor: pointer;">
          <td>${rankDisplay}</td>
          <td><strong>${team.teamNumber}</strong></td>
          <td>${team.avgTotal?.toFixed(1) || '-'}</td>
          <td>${team.avgAuto?.toFixed(1) || '-'}</td>
          <td>${team.avgTeleop?.toFixed(1) || '-'}</td>
          <td>${team.matchesPlayed || '-'}</td>
          <td>${team.maxScore || '-'}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    console.log('✅ Leaderboard loaded with', topTeams.length, 'teams');

  } catch (error) {
    console.error('❌ Error loading leaderboard:', error);
    container.innerHTML = '<p class="error">Error loading leaderboard.</p>';
  }
}


// =============================================================================
// TEAM DETAILS
// =============================================================================

/**
 * SHOW TEAM DETAILS
 * -----------------
 * Shows detailed statistics and match history for a specific team.
 * This is called when clicking on a team in search results or leaderboard.
 */
window.showTeamDetails = async function(teamNumber) {
  const modal = document.getElementById('teamModal');
  const content = document.getElementById('teamModalContent');

  if (!modal || !content) {
    console.log('⚠️ Team modal not found');
    return;
  }

  try {
    // Show modal with loading state
    modal.style.display = 'flex';
    content.innerHTML = '<p class="loading">Loading team data...</p>';

    // Fetch team stats and scouting entries in parallel
    const [stats, scoutingData] = await Promise.all([
      getTeamStats(teamNumber),
      getTeamScoutingData(teamNumber)
    ]);

    // Build the modal content
    let html = `
      <div class="team-detail-header">
        <h2>Team ${teamNumber}</h2>
        <button class="close-btn" onclick="closeTeamModal()">×</button>
      </div>
    `;

    // Stats section
    if (stats) {
      html += `
        <div class="team-stats-grid">
          <div class="stat-card">
            <div class="stat-value">${stats.matchesPlayed || 0}</div>
            <div class="stat-label">Matches</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.avgTotal?.toFixed(1) || '-'}</div>
            <div class="stat-label">Avg Total</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.avgAuto?.toFixed(1) || '-'}</div>
            <div class="stat-label">Avg Auto</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.avgTeleop?.toFixed(1) || '-'}</div>
            <div class="stat-label">Avg Teleop</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.maxScore || '-'}</div>
            <div class="stat-label">Best Score</div>
          </div>
        </div>
      `;
    } else {
      html += '<p class="no-data">No aggregated stats available for this team.</p>';
    }

    // Match history section
    html += '<h3>Match History</h3>';

    if (scoutingData && scoutingData.length > 0) {
      html += `
        <table class="data-table">
          <thead>
            <tr>
              <th>Match</th>
              <th>Auto</th>
              <th>Teleop</th>
              <th>Total</th>
              <th>Climb</th>
              <th>Scouter</th>
            </tr>
          </thead>
          <tbody>
      `;

      scoutingData.forEach(entry => {
        const autoScore = (entry.autoSpeaker || 0) * 5 + (entry.autoAmp || 0) * 2;
        const teleopScore = (entry.teleopSpeaker || 0) * 2 + (entry.teleopAmp || 0) + (entry.amplifiedScored || 0) * 5;
        const total = autoScore + teleopScore;

        html += `
          <tr>
            <td>${entry.matchNumber || '-'}</td>
            <td>${autoScore}</td>
            <td>${teleopScore}</td>
            <td><strong>${total}</strong></td>
            <td>${entry.climbStatus || '-'}</td>
            <td>${entry.scouterName || '-'}</td>
          </tr>
        `;
      });

      html += '</tbody></table>';
    } else {
      html += '<p class="no-data">No match data available for this team.</p>';
    }

    content.innerHTML = html;

  } catch (error) {
    console.error('❌ Error loading team details:', error);
    content.innerHTML = '<p class="error">Error loading team details.</p>';
  }
};


/**
 * CLOSE TEAM MODAL
 * ----------------
 * Closes the team details modal.
 */
window.closeTeamModal = function() {
  const modal = document.getElementById('teamModal');
  if (modal) {
    modal.style.display = 'none';
  }
};


// =============================================================================
// INITIALIZATION
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Set up search input handler
  const searchInput = document.getElementById('teamSearch');
  if (searchInput) {
    searchInput.addEventListener('input', debouncedSearch);
  }

  // Close modal when clicking outside
  const modal = document.getElementById('teamModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeTeamModal();
      }
    });
  }

  console.log('🏆 Teams module loaded');
});
