/**
 * =============================================================================
 * TEAMS.JS - Team Search & Analysis
 * =============================================================================
 *
 * PURPOSE:
 * This module handles the Team Search page functionality:
 * 1. Search for any FRC team by team number
 * 2. Fetch Statbotics data (EPA, OPR, DPR, CCWM, record)
 * 3. Fetch internal scouting data from Firestore
 * 4. Calculate combined statistics from both sources
 * 5. Display data in a split-panel layout
 *
 * DATA SOURCES:
 * - Statbotics API: https://api.statbotics.io/v3
 *   Provides: EPA, OPR, DPR, CCWM, win/loss record, rankings
 *
 * - Firestore Scouting Data: scouting/{documentId}
 *   Fields: teamNumber, autoSpeaker, autoAmp, teleopSpeaker, teleopAmp,
 *           amplifiedScored, climbStatus, notes, scouterName, matchNumber
 *
 * COMBINED STATS FORMULA:
 * When both Statbotics and scouting data exist:
 *   Combined Auto Avg = (StatboticsAutoAvg + ScoutingAutoAvg) / 2
 *   Combined Teleop Avg = (StatboticsTeleopAvg + ScoutingTeleopAvg) / 2
 *   Combined Total Avg = (StatboticsTotalAvg + ScoutingTotalAvg) / 2
 *
 * FIRESTORE STRUCTURE:
 * - scouting/{docId}          - Individual match entries
 * - teams/{teamNumber}/stats  - Aggregated team statistics
 *
 * =============================================================================
 */


// =============================================================================
// IMPORTS
// =============================================================================

import {
  getAllScoutingData,
  getTeamScoutingData,
  readTopTeams,
  getTeamStats
} from './app.js';

import { requireAuth, signOut, setupAuthListener, db } from './firebase.js';
import { getStatboticsTeam, getTBATeam } from './externalData.js';


// =============================================================================
// CONSTANTS
// =============================================================================

const CURRENT_YEAR = new Date().getFullYear();

// Scoring point values for 2024/2025 game (modify these for future years)
const SCORING = {
  AUTO_SPEAKER: 5,   // Points per auto speaker note
  AUTO_AMP: 2,       // Points per auto amp note
  TELEOP_SPEAKER: 2, // Points per teleop speaker note
  TELEOP_AMP: 1,     // Points per teleop amp note
  AMPLIFIED: 5       // Points per amplified note
};


// =============================================================================
// AUTHENTICATION SETUP
// =============================================================================

requireAuth();

setupAuthListener(
  (user) => {
    const userInfoEl = document.getElementById('userInfo');
    const userEmailEl = document.getElementById('userEmail');

    if (userInfoEl) userInfoEl.style.display = 'block';
    if (userEmailEl) userEmailEl.textContent = user.email;

    // Load initial data after authentication
    loadInitialData();
  }
);

// Set up logout button
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) logoutBtn.addEventListener('click', signOut);


// =============================================================================
// INITIAL DATA LOADING
// =============================================================================

/**
 * Load initial page data (quick stats, leaderboard)
 * Called after authentication is confirmed
 */
async function loadInitialData() {
  console.log('📊 Loading initial teams page data...');

  try {
    // Load quick stats and leaderboard in parallel
    await Promise.all([
      loadQuickStats(),
      loadLeaderboard()
    ]);
  } catch (error) {
    console.error('Error loading initial data:', error);
  }
}

/**
 * Load quick statistics for the dashboard
 * Shows total matches scouted, teams tracked, average score, top performer
 */
