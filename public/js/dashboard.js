/**
 * =============================================================================
 * DASHBOARD.JS - Dashboard Data Display and Charts
 * =============================================================================
 *
 * WHAT IS THIS FILE?
 * This file handles the dashboard page functionality:
 * - Loading scouting data from Firestore
 * - Computing statistics (totals, averages, top teams)
 * - Creating interactive charts with Chart.js
 * - Displaying recent scouting entries in a table
 *
 * WHAT IS CHART.JS?
 * Chart.js is a popular JavaScript library for creating charts.
 * It's loaded via CDN in the HTML file:
 * <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
 *
 * CHART TYPES USED:
 * - Doughnut chart: Shows scoring distribution (pie chart with hole)
 * - Bar chart: Compares team performance
 *
 * =============================================================================
 */


// =============================================================================
// IMPORTS
// =============================================================================

// Import data fetching functions from app.js
import {
  getAllScoutingData,
  getScoutingDataByEvent,
  getAllEvents,
  getCurrentEvent,
  setCurrentEvent
} from './app.js';

// Import authentication functions from firebase.js
import { requireAuth, signOut, setupAuthListener } from './firebase.js';


// =============================================================================
// GLOBAL VARIABLES
// =============================================================================
//
// We store chart instances globally so we can update or destroy them later.
// If we create a new chart without destroying the old one, we get errors.
//
// =============================================================================

let scoringChart = null;      // Doughnut chart instance
let performanceChart = null;  // Bar chart instance


// =============================================================================
// AUTHENTICATION SETUP
// =============================================================================
//
// The dashboard requires authentication. If the user isn't logged in,
// they'll be redirected to the login page.
//
// =============================================================================

// Check if user is authenticated (redirects to login if not)
requireAuth();

// Set up listener for auth state changes
// When user is confirmed logged in, show their email and load data
setupAuthListener(
  (user) => {
    // User is signed in - show user info in sidebar
    document.getElementById('userInfo').style.display = 'block';
    document.getElementById('userEmail').textContent = user.email;

    // Now that we know user is authenticated, load the dashboard data
    loadDashboardData();
  }
);

// Set up logout button click handler
document.getElementById('logoutBtn').addEventListener('click', signOut);


// =============================================================================
// DATA LOADING
// =============================================================================

/**
 * LOAD DASHBOARD DATA
 * -------------------
 * Main function that loads all data and updates the dashboard.
 *
 * FLOW:
 * 1. Check if an event is selected
 * 2. Fetch scouting data (filtered by event if selected)
 * 3. If no data, show a helpful message
 * 4. If data exists:
 *    - Update statistics cards
 *    - Create/update charts
 *    - Display recent entries table
 *    - Display top 10 teams
 */
async function loadDashboardData() {
  try {
    // Update the event selector first
    await updateEventSelector();

    // Get current event (if any)
    const currentEvent = getCurrentEvent();
    let scoutingData;

    // Fetch data - either for specific event or all data
    if (currentEvent && currentEvent.id) {
      scoutingData = await getScoutingDataByEvent(currentEvent.id);
      updateEventDisplay(currentEvent.name);
    } else {
      scoutingData = await getAllScoutingData();
      updateEventDisplay('All Events');
    }

    // Check if we have any data
    if (scoutingData.length === 0) {
      showNoDataMessage();
      return;
    }

    // Update the statistics cards at the top
    updateStats(scoutingData);

    // Create the charts
    createScoringChart(scoutingData);
    createPerformanceChart(scoutingData);

    // Display the top 10 teams
    displayTop10Teams(scoutingData);

    // Display the recent entries table
    displayRecentEntries(scoutingData);

  } catch (error) {
    // Handle errors (usually Firebase configuration issues)
    console.error('Error loading dashboard data:', error);
    document.getElementById('recentEntries').innerHTML =
      '<p class="text-center" style="color: #c62828; padding: 20px;">Error loading data. Please check your Firebase configuration.</p>';
  }
}


/**
 * UPDATE EVENT SELECTOR
 * ---------------------
 * Loads available events and populates the event dropdown.
 */
async function updateEventSelector() {
  const eventSelect = document.getElementById('eventFilter');
  if (!eventSelect) return;

  try {
    const events = await getAllEvents();
    const currentEvent = getCurrentEvent();

    // Build options HTML
    let optionsHtml = '<option value="">All Events</option>';
    events.forEach(event => {
      const selected = currentEvent && currentEvent.id === event.id ? 'selected' : '';
      optionsHtml += `<option value="${event.id}" ${selected}>${event.name}</option>`;
    });

    eventSelect.innerHTML = optionsHtml;
  } catch (error) {
    console.error('Error loading events:', error);
  }
}


