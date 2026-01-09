/**
 * =============================================================================
 * TEAMS.JS - Team Search & Statistics with EPA Classification
 * =============================================================================
 *
 * WHAT IS THIS FILE?
 * Handles team search functionality with data from two sources:
 * 1. Statbotics API - External FRC statistics (EPA, rankings)
 * 2. Firestore - Local scouting data from your team
 *
 * FEATURES:
 * - Search any FRC team by number
 * - Fetch and display Statbotics data with EPA classification
 * - Query local scouting entries
 * - Combine and analyze both data sources
 * - Display match history
 * - EPA Classification: Elite / Top Tier / Normal / Below Average
 *
 * LAYOUT:
 * ┌─────────────────────────────────────┐
 * │     Combined Stats (Top Half)       │
 * │   EPA Classification Badge + Info   │
 * ├──────────────────┬──────────────────┤
 * │   Statbotics     │   Scouting       │
 * │   (Left Pane)    │   (Right Pane)   │
 * └──────────────────┴──────────────────┘
 *
 * EPA CLASSIFICATION THRESHOLDS:
 * - Elite: >= 90th percentile (top 10%)
 * - Top Tier: >= 65th percentile (next 25%)
 * - Normal: >= 20th percentile (middle 45%)
 * - Below Average: < 20th percentile (bottom 20%)
 *
 * =============================================================================
 */

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
  collection, query, where, getDocs, orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  signOutUser,
  getStatboticsData,
  getTeamScoutingData,
  classifyEPA,
  getEPAPercentile,
  scaleStatboticsEPA,
  getBlueAllianceTeamInfo
} from './app.js';

// =============================================================================
// DOM REFERENCES
// =============================================================================
const userInfo = document.getElementById('userInfo');
const userEmail = document.getElementById('userEmail');
const logoutBtn = document.getElementById('logoutBtn');
const searchForm = document.getElementById('teamSearchForm');
const searchInput = document.getElementById('teamSearchInput');
const resultsContainer = document.getElementById('resultsContainer');
const noResults = document.getElementById('noResults');
const noResultsMessage = document.getElementById('noResultsMessage');

// Team display elements
const teamHeader = document.getElementById('teamHeader');
const teamName = document.getElementById('teamName');
const teamNumber = document.getElementById('teamNumber');
const teamLocation = document.getElementById('teamLocation');
const classificationBadge = document.getElementById('classificationBadge');
const combinedStatsSection = document.getElementById('combinedStatsSection');
const statboticsPane = document.getElementById('statboticsPane');
const scoutingPane = document.getElementById('scoutingPane');
const statboticsData = document.getElementById('statboticsData');
const scoutingData = document.getElementById('scoutingData');
const matchHistory = document.getElementById('matchHistory');

// Track current search data for UI updates
let currentStatboticsData = null;
let currentScoutingData = [];

// =============================================================================
// AUTH STATE
// =============================================================================
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  userInfo.style.display = 'block';
  userEmail.textContent = user.email;
});

logoutBtn.addEventListener('click', signOutUser);

// =============================================================================
// SEARCH HANDLER
// =============================================================================
searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const teamNum = searchInput.value.trim();
  
  if (!teamNum || !/^\d+$/.test(teamNum)) {
    showNoResults('Please enter a valid team number');
    return;
  }
  
  await searchTeam(teamNum);
});

// =============================================================================
// SEARCH TEAM FUNCTION
// =============================================================================
/**
 * Main search function - fetches and displays all team data
 *
 * @param {string} teamNum - The FRC team number to search
 */