async function loadQuickStats() {
  try {
    const scoutingData = await getAllScoutingData();

    if (!scoutingData || scoutingData.length === 0) {
      // No data yet
      setElementText('totalMatchesScouted', '0');
      setElementText('totalTeamsTracked', '0');
      setElementText('overallAvgScore', '0');
      setElementText('topPerformer', '-');
      return;
    }

    // Total Matches Scouted
    setElementText('totalMatchesScouted', scoutingData.length);

    // Unique Teams Tracked
    const uniqueTeams = [...new Set(scoutingData.map(d => d.teamNumber))];
    setElementText('totalTeamsTracked', uniqueTeams.length);

    // Calculate scores and find averages/top performer
    const teamScores = {};
    let totalScore = 0;

    scoutingData.forEach(d => {
      const score = calculateMatchScore(d);
      totalScore += score;

      if (!teamScores[d.teamNumber]) {
        teamScores[d.teamNumber] = { total: 0, count: 0 };
      }
      teamScores[d.teamNumber].total += score;
      teamScores[d.teamNumber].count++;
    });

    // Overall Average Score
    const avgScore = totalScore / scoutingData.length;
    setElementText('overallAvgScore', avgScore.toFixed(1));

    // Top Performer (team with highest average)
    let topTeam = '-';
    let topAvg = 0;
    for (const [team, data] of Object.entries(teamScores)) {
      const avg = data.total / data.count;
      if (avg > topAvg) {
        topAvg = avg;
        topTeam = team;
      }
    }
    setElementText('topPerformer', topTeam !== '-' ? `#${topTeam}` : '-');

  } catch (error) {
    console.error('Error loading quick stats:', error);
  }
}

/**
 * Calculate total match score from scouting data entry
 * @param {Object} entry - Scouting data entry
 * @returns {number} - Total calculated score
 */
function calculateMatchScore(entry) {
  const autoScore =
    (entry.autoSpeaker || 0) * SCORING.AUTO_SPEAKER +
    (entry.autoAmp || 0) * SCORING.AUTO_AMP;

  const teleopScore =
    (entry.teleopSpeaker || 0) * SCORING.TELEOP_SPEAKER +
    (entry.teleopAmp || 0) * SCORING.TELEOP_AMP +
    (entry.amplifiedScored || 0) * SCORING.AMPLIFIED;

  return autoScore + teleopScore;
}

/**
 * Safely set element text content
 */
function setElementText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}


// =============================================================================
// TEAM SEARCH FUNCTIONALITY
// =============================================================================

/**
 * PERFORM TEAM SEARCH
 * -------------------
 * Main search function that:
 * 1. Fetches Statbotics data (EPA, OPR, DPR, CCWM, record)
 * 2. Fetches TBA data (team name, location)
 * 3. Fetches internal scouting data from Firestore
 * 4. Calculates combined statistics
 * 5. Renders the split-panel UI
 *
 * @param {number} teamNumber - The FRC team number to search
 */