/**
 * UPDATE EVENT DISPLAY
 * --------------------
 * Updates the current event display in the header.
 */
function updateEventDisplay(eventName) {
  const display = document.getElementById('currentEventDisplay');
  if (display) {
    display.textContent = eventName;
  }
}


/**
 * HANDLE EVENT FILTER CHANGE
 * --------------------------
 * Called when user selects a different event.
 */
async function handleEventFilterChange(event) {
  const eventId = event.target.value;

  if (eventId) {
    // Find the selected event
    const events = await getAllEvents();
    const selectedEvent = events.find(e => e.id === eventId);
    if (selectedEvent) {
      setCurrentEvent(selectedEvent);
    }
  } else {
    // Clear event filter (show all events)
    localStorage.removeItem('pinkscout_current_event');
  }

  // Reload dashboard with new filter
  loadDashboardData();
}


/**
 * SHOW NO DATA MESSAGE
 * --------------------
 * Displays a helpful message when there's no scouting data yet.
 */
function showNoDataMessage() {
  document.getElementById('recentEntries').innerHTML =
    '<p class="text-center" style="color: #888; padding: 20px;">No scouting data available yet. <a href="newscounting.html">Start scouting</a> to see data here.</p>';

  // Also clear the top 10 section
  const top10Container = document.getElementById('top10Teams');
  if (top10Container) {
    top10Container.innerHTML = '<p class="text-center" style="color: #888;">No team data yet.</p>';
  }
}


// =============================================================================
// STATISTICS CALCULATION
// =============================================================================

/**
 * UPDATE STATS
 * ------------
 * Calculates and displays statistics in the stat cards.
 *
 * STATISTICS CALCULATED:
 * 1. Total Matches: Count of all scouting entries
 * 2. Total Teams: Count of unique team numbers
 * 3. Average Score: Mean score across all entries
 * 4. Top Team: Team with highest average score
 *
 * SCORING FORMULA (based on 2024 FRC game):
 * - Auto Speaker: 5 points each
 * - Auto Amp: 2 points each
 * - Teleop Speaker: 2 points each
 * - Teleop Amp: 1 point each
 * - Amplified: 5 points each
 *
 * @param {Array} data - Array of scouting records
 */
function updateStats(data) {
  // =========================================
  // STAT 1: Total Matches Scouted
  // =========================================
  document.getElementById('totalMatches').textContent = data.length;

  // =========================================
  // STAT 2: Unique Teams Tracked
  // =========================================
  // Set automatically removes duplicates
  // [...new Set(array)] converts Set back to array
  const uniqueTeams = [...new Set(data.map(d => d.teamNumber))];
  document.getElementById('totalTeams').textContent = uniqueTeams.length;

  // =========================================
  // STAT 3: Average Total Score
  // =========================================
  // reduce() sums up all scores, then divide by count
  const avgScore = data.reduce((sum, d) => {
    // Calculate auto period score
    const autoScore = (d.autoSpeaker || 0) * 5 + (d.autoAmp || 0) * 2;
    // Calculate teleop period score
    const teleopScore = (d.teleopSpeaker || 0) * 2 + (d.teleopAmp || 0) + (d.amplifiedScored || 0) * 5;
    return sum + autoScore + teleopScore;
  }, 0) / data.length;

  // toFixed(1) rounds to 1 decimal place
  document.getElementById('avgScore').textContent = avgScore.toFixed(1);

  // =========================================
  // STAT 4: Top Performing Team
  // =========================================
  // Build an object to track each team's total score and match count
  const teamScores = {};
  data.forEach(d => {
    const score = (d.autoSpeaker || 0) * 5 + (d.autoAmp || 0) * 2 +
                  (d.teleopSpeaker || 0) * 2 + (d.teleopAmp || 0) + (d.amplifiedScored || 0) * 5;

    // Initialize team entry if it doesn't exist
    if (!teamScores[d.teamNumber]) {
      teamScores[d.teamNumber] = { total: 0, count: 0 };
    }

    // Add this match's score to the team's total
    teamScores[d.teamNumber].total += score;
    teamScores[d.teamNumber].count++;
  });

  // Find the team with the highest average score
  let topTeam = '-';
  let topAvg = 0;
  for (const [team, scores] of Object.entries(teamScores)) {
    const avg = scores.total / scores.count;
    if (avg > topAvg) {
      topAvg = avg;
      topTeam = team;
    }
  }
  document.getElementById('topTeam').textContent = topTeam;
}

// =============================================================================
// CHART CREATION
// =============================================================================
//
// These functions create interactive charts using Chart.js.
//
// CHART.JS BASICS:
// 1. Get a canvas element's 2D context
// 2. Create a new Chart with type, data, and options
// 3. Chart.js handles rendering and interactivity
//
// =============================================================================