async function searchTeam(teamNum) {
  console.log('🔍 Searching for team:', teamNum);

  // Show loading state
  resultsContainer.style.display = 'block';
  noResults.style.display = 'none';

  // Show loading spinners
  if (statboticsData) statboticsData.innerHTML = '<div class="loading-spinner"></div>';
  if (scoutingData) scoutingData.innerHTML = '<div class="loading-spinner"></div>';
  if (combinedStatsSection) combinedStatsSection.innerHTML = '<div class="loading-spinner"></div>';

  // Fetch data from both sources in parallel
  // Also fetch TBA data for additional team info
  const [statbotics, scouting, tbaInfo] = await Promise.all([
    fetchStatboticsData(teamNum),
    fetchLocalData(teamNum),
    getBlueAllianceTeamInfo(teamNum).catch(() => null)
  ]);

  // Store for later use
  currentStatboticsData = statbotics;
  currentScoutingData = scouting || [];

  // Check if we have any data
  if (!statbotics && currentScoutingData.length === 0) {
    showNoResults(`No data found for team ${teamNum}`);
    return;
  }

  // Update team header with EPA classification
  renderTeamHeader(teamNum, statbotics, tbaInfo);

  // Render combined stats section (top half)
  renderCombinedStatsSection(statbotics, currentScoutingData);

  // Render split panes (bottom half)
  renderStatboticsPane(statbotics);
  renderScoutingPane(currentScoutingData);

  // Handle layout: if no scouting data, Statbotics fills entire bottom
  if (currentScoutingData.length === 0 && scoutingPane) {
    scoutingPane.style.display = 'none';
    if (statboticsPane) statboticsPane.classList.add('full-width');
  } else if (scoutingPane) {
    scoutingPane.style.display = 'block';
    if (statboticsPane) statboticsPane.classList.remove('full-width');
  }

  // Render match history
  renderMatchHistory(currentScoutingData);
}

/**
 * Render the team header with classification badge
 */
function renderTeamHeader(teamNum, statbotics, tbaInfo) {
  // Get team name from either source
  const name = statbotics?.name || tbaInfo?.nickname || `Team ${teamNum}`;

  // Build location string
  let location = 'Location unknown';
  if (statbotics) {
    location = [statbotics.city, statbotics.state, statbotics.country]
      .filter(Boolean).join(', ') || 'Location unknown';
  } else if (tbaInfo) {
    location = [tbaInfo.city, tbaInfo.state_prov, tbaInfo.country]
      .filter(Boolean).join(', ') || 'Location unknown';
  }

  // Update header elements
  if (teamName) teamName.textContent = name;
  if (teamNumber) teamNumber.textContent = `#${teamNum}`;
  if (teamLocation) teamLocation.textContent = location;

  // Add classification badge
  if (classificationBadge && statbotics) {
    const epaPercentile = getEPAPercentile(statbotics);
    const classification = classifyEPA(epaPercentile);

    classificationBadge.innerHTML = `
      <span class="classification-badge" style="background-color: ${classification.color}">
        ${classification.emoji} ${classification.classification}
      </span>
      <span class="classification-desc">${classification.description}</span>
    `;
    classificationBadge.style.display = 'block';
  } else if (classificationBadge) {
    classificationBadge.innerHTML = '';
    classificationBadge.style.display = 'none';
  }
}

// =============================================================================
// FETCH STATBOTICS DATA
// =============================================================================
async function fetchStatboticsData(teamNum) {
  try {
    const response = await fetch(`https://api.statbotics.io/v3/team/${teamNum}`);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Statbotics error:', error);
    return null;
  }
}

// =============================================================================
// FETCH LOCAL SCOUTING DATA
// =============================================================================
async function fetchLocalData(teamNum) {
  try {
    return await getTeamScoutingData(teamNum);
  } catch (error) {
    console.error('Local data error:', error);
    return [];
  }
}

// =============================================================================
// RENDER COMBINED STATS SECTION (Top Half)
// =============================================================================
/**
 * Renders the combined stats section at the top
 * Shows EPA classification, key metrics, and data source status
 */