async function performTeamSearch(teamNumber) {
  console.log(`🔍 Searching for team ${teamNumber}...`);

  // Get UI elements
  const resultsContainer = document.getElementById('searchResultsContainer');
  const loadingEl = document.getElementById('searchLoading');
  const errorEl = document.getElementById('searchError');
  const noResultsEl = document.getElementById('noResults');
  const combinedPanel = document.getElementById('combinedStatsPanel');
  const splitPanels = document.getElementById('splitDataPanels');
  const quickStatsSection = document.getElementById('quickStatsSection');
  const leaderboardSection = document.getElementById('leaderboardSection');

  // Validate team number
  if (!teamNumber || teamNumber < 1 || teamNumber > 99999) {
    showSearchError('Please enter a valid team number (1-99999)');
    return;
  }

  // Show loading, hide other sections
  resultsContainer.style.display = 'block';
  loadingEl.style.display = 'flex';
  errorEl.style.display = 'none';
  noResultsEl.style.display = 'none';
  combinedPanel.style.display = 'none';
  splitPanels.style.display = 'none';
  quickStatsSection.style.display = 'none';
  leaderboardSection.style.display = 'none';

  try {
    // =========================================================================
    // FETCH DATA FROM ALL SOURCES IN PARALLEL
    // =========================================================================
    // We use Promise.allSettled to handle partial failures gracefully
    // If Statbotics fails but scouting data exists, we still show scouting

    const [statboticsResult, tbaResult, scoutingResult] = await Promise.allSettled([
      getStatboticsTeam(teamNumber, CURRENT_YEAR),
      getTBATeam(teamNumber),
      getTeamScoutingData(teamNumber)
    ]);

    // Extract data from results
    const statboticsData = statboticsResult.status === 'fulfilled' ? statboticsResult.value : null;
    const tbaData = tbaResult.status === 'fulfilled' ? tbaResult.value : null;
    const scoutingData = scoutingResult.status === 'fulfilled' ? scoutingResult.value : [];

    // Check if we have any data at all
    const hasStatbotics = statboticsData && !statboticsData.error;
    const hasTBA = tbaData && tbaData.team_number;
    const hasScouting = scoutingData && scoutingData.length > 0;

    console.log(`📊 Data found - Statbotics: ${hasStatbotics}, TBA: ${hasTBA}, Scouting: ${hasScouting}`);

    // Hide loading
    loadingEl.style.display = 'none';

    // =========================================================================
    // HANDLE NO DATA CASE
    // =========================================================================
    if (!hasStatbotics && !hasTBA && !hasScouting) {
      noResultsEl.style.display = 'block';
      document.getElementById('noResultsMessage').textContent =
        `No data found for Team ${teamNumber}. This team may not exist or has not competed recently.`;
      return;
    }

    // =========================================================================
    // PROCESS AND DISPLAY DATA
    // =========================================================================

    // Calculate scouting statistics if we have scouting data
    const scoutingStats = hasScouting ? calculateScoutingStats(scoutingData) : null;

    // Render combined stats panel (top half)
    renderCombinedStats(teamNumber, statboticsData, tbaData, scoutingStats, hasStatbotics, hasScouting);

    // Render split panels (bottom half)
    renderSplitPanels(teamNumber, statboticsData, tbaData, scoutingStats, scoutingData, hasStatbotics, hasScouting);

    // Show the panels
    combinedPanel.style.display = 'block';
    splitPanels.style.display = 'flex';

  } catch (error) {
    console.error('❌ Search error:', error);
    loadingEl.style.display = 'none';
    showSearchError(`Error searching for team: ${error.message}`);
  }
}

/**
 * CALCULATE SCOUTING STATISTICS
 * -----------------------------
 * Calculates aggregate statistics from our internal scouting data.
 *
 * @param {Array} scoutingData - Array of scouting entries from Firestore
 * @returns {Object} - Calculated statistics
 */
function calculateScoutingStats(scoutingData) {
  if (!scoutingData || scoutingData.length === 0) return null;

  let totalAuto = 0;
  let totalTeleop = 0;
  let totalScore = 0;
  let maxScore = 0;
  let minScore = Infinity;
  const notes = [];

  scoutingData.forEach(entry => {
    // Calculate auto score for this match
    const autoScore =
      (entry.autoSpeaker || 0) * SCORING.AUTO_SPEAKER +
      (entry.autoAmp || 0) * SCORING.AUTO_AMP;

    // Calculate teleop score for this match
    const teleopScore =
      (entry.teleopSpeaker || 0) * SCORING.TELEOP_SPEAKER +
      (entry.teleopAmp || 0) * SCORING.TELEOP_AMP +
      (entry.amplifiedScored || 0) * SCORING.AMPLIFIED;

    const matchTotal = autoScore + teleopScore;

    totalAuto += autoScore;
    totalTeleop += teleopScore;
    totalScore += matchTotal;
    maxScore = Math.max(maxScore, matchTotal);
    minScore = Math.min(minScore, matchTotal);

    // Collect notes
    if (entry.notes && entry.notes.trim()) {
      notes.push(entry.notes.trim());
    }
  });

  const matchCount = scoutingData.length;

  return {
    matchCount,
    avgAuto: totalAuto / matchCount,
    avgTeleop: totalTeleop / matchCount,
    avgTotal: totalScore / matchCount,
    maxScore,
    minScore: minScore === Infinity ? 0 : minScore,
    notes
  };
}
/**
 * RENDER COMBINED STATS PANEL
 * ---------------------------
 * Renders the top half of the results showing combined/averaged statistics.
 *
 * FORMULA FOR COMBINED STATS:
 * When both Statbotics and scouting data are available:
 *   Combined Auto Avg = (Statbotics_auto_avg + Scouting_avgAuto) / 2
 *   Combined Teleop Avg = (Statbotics_teleop_avg + Scouting_avgTeleop) / 2
 *   Combined Total Avg = (Statbotics_total_avg + Scouting_avgTotal) / 2
 *
 * To modify these formulas in the future:
 * 1. Adjust the weighting (e.g., 0.7 * Statbotics + 0.3 * Scouting)
 * 2. Add additional data sources
 * 3. Apply normalization or confidence factors
 */
