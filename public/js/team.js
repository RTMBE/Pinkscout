/**
 * =============================================================================
 * TEAM.JS - Individual Team Statistics Page Handler
 * =============================================================================
 *
 * WHAT IS THIS FILE?
 * Handles the team statistics page functionality:
 * - Loading team-specific scouting data
 * - Displaying team performance metrics
 * - Creating match-by-match performance charts
 *
 * URL PARAMETERS:
 * The page reads ?team=XXX from the URL to determine which team to show.
 * Example: team.html?team=254
 *
 * =============================================================================
 */

// =============================================================================
// IMPORTS
// =============================================================================

import { getTeamScoutingData, getTeamStatsFromStatbotics } from './app.js';
import { requireAuth, signOut, setupAuthListener } from './firebase.js';


// =============================================================================
// GLOBAL VARIABLES
// =============================================================================

let teamPerformanceChart = null;


// =============================================================================
// AUTHENTICATION
// =============================================================================

requireAuth();

setupAuthListener((user) => {
  document.getElementById('userInfo').style.display = 'block';
  document.getElementById('userEmail').textContent = user.email;
  
  // Check if team is in URL
  const urlParams = new URLSearchParams(window.location.search);
  const teamNumber = urlParams.get('team');
  if (teamNumber) {
    document.getElementById('teamSearchInput').value = teamNumber;
    loadTeamData(parseInt(teamNumber));
  }
});

document.getElementById('logoutBtn').addEventListener('click', signOut);


// =============================================================================
// EVENT HANDLERS
// =============================================================================

document.getElementById('searchTeamBtn').addEventListener('click', () => {
  const input = document.getElementById('teamSearchInput');
  const teamNumber = parseInt(input.value);
  if (teamNumber > 0) {
    // Update URL without reloading
    window.history.pushState({}, '', `team.html?team=${teamNumber}`);
    loadTeamData(teamNumber);
  }
});

document.getElementById('teamSearchInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('searchTeamBtn').click();
  }
});


// =============================================================================
// DATA LOADING
// =============================================================================

/**
 * Load and display data for a specific team
 */
async function loadTeamData(teamNumber) {
  try {
    const data = await getTeamScoutingData(teamNumber);

    if (data.length === 0) {
      showNoDataMessage(teamNumber);
      // Still try to load Statbotics data even if we have no scouting data
      loadStatboticsData(teamNumber);
      return;
    }

    // Show all sections
    document.getElementById('teamStatsGrid').style.display = 'grid';
    document.getElementById('performanceSection').style.display = 'block';
    document.getElementById('breakdownSection').style.display = 'block';
    document.getElementById('historySection').style.display = 'block';

    // Update header
    updateTeamHeader(teamNumber, data);

    // Update stats
    updateTeamStats(data);

    // Update breakdown
    updateScoringBreakdown(data);

    // Create chart
    createPerformanceChart(data);

    // Load external Statbotics data (async, don't await)
    loadStatboticsData(teamNumber);
    
    // Display match history
    displayMatchHistory(data);
    
  } catch (error) {
    console.error('Error loading team data:', error);
    showErrorMessage();
  }
}

function showNoDataMessage(teamNumber) {
  document.getElementById('teamTitle').textContent = `Team ${teamNumber}`;
  document.getElementById('teamMeta').textContent = 'No scouting data found for this team.';
  document.getElementById('teamStatsGrid').style.display = 'none';
  document.getElementById('performanceSection').style.display = 'none';
  document.getElementById('breakdownSection').style.display = 'none';
  document.getElementById('historySection').style.display = 'none';
}

function showErrorMessage() {
  document.getElementById('teamMeta').textContent = 'Error loading team data.';
}


// =============================================================================
// DISPLAY FUNCTIONS
// =============================================================================

function updateTeamHeader(teamNumber, data) {
  document.getElementById('teamTitle').textContent = `Team ${teamNumber}`;
  document.getElementById('teamMeta').textContent =
    `${data.length} matches scouted • Last updated: ${new Date(data[0].createdAt).toLocaleDateString()}`;
}

function updateTeamStats(data) {
  // Calculate scores for each match
  const matchScores = data.map(d => {
    const auto = (d.autoSpeaker || 0) * 5 + (d.autoAmp || 0) * 2;
    const teleop = (d.teleopSpeaker || 0) * 2 + (d.teleopAmp || 0) + (d.amplifiedScored || 0) * 5;
    return auto + teleop;
  });

  // Matches scouted
  document.getElementById('teamMatches').textContent = data.length;

  // Average score
  const avgScore = matchScores.reduce((a, b) => a + b, 0) / matchScores.length;
  document.getElementById('teamAvgScore').textContent = avgScore.toFixed(1);

  // Climb rate
  const climbs = data.filter(d => d.climbStatus === 'climbed' || d.climbStatus === 'harmony').length;
  const climbRate = (climbs / data.length * 100).toFixed(0);
  document.getElementById('teamClimbRate').textContent = climbRate + '%';

  // Best match score
  const bestScore = Math.max(...matchScores);
  document.getElementById('teamBestMatch').textContent = bestScore;
}