function renderCombinedStatsSection(statbotics, scouting) {
  if (!combinedStatsSection) return;

  const hasStatbotics = !!statbotics;
  const hasScouting = scouting && scouting.length > 0;

  if (!hasStatbotics && !hasScouting) {
    combinedStatsSection.innerHTML = '<p class="no-data">No data available</p>';
    return;
  }

  let html = '<div class="combined-stats-grid">';

  // EPA Score Card (if Statbotics available)
  if (hasStatbotics) {
    const epaPercentile = getEPAPercentile(statbotics);
    const actualEPA = scaleStatboticsEPA(statbotics);
    const classification = classifyEPA(epaPercentile);
    const yearLabel = statbotics.currentYear ? ` (${statbotics.currentYear})` : '';

    html += `
      <div class="stat-card epa-card" style="border-left: 4px solid ${classification.color}">
        <div class="stat-card-header">
          <span class="stat-icon">📊</span>
          <span class="stat-title">EPA Rating${yearLabel}</span>
        </div>
        <div class="stat-card-value">${actualEPA.toFixed(1)}</div>
        <div class="stat-card-sub">
          Percentile: ${epaPercentile.toFixed(0)}%
          <span class="classification-mini" style="color: ${classification.color}">
            ${classification.emoji} ${classification.classification}
          </span>
        </div>
      </div>
    `;

    // Record Card (current year)
    const wins = statbotics.record?.wins || 0;
    const losses = statbotics.record?.losses || 0;
    const ties = statbotics.record?.ties || 0;
    const winRate = (wins + losses + ties) > 0
      ? ((wins / (wins + losses + ties)) * 100).toFixed(0)
      : 'N/A';

    html += `
      <div class="stat-card">
        <div class="stat-card-header">
          <span class="stat-icon">🏆</span>
          <span class="stat-title">Record${yearLabel}</span>
        </div>
        <div class="stat-card-value">${wins}-${losses}-${ties}</div>
        <div class="stat-card-sub">Win Rate: ${winRate}%</div>
      </div>
    `;
  }

  // Scouting Summary Card (if scouting data available)
  if (hasScouting) {
    const count = scouting.length;
    // Calculate points from actual scouting fields
    const avgAuto = scouting.reduce((sum, d) => sum + calculateAutoPoints(d), 0) / count;
    const avgTeleop = scouting.reduce((sum, d) => sum + calculateTeleopPoints(d), 0) / count;
    const avgTotal = avgAuto + avgTeleop;

    html += `
      <div class="stat-card scouting-card">
        <div class="stat-card-header">
          <span class="stat-icon">📋</span>
          <span class="stat-title">Your Scouting</span>
        </div>
        <div class="stat-card-value">${avgTotal.toFixed(1)} pts</div>
        <div class="stat-card-sub">${count} matches scouted</div>
      </div>
    `;
  } else {
    // No scouting data message
    html += `
      <div class="stat-card no-scouting-card">
        <div class="stat-card-header">
          <span class="stat-icon">📋</span>
          <span class="stat-title">Your Scouting</span>
        </div>
        <div class="stat-card-message">
          No scouting data yet
          <a href="newscounting.html" class="btn btn-sm btn-primary">Scout Team</a>
        </div>
      </div>
    `;
  }

  html += '</div>';

  // Data sources indicator
  html += `
    <div class="data-sources">
      <span class="source ${hasStatbotics ? 'active' : 'inactive'}">
        ${hasStatbotics ? '✓' : '✗'} Statbotics
      </span>
      <span class="source ${hasScouting ? 'active' : 'inactive'}">
        ${hasScouting ? '✓' : '✗'} Scouting Data
      </span>
    </div>
  `;

  combinedStatsSection.innerHTML = html;
}

// =============================================================================
// RENDER STATBOTICS PANE (Left Side)
// =============================================================================
/**
 * Renders the Statbotics data pane
 */