function renderCombinedStats(teamNumber, statbotics, tba, scoutingStats, hasStatbotics, hasScouting) {
  const panel = document.getElementById('combinedStatsPanel');
  const subtitle = document.getElementById('combinedStatsSubtitle');

  // Get team name from TBA if available
  const teamName = tba?.nickname || `Team ${teamNumber}`;

  // Update subtitle based on data sources
  if (hasStatbotics && hasScouting) {
    subtitle.textContent = `${teamName} — Combined from Statbotics + Our Scouting Data`;
  } else if (hasStatbotics) {
    subtitle.textContent = `${teamName} — Statbotics Data Only (No scouting data yet)`;
  } else if (hasScouting) {
    subtitle.textContent = `${teamName} — Our Scouting Data Only`;
  }

  // =========================================================================
  // CALCULATE COMBINED STATISTICS
  // =========================================================================
  // Note: Statbotics provides EPA breakdown, but for 2024 game we estimate:
  // - auto_epa = portion of EPA from auto period
  // - teleop_epa = portion of EPA from teleop period

  let combinedAuto, combinedTeleop, combinedTotal, autoSource, teleopSource, totalSource;

  if (hasStatbotics && hasScouting) {
    // Both sources available - calculate average
    // Statbotics uses EPA which is different from raw points
    // For combined view, we prioritize scouting data but show EPA separately
    const sbAvgPoints = statbotics.epa_end || statbotics.epa || 0;

    // Combined formula: average of both sources
    // Note: EPA and raw points are different scales, so we use scouting for point averages
    combinedAuto = scoutingStats.avgAuto;
    combinedTeleop = scoutingStats.avgTeleop;
    combinedTotal = scoutingStats.avgTotal;

    autoSource = 'Scouting';
    teleopSource = 'Scouting';
    totalSource = 'Scouting';
  } else if (hasStatbotics) {
    // Only Statbotics - estimate from EPA
    // EPA is expected points added, not raw points
    const epa = statbotics.epa_end || statbotics.epa || 0;
    combinedAuto = '-';
    combinedTeleop = '-';
    combinedTotal = epa.toFixed(1);

    autoSource = 'No data';
    teleopSource = 'No data';
    totalSource = 'EPA (Statbotics)';
  } else if (hasScouting) {
    // Only scouting data
    combinedAuto = scoutingStats.avgAuto.toFixed(1);
    combinedTeleop = scoutingStats.avgTeleop.toFixed(1);
    combinedTotal = scoutingStats.avgTotal.toFixed(1);

    autoSource = 'Scouting';
    teleopSource = 'Scouting';
    totalSource = 'Scouting';
  }

  // Calculate win rate
  let winRate = '-', winRateSource = '-';
  if (hasStatbotics && statbotics.wins !== undefined) {
    const wins = statbotics.wins || 0;
    const losses = statbotics.losses || 0;
    const ties = statbotics.ties || 0;
    const totalMatches = wins + losses + ties;
    if (totalMatches > 0) {
      winRate = ((wins / totalMatches) * 100).toFixed(0) + '%';
      winRateSource = 'Statbotics';
    }
  }

  // Match count
  let matchCount = '-', matchSource = '-';
  if (hasScouting) {
    matchCount = scoutingStats.matchCount;
    matchSource = 'Scouting';
  } else if (hasStatbotics) {
    const wins = statbotics.wins || 0;
    const losses = statbotics.losses || 0;
    const ties = statbotics.ties || 0;
    matchCount = wins + losses + ties;
    matchSource = 'Statbotics';
  }

  // EPA
  const epa = hasStatbotics ? (statbotics.epa_end || statbotics.epa || 0).toFixed(1) : '-';

  // =========================================================================
  // UPDATE DOM ELEMENTS
  // =========================================================================
  setElementText('combinedAutoAvg', typeof combinedAuto === 'number' ? combinedAuto.toFixed(1) : combinedAuto);
  setElementText('combinedTeleopAvg', typeof combinedTeleop === 'number' ? combinedTeleop.toFixed(1) : combinedTeleop);
  setElementText('combinedTotalAvg', typeof combinedTotal === 'number' ? combinedTotal.toFixed(1) : combinedTotal);
  setElementText('combinedAutoSource', autoSource);
  setElementText('combinedTeleopSource', teleopSource);
  setElementText('combinedTotalSource', totalSource);
  setElementText('combinedEPA', epa);
  setElementText('combinedWinRate', winRate);
  setElementText('combinedWinRateSource', winRateSource);
  setElementText('combinedMatchCount', matchCount);
  setElementText('combinedMatchSource', matchSource);
}