/**
 * CREATE SCORING CHART
 * --------------------
 * Creates a doughnut chart showing the distribution of scoring types.
 *
 * DOUGHNUT CHART:
 * - Like a pie chart but with a hole in the middle
 * - Good for showing proportions of a whole
 * - Each slice represents a scoring category
 *
 * @param {Array} data - Array of scouting records
 */
function createScoringChart(data) {
  // Get the canvas element and its 2D drawing context
  // getContext('2d') is required for Chart.js
  const ctx = document.getElementById('scoringChart').getContext('2d');

  // =========================================
  // AGGREGATE DATA
  // Sum up all scores by category
  // =========================================
  const totalAutoSpeaker = data.reduce((sum, d) => sum + (d.autoSpeaker || 0), 0);
  const totalAutoAmp = data.reduce((sum, d) => sum + (d.autoAmp || 0), 0);
  const totalTeleopSpeaker = data.reduce((sum, d) => sum + (d.teleopSpeaker || 0), 0);
  const totalTeleopAmp = data.reduce((sum, d) => sum + (d.teleopAmp || 0), 0);
  const totalAmplified = data.reduce((sum, d) => sum + (d.amplifiedScored || 0), 0);

  // =========================================
  // DESTROY OLD CHART
  // Must destroy before creating new one
  // =========================================
  if (scoringChart) scoringChart.destroy();

  // =========================================
  // CREATE NEW CHART
  // =========================================
  scoringChart = new Chart(ctx, {
    type: 'doughnut',  // Chart type

    // DATA CONFIGURATION
    data: {
      // Labels appear in the legend and tooltips
      labels: ['Auto Speaker', 'Auto Amp', 'Teleop Speaker', 'Teleop Amp', 'Amplified'],

      // Datasets contain the actual data
      datasets: [{
        data: [totalAutoSpeaker, totalAutoAmp, totalTeleopSpeaker, totalTeleopAmp, totalAmplified],
        // Colors for each slice (pink theme with blue accent)
        backgroundColor: ['#e91e63', '#f48fb1', '#3f51b5', '#9fa8da', '#ff9800'],
        borderWidth: 2,
        borderColor: '#fff'  // White borders between slices
      }]
    },

    // OPTIONS CONFIGURATION
    options: {
      responsive: true,           // Resize with container
      maintainAspectRatio: false, // Allow custom height
      plugins: {
        legend: { position: 'right' }  // Legend on the right side
      }
    }
  });
}


/**
 * CREATE PERFORMANCE CHART
 * ------------------------
 * Creates a stacked bar chart comparing team performance.
 *
 * STACKED BAR CHART:
 * - Bars are stacked on top of each other
 * - Shows both individual values and totals
 * - Good for comparing multiple categories across groups
 *
 * @param {Array} data - Array of scouting records
 */
function createPerformanceChart(data) {
  const ctx = document.getElementById('performanceChart').getContext('2d');

  // =========================================
  // AGGREGATE DATA BY TEAM
  // Build an object with each team's scores
  // =========================================
  const teamData = {};
  data.forEach(d => {
    // Initialize team entry if it doesn't exist
    if (!teamData[d.teamNumber]) {
      teamData[d.teamNumber] = { autoScores: [], teleopScores: [], count: 0 };
    }

    // Calculate scores for this match
    const autoScore = (d.autoSpeaker || 0) * 5 + (d.autoAmp || 0) * 2;
    const teleopScore = (d.teleopSpeaker || 0) * 2 + (d.teleopAmp || 0) + (d.amplifiedScored || 0) * 5;

    // Add to team's arrays
    teamData[d.teamNumber].autoScores.push(autoScore);
    teamData[d.teamNumber].teleopScores.push(teleopScore);
    teamData[d.teamNumber].count++;
  });

  // =========================================
  // CALCULATE AVERAGES AND SORT
  // =========================================
  const teams = Object.keys(teamData)
    .map(team => ({
      team,
      // Calculate average auto score
      avgAuto: teamData[team].autoScores.reduce((a, b) => a + b, 0) / teamData[team].count,
      // Calculate average teleop score
      avgTeleop: teamData[team].teleopScores.reduce((a, b) => a + b, 0) / teamData[team].count
    }))
    // Sort by total score (highest first)
    .sort((a, b) => (b.avgAuto + b.avgTeleop) - (a.avgAuto + a.avgTeleop))
    // Take only top 10 teams
    .slice(0, 10);

  // Destroy old chart before creating new one
  if (performanceChart) performanceChart.destroy();

  // =========================================
  // CREATE NEW CHART
  // =========================================
  performanceChart = new Chart(ctx, {
    type: 'bar',

    data: {
      // X-axis labels (team names)
      labels: teams.map(t => `Team ${t.team}`),

      // Two datasets: one for auto, one for teleop
      datasets: [
        {
          label: 'Avg Auto Score',
          data: teams.map(t => t.avgAuto.toFixed(1)),
          backgroundColor: '#e91e63'  // Pink
        },
        {
          label: 'Avg Teleop Score',
          data: teams.map(t => t.avgTeleop.toFixed(1)),
          backgroundColor: '#3f51b5'  // Blue
        }
      ]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true },              // Stack bars horizontally
        y: { stacked: true, beginAtZero: true }  // Stack bars vertically, start at 0
      },
      plugins: {
        legend: { position: 'top' }
      }
    }
  });
}


