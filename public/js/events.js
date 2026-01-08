/**
 * =============================================================================
 * EVENTS.JS - Event Management and TBA Integration
 * =============================================================================
 *
 * This module handles the Events page functionality:
 * - Fetching events from The Blue Alliance (TBA)
 * - Displaying event schedules and match lists
 * - Showing team lists and rankings for events
 * - Caching event data for performance
 *
 * =============================================================================
 */

// =============================================================================
// IMPORTS
// =============================================================================

import { auth, requireAuth } from './firebase.js';
import {
  getTBAEvents,
  getTBAEventDetails,
  getTBAEventTeams,
  getTBAEventMatches,
  getTBAEventRankings
} from './externalData.js';
import { initUserProfileListener, setupUserNav, getCurrentProfile } from './user.js';

// =============================================================================
// STATE
// =============================================================================

let currentEvents = [];
let selectedEvent = null;
let currentYear = new Date().getFullYear();

// =============================================================================
// PAGE INITIALIZATION
// =============================================================================

async function initEventsPage() {
  console.log('📅 Initializing Events page...');

  // Require authentication
  await requireAuth();

  // Set up user profile listener
  initUserProfileListener((profile) => {
    if (profile) {
      setupUserNav();
    }
  });

  // Set up year selector
  setupYearSelector();

  // Set up event search
  setupEventSearch();

  // Set up tab navigation
  setupTabNavigation();

  // Set up match prediction toggle
  setupPredictionToggle();

  // Set up refresh button
  document.getElementById('refresh-btn')?.addEventListener('click', () => {
    loadEvents(currentYear, true);
  });

  // Set up sign out
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    const { signOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
    await signOut(auth);
    window.location.href = 'login.html';
  });

  // Load initial events
  await loadEvents(currentYear);
}

// =============================================================================
// YEAR SELECTOR
// =============================================================================

function setupYearSelector() {
  const yearSelect = document.getElementById('year-select');
  if (!yearSelect) return;

  // Set current year as selected
  yearSelect.value = currentYear.toString();

  yearSelect.addEventListener('change', (e) => {
    currentYear = parseInt(e.target.value);
    loadEvents(currentYear);
  });
}

// =============================================================================
// EVENT SEARCH
// =============================================================================

function setupEventSearch() {
  const searchInput = document.getElementById('event-search');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    filterEvents(query);
  });
}

function filterEvents(query) {
  const filteredEvents = currentEvents.filter(event =>
    event.name.toLowerCase().includes(query) ||
    event.key.toLowerCase().includes(query) ||
    (event.city && event.city.toLowerCase().includes(query)) ||
    (event.state_prov && event.state_prov.toLowerCase().includes(query))
  );
  renderEventsList(filteredEvents);
}

// =============================================================================
// TAB NAVIGATION
// =============================================================================

function setupTabNavigation() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      switchTab(tabId);
    });
  });
}

function switchTab(tabId) {
  // Update button states
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });

  // Update tab content visibility
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.style.display = 'none';
  });

  const activeTab = document.getElementById(`${tabId}-tab`);
  if (activeTab) activeTab.style.display = 'block';
}

// =============================================================================
// LOAD EVENTS
// =============================================================================

async function loadEvents(year, forceRefresh = false) {
  const eventsList = document.getElementById('events-list');
  if (!eventsList) return;

  eventsList.innerHTML = '<div class="loading-indicator">Loading events...</div>';

  try {
    currentEvents = await getTBAEvents(year) || [];

    // Sort by start date
    currentEvents.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

    renderEventsList(currentEvents);
    console.log(`✅ Loaded ${currentEvents.length} events for ${year}`);
  } catch (error) {
    console.error('Error loading events:', error);
    eventsList.innerHTML = `<div class="error-state">Error loading events: ${error.message}</div>`;
  }
}

// =============================================================================
// RENDER EVENTS LIST
// =============================================================================

function renderEventsList(events) {
  const eventsList = document.getElementById('events-list');
  if (!eventsList) return;

  if (!events || events.length === 0) {
    eventsList.innerHTML = '<div class="empty-state">No events found</div>';
    return;
  }

  eventsList.innerHTML = events.map(event => `
    <div class="event-card" data-event-key="${event.key}">
      <div class="event-card-header">
        <h3>${event.name}</h3>
        <span class="event-type">${getEventTypeName(event.event_type)}</span>
      </div>
      <div class="event-card-body">
        <p>📍 ${event.city || 'Unknown'}, ${event.state_prov || ''}</p>
        <p>📅 ${formatDateRange(event.start_date, event.end_date)}</p>
      </div>
    </div>
  `).join('');

  // Add click handlers
  eventsList.querySelectorAll('.event-card').forEach(card => {
    card.addEventListener('click', () => {
      const eventKey = card.dataset.eventKey;
      selectEvent(eventKey);
    });
  });
}