function updateScoringBreakdown(data) {
  const count = data.length;

  const avgAutoSpeaker = data.reduce((sum, d) => sum + (d.autoSpeaker || 0), 0) / count;
  const avgAutoAmp = data.reduce((sum, d) => sum + (d.autoAmp || 0), 0) / count;
  const avgTeleopSpeaker = data.reduce((sum, d) => sum + (d.teleopSpeaker || 0), 0) / count;
  const avgTeleopAmp = data.reduce((sum, d) => sum + (d.teleopAmp || 0), 0) / count;
  const avgAmplified = data.reduce((sum, d) => sum + (d.amplifiedScored || 0), 0) / count;
  const defenseRate = (data.filter(d => d.playedDefense).length / count * 100).toFixed(0);

  document.getElementById('avgAutoSpeaker').textContent = avgAutoSpeaker.toFixed(1);
  document.getElementById('avgAutoAmp').textContent = avgAutoAmp.toFixed(1);
  document.getElementById('avgTeleopSpeaker').textContent = avgTeleopSpeaker.toFixed(1);
  document.getElementById('avgTeleopAmp').textContent = avgTeleopAmp.toFixed(1);
  document.getElementById('avgAmplified').textContent = avgAmplified.toFixed(1);
  document.getElementById('defenseRate').textContent = defenseRate + '%';
}

function createPerformanceChart(data) {
  const ctx = document.getElementById('teamPerformanceChart').getContext('2d');

  // Sort by match number
  const sortedData = [...data].sort((a, b) => a.matchNumber - b.matchNumber);

  const labels = sortedData.map(d => `M${d.matchNumber}`);
  const autoScores = sortedData.map(d => (d.autoSpeaker || 0) * 5 + (d.autoAmp || 0) * 2);
  const teleopScores = sortedData.map(d =>
    (d.teleopSpeaker || 0) * 2 + (d.teleopAmp || 0) + (d.amplifiedScored || 0) * 5
  );

  if (teamPerformanceChart) teamPerformanceChart.destroy();

  teamPerformanceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Auto Score',
          data: autoScores,
          borderColor: '#e91e63',
          backgroundColor: 'rgba(233, 30, 99, 0.1)',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Teleop Score',
          data: teleopScores,
          borderColor: '#3f51b5',
          backgroundColor: 'rgba(63, 81, 181, 0.1)',
          fill: true,
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } },
      plugins: { legend: { position: 'top' } }
    }
  });
}

function displayMatchHistory(data) {
  const container = document.getElementById('matchHistory');
  const sortedData = [...data].sort((a, b) => b.matchNumber - a.matchNumber);

  let html = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Match</th>
          <th>Alliance</th>
          <th>Auto</th>
          <th>Teleop</th>
          <th>Climb</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
  `;

  sortedData.forEach(entry => {
    const autoScore = (entry.autoSpeaker || 0) * 5 + (entry.autoAmp || 0) * 2;
    const teleopScore = (entry.teleopSpeaker || 0) * 2 + (entry.teleopAmp || 0) + (entry.amplifiedScored || 0) * 5;
    const allianceClass = entry.allianceColor === 'red' ? 'alliance-red' : 'alliance-blue';

    html += `
      <tr>
        <td>${entry.matchNumber || '-'}</td>
        <td class="${allianceClass}">${entry.allianceColor?.toUpperCase() || '-'}</td>
        <td>${autoScore}</td>
        <td>${teleopScore}</td>
        <td>${entry.climbStatus || '-'}</td>
        <td>${entry.notes || '-'}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}


// =============================================================================
// EXTERNAL DATA (STATBOTICS)
// =============================================================================

/**
 * Load and display Statbotics data for a team
 */
async function loadStatboticsData(teamNumber) {
  const section = document.getElementById('statboticsSection');
  const currentYear = new Date().getFullYear();

  try {
    const stats = await getTeamStatsFromStatbotics(teamNumber, currentYear);

    if (!stats) {
      // Try previous year if current year not found
      const prevStats = await getTeamStatsFromStatbotics(teamNumber, currentYear - 1);
      if (!prevStats) {
        section.style.display = 'none';
        return;
      }
      displayStatboticsData(prevStats);
    } else {
      displayStatboticsData(stats);
    }

    section.style.display = 'block';
  } catch (error) {
    console.error('Error loading Statbotics data:', error);
    section.style.display = 'none';
  }
}

function displayStatboticsData(stats) {
  // EPA values
  const epaTotal = stats.epa?.total_points?.mean ?? stats.epa?.norm?.mean;
  const epaAuto = stats.epa?.auto_points?.mean ?? '-';
  const epaTeleop = stats.epa?.teleop_points?.mean ?? '-';
  const epaEndgame = stats.epa?.endgame_points?.mean ?? '-';
  const winRate = stats.record?.season?.winrate ?? stats.wins ?
    ((stats.wins / (stats.wins + stats.losses + stats.ties)) * 100).toFixed(0) : '-';
  const worldRank = stats.epa?.ranks?.total?.rank ?? stats.rank ?? '-';

  document.getElementById('epaTotal').textContent =
    typeof epaTotal === 'number' ? epaTotal.toFixed(1) : epaTotal;
  document.getElementById('epaAuto').textContent =
    typeof epaAuto === 'number' ? epaAuto.toFixed(1) : epaAuto;
  document.getElementById('epaTeleop').textContent =
    typeof epaTeleop === 'number' ? epaTeleop.toFixed(1) : epaTeleop;
  document.getElementById('epaEndgame').textContent =
    typeof epaEndgame === 'number' ? epaEndgame.toFixed(1) : epaEndgame;
  document.getElementById('winRate').textContent =
    winRate !== '-' ? `${winRate}%` : '-';
  document.getElementById('worldRank').textContent =
    typeof worldRank === 'number' ? `#${worldRank}` : worldRank;
}


console.log('🔍 Team page loaded');