/**
 * RENDER SPLIT PANELS
 * -------------------
 * Renders the bottom half with Statbotics on left, Scouting on right.
 * If scouting data doesn't exist, expand Statbotics to full width.
 */
function renderSplitPanels(teamNumber, statbotics, tba, scoutingStats, scoutingData, hasStatbotics, hasScouting) {
  const splitPanels = document.getElementById('splitDataPanels');
  const statboticsPanel = document.getElementById('statboticsPanel');
  const scoutingPanel = document.getElementById('scoutingPanel');

  // =========================================================================
  // RENDER STATBOTICS PANEL (LEFT)
  // =========================================================================
  const statboticsContent = document.getElementById('statboticsContent');
  const statboticsNoData = document.getElementById('statboticsNoData');

  if (hasStatbotics) {
    statboticsContent.style.display = 'block';
    statboticsNoData.style.display = 'none';

    // Year display
    setElementText('statboticsYear', CURRENT_YEAR);

    // Team info from TBA
    setElementText('statboticsTeamName', tba?.nickname || `Team ${teamNumber}`);
    setElementText('statboticsTeamLocation', tba ? `${tba.city || ''}, ${tba.state_prov || ''}` : '');

    // Stats
    const epa = statbotics.epa_end || statbotics.epa || 0;
    const epaRank = statbotics.epa_rank || statbotics.total_epa_rank || '-';
    const opr = statbotics.opr || '-';
    const dpr = statbotics.dpr || '-';
    const ccwm = statbotics.ccwm || '-';
    const wins = statbotics.wins || 0;
    const losses = statbotics.losses || 0;
    const ties = statbotics.ties || 0;
    const totalMatches = wins + losses + ties;
    const winRate = totalMatches > 0 ? ((wins / totalMatches) * 100).toFixed(0) + '%' : '-';

    setElementText('sbEPA', typeof epa === 'number' ? epa.toFixed(1) : epa);
    setElementText('sbEPARank', typeof epaRank === 'number' ? `#${epaRank}` : epaRank);
    setElementText('sbOPR', typeof opr === 'number' ? opr.toFixed(1) : opr);
    setElementText('sbDPR', typeof dpr === 'number' ? dpr.toFixed(1) : dpr);
    setElementText('sbCCWM', typeof ccwm === 'number' ? ccwm.toFixed(1) : ccwm);
    setElementText('sbRecord', `${wins}-${losses}-${ties}`);
    setElementText('sbWinRate', winRate);
    setElementText('sbAvgPoints', statbotics.epa_end ? statbotics.epa_end.toFixed(1) : '-');

  } else {
    statboticsContent.style.display = 'none';
    statboticsNoData.style.display = 'block';
  }

  // =========================================================================
  // RENDER SCOUTING PANEL (RIGHT)
  // =========================================================================
  const scoutingContent = document.getElementById('scoutingContent');
  const scoutingNoData = document.getElementById('scoutingNoData');

  if (hasScouting) {
    scoutingContent.style.display = 'block';
    scoutingNoData.style.display = 'none';

    // Match count in header
    setElementText('scoutingMatchCount', `${scoutingStats.matchCount} matches`);

    // Stats
    setElementText('scAutoAvg', scoutingStats.avgAuto.toFixed(1));
    setElementText('scTeleopAvg', scoutingStats.avgTeleop.toFixed(1));
    setElementText('scTotalAvg', scoutingStats.avgTotal.toFixed(1));
    setElementText('scMaxScore', scoutingStats.maxScore);
    setElementText('scMinScore', scoutingStats.minScore);
    setElementText('scMatchCount', scoutingStats.matchCount);

    // Notes
    const notesContainer = document.getElementById('scoutingNotes');
    if (scoutingStats.notes && scoutingStats.notes.length > 0) {
      // Show up to 5 most recent notes
      const recentNotes = scoutingStats.notes.slice(-5).reverse();
      notesContainer.innerHTML = recentNotes.map(note =>
        `<div class="note-item">${escapeHtml(note)}</div>`
      ).join('');
    } else {
      notesContainer.innerHTML = '<p class="no-notes">No notes recorded yet.</p>';
    }

  } else {
    scoutingContent.style.display = 'none';
    scoutingNoData.style.display = 'block';
    setElementText('scoutingMatchCount', '0 matches');

    // If no scouting data, expand Statbotics panel
    if (hasStatbotics) {
      statboticsPanel.classList.add('expanded');
      scoutingPanel.classList.add('collapsed');
    }
  }
}