// =============================================================================
// TOP 10 TEAMS DISPLAY
// =============================================================================

/**
 * DISPLAY TOP 10 TEAMS
 * --------------------
 * Creates a ranked list of the top 10 performing teams.
 * Shows team number, average score, and match count.
 *
 * @param {Array} data - Array of scouting records
 */
function displayTop10Teams(data) {
  const container = document.getElementById('top10Teams');
  if (!container) return;

  // Aggregate scores by team
  const teamData = {};
  data.forEach(d => {
    if (!teamData[d.teamNumber]) {
      teamData[d.teamNumber] = { scores: [], climbs: 0 };
    }

    // Calculate total score for this match
    const autoScore = (d.autoSpeaker || 0) * 5 + (d.autoAmp || 0) * 2;
    const teleopScore = (d.teleopSpeaker || 0) * 2 + (d.teleopAmp || 0) + (d.amplifiedScored || 0) * 5;
    const total = autoScore + teleopScore;

    teamData[d.teamNumber].scores.push(total);

    // Count successful climbs
    if (d.climbStatus === 'climbed' || d.climbStatus === 'harmony') {
      teamData[d.teamNumber].climbs++;
    }
  });

  // Calculate averages and sort
  const teams = Object.entries(teamData)
    .map(([team, data]) => ({
      team: team,
      avgScore: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
      matches: data.scores.length,
      climbRate: (data.climbs / data.scores.length * 100).toFixed(0)
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 10);

  // Build HTML
  let html = '<div class="top10-list">';
  teams.forEach((team, index) => {
    const rankClass = index < 3 ? 'top-rank' : '';
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;

    html += `
      <div class="top10-item ${rankClass}">
        <span class="rank">${medal}</span>
        <div class="team-info">
          <span class="team-number">Team ${team.team}</span>
          <span class="team-stats">${team.matches} matches • ${team.climbRate}% climb</span>
        </div>
        <div class="avg-score">${team.avgScore.toFixed(1)}</div>
      </div>
    `;
  });
  html += '</div>';

  container.innerHTML = html;
}


// =============================================================================
// TABLE DISPLAY
// =============================================================================

/**
 * DISPLAY RECENT ENTRIES
 * ----------------------
 * Creates an HTML table showing the most recent scouting entries.
 *
 * TEMPLATE LITERALS EXPLAINED:
 * Template literals use backticks (`) instead of quotes.
 * They allow:
 * - Multi-line strings
 * - Variable interpolation with ${variable}
 * - Expression evaluation with ${expression}
 *
 * @param {Array} data - Array of scouting records (already sorted by date)
 */
function displayRecentEntries(data) {
  const container = document.getElementById('recentEntries');

  // Take only the 10 most recent entries
  const recentData = data.slice(0, 10);

  // Build the table HTML using template literals
  let html = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Match</th>
          <th>Team</th>
          <th>Alliance</th>
          <th>Auto Score</th>
          <th>Teleop Score</th>
          <th>Climb</th>
          <th>Scouter</th>
        </tr>
      </thead>
      <tbody>
  `;

  // Add a row for each entry
  recentData.forEach(entry => {
    // Calculate scores
    const autoScore = (entry.autoSpeaker || 0) * 5 + (entry.autoAmp || 0) * 2;
    const teleopScore = (entry.teleopSpeaker || 0) * 2 + (entry.teleopAmp || 0) + (entry.amplifiedScored || 0) * 5;

    // Determine alliance color class for styling
    const allianceClass = entry.allianceColor === 'red' ? 'alliance-red' : 'alliance-blue';

    // Add table row
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

  // Close the table
  html += '</tbody></table>';

  // Insert the HTML into the container
  container.innerHTML = html;
}


// =============================================================================
// INITIALIZATION
// =============================================================================

// Set up event filter change handler
document.addEventListener('DOMContentLoaded', () => {
  const eventFilter = document.getElementById('eventFilter');
  if (eventFilter) {
    eventFilter.addEventListener('change', handleEventFilterChange);
  }
});

// Log that the module loaded successfully
console.log('📊 Dashboard module loaded');