function getEventTypeName(typeCode) {
  const types = {
    0: 'Regional',
    1: 'District',
    2: 'District Championship',
    3: 'Championship Division',
    4: 'Championship Finals',
    5: 'District Championship Division',
    6: 'Festival of Champions',
    99: 'Offseason',
    100: 'Preseason'
  };
  return types[typeCode] || 'Event';
}

function formatDateRange(start, end) {
  if (!start) return 'Dates TBD';
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : startDate;

  const options = { month: 'short', day: 'numeric' };
  const startStr = startDate.toLocaleDateString('en-US', options);
  const endStr = endDate.toLocaleDateString('en-US', options);

  return startStr === endStr ? startStr : `${startStr} - ${endStr}`;
}

// =============================================================================
// SELECT EVENT
// =============================================================================

async function selectEvent(eventKey) {
  console.log(`📅 Selecting event: ${eventKey}`);

  const detailsSection = document.getElementById('event-details-section');
  if (detailsSection) detailsSection.style.display = 'block';

  // Show loading state
  document.getElementById('event-name').textContent = 'Loading...';

  try {
    // Fetch all event data in parallel
    const [details, teams, matches, rankings] = await Promise.all([
      getTBAEventDetails(eventKey),
      getTBAEventTeams(eventKey),
      getTBAEventMatches(eventKey),
      getTBAEventRankings(eventKey)
    ]);

    selectedEvent = { details, teams, matches, rankings };

    // Update event info
    document.getElementById('event-name').textContent = details?.name || eventKey;
    document.getElementById('event-location').textContent =
      `${details?.city || 'Unknown'}, ${details?.state_prov || ''} ${details?.country || ''}`;
    document.getElementById('event-dates').textContent =
      formatDateRange(details?.start_date, details?.end_date);
    document.getElementById('event-team-count').textContent =
      teams?.length || 0;

    // Render tabs
    renderSchedule(matches);
    renderEventTeams(teams);
    renderRankings(rankings);

    console.log(`✅ Event ${eventKey} loaded successfully`);
  } catch (error) {
    console.error('Error loading event:', error);
    document.getElementById('event-name').textContent = 'Error loading event';
  }
}

// =============================================================================
// RENDER SCHEDULE
// =============================================================================

function renderSchedule(matches) {
  const container = document.getElementById('match-schedule');
  if (!container) return;

  if (!matches || matches.length === 0) {
    container.innerHTML = '<div class="empty-state">No matches scheduled yet</div>';
    return;
  }

  // Sort matches by time
  matches.sort((a, b) => (a.time || a.predicted_time || 0) - (b.time || b.predicted_time || 0));

  // Group by match type
  const qualMatches = matches.filter(m => m.comp_level === 'qm');
  const playoffMatches = matches.filter(m => m.comp_level !== 'qm');

  let html = '<div class="match-list">';

  // Qualification matches
  if (qualMatches.length > 0) {
    html += '<h4>Qualification Matches</h4>';
    html += qualMatches.slice(0, 50).map(m => renderMatchCard(m)).join('');
  }

  // Playoff matches
  if (playoffMatches.length > 0) {
    html += '<h4>Playoff Matches</h4>';
    html += playoffMatches.map(m => renderMatchCard(m)).join('');
  }

  html += '</div>';
  container.innerHTML = html;
}

function renderMatchCard(match) {
  const redTeams = match.alliances?.red?.team_keys?.map(k => k.replace('frc', '')).join(', ') || '';
  const blueTeams = match.alliances?.blue?.team_keys?.map(k => k.replace('frc', '')).join(', ') || '';
  const redScore = match.alliances?.red?.score ?? '-';
  const blueScore = match.alliances?.blue?.score ?? '-';

  return `
    <div class="match-card">
      <div class="match-number">${getMatchLabel(match)}</div>
      <div class="match-alliances">
        <div class="alliance red">
          <span class="teams">${redTeams}</span>
          <span class="score">${redScore}</span>
        </div>
        <div class="alliance blue">
          <span class="teams">${blueTeams}</span>
          <span class="score">${blueScore}</span>
        </div>
      </div>
    </div>
  `;
}