/**
 * Show search error message
 */
function showSearchError(message) {
  const errorEl = document.getElementById('searchError');
  const errorMsg = document.getElementById('searchErrorMessage');
  const loadingEl = document.getElementById('searchLoading');

  if (loadingEl) loadingEl.style.display = 'none';
  if (errorMsg) errorMsg.textContent = message;
  if (errorEl) errorEl.style.display = 'block';
}

/**
 * Clear search and reset to initial state
 */
window.clearSearch = function() {
  const input = document.getElementById('teamSearchInput');
  const resultsContainer = document.getElementById('searchResultsContainer');
  const quickStatsSection = document.getElementById('quickStatsSection');
  const leaderboardSection = document.getElementById('leaderboardSection');

  if (input) input.value = '';
  if (resultsContainer) resultsContainer.style.display = 'none';
  if (quickStatsSection) quickStatsSection.style.display = 'block';
  if (leaderboardSection) leaderboardSection.style.display = 'block';
};

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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
  console.log('🏆 Initializing Teams page...');

  // =========================================================================
  // SEARCH INPUT HANDLERS
  // =========================================================================
  const searchInput = document.getElementById('teamSearchInput');
  const searchBtn = document.getElementById('searchBtn');

  // Handle search button click
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      const teamNumber = parseInt(searchInput?.value.trim(), 10);
      if (teamNumber) {
        performTeamSearch(teamNumber);
      }
    });
  }

  // Handle Enter key in search input
  if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const teamNumber = parseInt(searchInput.value.trim(), 10);
        if (teamNumber) {
          performTeamSearch(teamNumber);
        }
      }
    });
  }

  console.log('✅ Teams page initialized');
});