function renderStatboticsPane(data) {
  if (!statboticsData) return;

  if (!data) {
    statboticsData.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <p>No Statbotics data available for this team</p>
        <p class="empty-sub">Team may be new or not registered</p>
      </div>
    `;
    return;
  }

  // Extract all relevant stats
  const epaPercentile = getEPAPercentile(data);
  const actualEPA = scaleStatboticsEPA(data);
  const classification = classifyEPA(epaPercentile);
  const wins = data.record?.wins || 0;
  const losses = data.record?.losses || 0;
  const ties = data.record?.ties || 0;
  const rank = data.norm_epa?.rank || 'N/A';
  const yearLabel = data.currentYear ? ` (${data.currentYear})` : '';

  statboticsData.innerHTML = `
    <div class="stats-grid">
      <div class="stat-box highlight" style="border-color: ${classification.color}">
        <span class="stat-value">${actualEPA.toFixed(1)}</span>
        <span class="stat-label">EPA${yearLabel}</span>
      </div>
      <div class="stat-box">
        <span class="stat-value">${epaPercentile.toFixed(0)}%</span>
        <span class="stat-label">Percentile</span>
      </div>
      <div class="stat-box">
        <span class="stat-value">${rank}</span>
        <span class="stat-label">Rank${yearLabel}</span>
      </div>
      <div class="stat-box">
        <span class="stat-value">${wins}-${losses}-${ties}</span>
        <span class="stat-label">Record${yearLabel}</span>
      </div>
      <div class="stat-box">
        <span class="stat-value">${data.rookie_year || 'N/A'}</span>
        <span class="stat-label">Rookie Year</span>
      </div>
      <div class="stat-box">
        <span class="stat-value">${data.team || 'N/A'}</span>
        <span class="stat-label">Team Number</span>
      </div>
    </div>

    <div class="epa-explanation">
      <h4>📈 EPA Explained</h4>
      <p>
        <strong>EPA (Expected Points Added)</strong> measures how many points
        a team contributes per match. Higher = better.
      </p>
      <p>
        Classification: <strong style="color: ${classification.color}">
          ${classification.emoji} ${classification.classification}
        </strong> - ${classification.description}
      </p>
    </div>
  `;
}

// =============================================================================
// RENDER SCOUTING PANE (Right Side)
// =============================================================================
/**
 * Renders the local scouting data pane
 */
function renderScoutingPane(data) {
  if (!scoutingData) return;

  if (!data || data.length === 0) {
    scoutingData.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <p>No scouting data for this team yet</p>
        <a href="newscounting.html" class="btn btn-primary">Scout This Team</a>
      </div>
    `;
    return;
  }

  // Calculate statistics using actual scouting fields
  const count = data.length;
  const avgAuto = data.reduce((sum, d) => sum + calculateAutoPoints(d), 0) / count;
  const avgTeleop = data.reduce((sum, d) => sum + calculateTeleopPoints(d), 0) / count;
  const avgTotal = avgAuto + avgTeleop;
  const consistency = calculateConsistency(data);

  // Find best and worst matches
  const scores = data.map(d => ({
    match: d.matchNumber,
    total: calculateAutoPoints(d) + calculateTeleopPoints(d)
  }));
  scores.sort((a, b) => b.total - a.total);
  const best = scores[0];
  const worst = scores[scores.length - 1];

  scoutingData.innerHTML = `
    <div class="stats-grid">
      <div class="stat-box highlight">
        <span class="stat-value">${count}</span>
        <span class="stat-label">Matches Scouted</span>
      </div>
      <div class="stat-box">
        <span class="stat-value">${avgTotal.toFixed(1)}</span>
        <span class="stat-label">Avg Total</span>
      </div>
      <div class="stat-box">
        <span class="stat-value">${avgAuto.toFixed(1)}</span>
        <span class="stat-label">Avg Auto</span>
      </div>
      <div class="stat-box">
        <span class="stat-value">${avgTeleop.toFixed(1)}</span>
        <span class="stat-label">Avg Teleop</span>
      </div>
      <div class="stat-box">
        <span class="stat-value">${best.total}</span>
        <span class="stat-label">Best Match</span>
      </div>
      <div class="stat-box">
        <span class="stat-value">${consistency}</span>
        <span class="stat-label">Consistency</span>
      </div>
    </div>

    <div class="scouting-notes">
      <h4>📊 Performance Summary</h4>
      <ul>
        <li>Best performance: <strong>Match ${best.match || 'N/A'}</strong> (${best.total} pts)</li>
        <li>Lowest performance: <strong>Match ${worst.match || 'N/A'}</strong> (${worst.total} pts)</li>
        <li>Consistency rating: <strong>${consistency}</strong></li>
      </ul>
    </div>
  `;
}