function getMatchLabel(match) {
  const types = { qm: 'Qual', qf: 'QF', sf: 'SF', f: 'Finals' };
  const type = types[match.comp_level] || match.comp_level;
  return `${type} ${match.match_number}`;
}

// =============================================================================
// RENDER EVENT TEAMS
// =============================================================================

function renderEventTeams(teams) {
  const container = document.getElementById('event-teams');
  if (!container) return;

  if (!teams || teams.length === 0) {
    container.innerHTML = '<div class="empty-state">No teams registered</div>';
    return;
  }

  // Sort by team number
  teams.sort((a, b) => a.team_number - b.team_number);

  container.innerHTML = teams.map(team => `
    <div class="team-card-small">
      <span class="team-number">${team.team_number}</span>
      <span class="team-name">${team.nickname || team.name || 'Unknown'}</span>
    </div>
  `).join('');
}

// =============================================================================
// RENDER RANKINGS
// =============================================================================

function renderRankings(rankings) {
  const container = document.getElementById('event-rankings');
  if (!container) return;

  if (!rankings || !rankings.rankings || rankings.rankings.length === 0) {
    container.innerHTML = '<div class="empty-state">Rankings not available yet</div>';
    return;
  }

  let html = `
    <table class="rankings-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Team</th>
          <th>Record</th>
          <th>RP</th>
        </tr>
      </thead>
      <tbody>
  `;

  rankings.rankings.forEach(r => {
    const teamNum = r.team_key.replace('frc', '');
    html += `
      <tr>
        <td>${r.rank}</td>
        <td>${teamNum}</td>
        <td>${r.record?.wins || 0}-${r.record?.losses || 0}-${r.record?.ties || 0}</td>
        <td>${r.extra_stats?.[0] ?? r.ranking_score ?? '-'}</td>
      </tr>
    `;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

// =============================================================================
// MATCH PREDICTION TOGGLE
// =============================================================================
//
// This toggle enables/disables match predictions in the schedule view.
// Currently UI only - prediction logic will be added in a future update.
//
// TO IMPLEMENT PREDICTION LOGIC:
// 1. Import getStatboticsMatches from externalData.js
// 2. When toggle is enabled, fetch predictions for the selected event
// 3. For each match, calculate win probability:
//    - Red Win Prob = 1 / (1 + 10^((BlueEPA - RedEPA) / 400))
// 4. Add prediction indicators to each match row
// 5. Consider caching predictions to reduce API calls
//
// EXAMPLE PREDICTION CALCULATION:
// const redEPA = redTeams.reduce((sum, t) => sum + t.epa, 0);
// const blueEPA = blueTeams.reduce((sum, t) => sum + t.epa, 0);
// const redWinProb = 1 / (1 + Math.pow(10, (blueEPA - redEPA) / 400));
// =============================================================================

let predictionsEnabled = false;

function setupPredictionToggle() {
  const toggle = document.getElementById('predictionToggle');
  const banner = document.getElementById('predictionBanner');

  if (!toggle) return;

  toggle.addEventListener('change', (e) => {
    predictionsEnabled = e.target.checked;

    // Show/hide prediction banner
    if (banner) {
      banner.style.display = predictionsEnabled ? 'flex' : 'none';
    }

    console.log(`📊 Match predictions ${predictionsEnabled ? 'enabled' : 'disabled'}`);

    // TODO: Future implementation
    // When predictions are enabled:
    // 1. Fetch Statbotics data for the current event
    // 2. Calculate win probabilities for each match
    // 3. Update the match schedule display with prediction indicators
    //
    // Example:
    // if (predictionsEnabled && selectedEvent) {
    //   await loadPredictions(selectedEvent.key);
    //   renderScheduleWithPredictions();
    // } else {
    //   renderSchedule(); // Without predictions
    // }
  });
}

// Placeholder for future prediction logic
// async function loadPredictions(eventKey) {
//   try {
//     const { getStatboticsMatches } = await import('./externalData.js');
//     const predictions = await getStatboticsMatches(eventKey);
//     return predictions;
//   } catch (error) {
//     console.error('Error loading predictions:', error);
//     return null;
//   }
// }

// =============================================================================
// INITIALIZATION
// =============================================================================

document.addEventListener('DOMContentLoaded', initEventsPage);