/**
 * Calculate auto points from scouting entry
 * 2024 game: Speaker = 5pts, Amp = 2pts, Mobility = 2pts
 */
function calculateAutoPoints(entry) {
  if (!entry) return 0;
  const speaker = (entry.autoSpeaker || 0) * 5;
  const amp = (entry.autoAmp || 0) * 2;
  const mobility = entry.autoMobility ? 2 : 0;
  return speaker + amp + mobility;
}

/**
 * Calculate teleop points from scouting entry
 * 2024 game: Speaker = 2pts, Amp = 1pt, Amplified = 5pts
 */
function calculateTeleopPoints(entry) {
  if (!entry) return 0;
  const speaker = (entry.teleopSpeaker || 0) * 2;
  const amp = (entry.teleopAmp || 0) * 1;
  const amplified = (entry.amplifiedScored || 0) * 5;
  return speaker + amp + amplified;
}

/**
 * Calculate consistency rating based on score variance
 */
function calculateConsistency(data) {
  if (data.length < 2) return 'N/A';

  const scores = data.map(d => calculateAutoPoints(d) + calculateTeleopPoints(d));
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg === 0) return 'N/A';

  const variance = scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  const cv = (stdDev / avg) * 100; // Coefficient of variation

  if (cv < 15) return 'Very Consistent';
  if (cv < 30) return 'Consistent';
  if (cv < 50) return 'Variable';
  return 'Inconsistent';
}

// =============================================================================
// RENDER MATCH HISTORY
// =============================================================================
/**
 * Renders the match history table
 */
function renderMatchHistory(data) {
  if (!matchHistory) return;

  if (!data || data.length === 0) {
    matchHistory.innerHTML = `
      <div class="empty-state small">
        <p>No match history available</p>
      </div>
    `;
    return;
  }

  // Sort by match number (most recent first)
  const sorted = [...data].sort((a, b) => {
    const matchA = parseInt(a.matchNumber) || 0;
    const matchB = parseInt(b.matchNumber) || 0;
    return matchB - matchA;
  });

  matchHistory.innerHTML = `
    <table class="data-table match-history-table">
      <thead>
        <tr>
          <th>Match</th>
          <th>Auto</th>
          <th>Teleop</th>
          <th>Total</th>
          <th>Scouter</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map(entry => {
          const autoPoints = calculateAutoPoints(entry);
          const teleopPoints = calculateTeleopPoints(entry);
          const total = autoPoints + teleopPoints;
          const date = entry.timestamp?.toDate?.()
            ? entry.timestamp.toDate().toLocaleDateString()
            : 'N/A';
          return `
            <tr>
              <td><strong>${entry.matchNumber || 'N/A'}</strong></td>
              <td>${autoPoints}</td>
              <td>${teleopPoints}</td>
              <td class="total-cell">${total}</td>
              <td>${entry.scouterName || 'Unknown'}</td>
              <td class="date-cell">${date}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

// =============================================================================
// SHOW NO RESULTS
// =============================================================================
/**
 * Shows the no results message
 */
function showNoResults(message) {
  if (resultsContainer) resultsContainer.style.display = 'none';
  if (noResults) noResults.style.display = 'block';
  if (noResultsMessage) noResultsMessage.textContent = message;
}

// =============================================================================
// INITIALIZATION
// =============================================================================
console.log('🔍 Teams page loaded with EPA classification support');
console.log('📊 EPA Classification Thresholds:');
console.log('   - Elite: >= 90th percentile');
console.log('   - Top Tier: >= 65th percentile');
console.log('   - Normal: >= 20th percentile');
console.log('   - Below Average: < 20th percentile');
