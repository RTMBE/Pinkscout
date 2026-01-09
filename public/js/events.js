/**
 * EVENTS.JS - Event Schedule & Match Predictions
 * Features: Searchable events, team logos, match results, load more, modals, caching
 */

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import {
  signOutUser,
  getBlueAllianceEventList,
  getBlueAllianceEventDetails,
  getEventTeamStats,
  classifyEPA
} from './app.js';

// ============= CACHING =============
const cache = {
  events: new Map(),      // year -> events[]
  eventDetails: new Map(), // eventKey -> {event, teams, matches}
  teamStats: new Map(),   // teamNumber -> stats
  ttl: 5 * 60 * 1000      // 5 minute cache
};

function getCached(map, key) {
  const item = map.get(key);
  if (item && Date.now() - item.time < cache.ttl) return item.data;
  return null;
}

function setCache(map, key, data) {
  map.set(key, { data, time: Date.now() });
}

// ============= DOM REFERENCES =============
let userInfo, userEmail, logoutBtn, yearSelect, eventSearch, eventDatalist;
let eventSelect, loadEventBtn, eventInfo, teamsList, leaderboard, matchesList;
let predictionToggle, matchTeamFilter, loadMoreBtn, loadMoreContainer;
let matchCountInfo, teamsSearch, teamModal, teamModalBody, matchModal, matchModalBody;

function initDomRefs() {
  userInfo = document.getElementById('userInfo');
  userEmail = document.getElementById('userEmail');
  logoutBtn = document.getElementById('logoutBtn');
  yearSelect = document.getElementById('yearSelect');
  eventSearch = document.getElementById('eventSearch');
  eventDatalist = document.getElementById('eventDatalist');
  eventSelect = document.getElementById('eventSelect');
  loadEventBtn = document.getElementById('loadEventBtn');
  eventInfo = document.getElementById('eventInfo');
  teamsList = document.getElementById('teamsList');
  leaderboard = document.getElementById('leaderboard');
  matchesList = document.getElementById('matchesList');
  predictionToggle = document.getElementById('predictionToggle');
  matchTeamFilter = document.getElementById('matchTeamFilter');
  loadMoreBtn = document.getElementById('loadMoreBtn');
  loadMoreContainer = document.getElementById('loadMoreContainer');
  matchCountInfo = document.getElementById('matchCountInfo');
  teamsSearch = document.getElementById('teamsSearch');
  teamModal = document.getElementById('teamModal');
  teamModalBody = document.getElementById('teamModalBody');
  matchModal = document.getElementById('matchModal');
  matchModalBody = document.getElementById('matchModalBody');
}

// ============= STATE =============
let currentEvent = null;
let currentEventKey = null;
let currentTeams = [];
let currentMatches = [];
let filteredMatches = [];
let filteredTeams = [];
let allEvents = [];
let predictionsEnabled = false;
let displayedMatchCount = 20;
const MATCHES_PER_PAGE = 20;
let currentSortBy = 'teleop'; // Default sort: teleop EPA
let currentSortBy = 'teleop'; // Default sort: teleop EPA

// ============= AUTH =============
onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.href = 'login.html'; return; }
  if (userInfo) userInfo.style.display = 'block';
  if (userEmail) userEmail.textContent = user.email;
});

// ============= INITIALIZE =============
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🏆 Events page initializing...');
  initDomRefs();
  if (logoutBtn) logoutBtn.addEventListener('click', signOutUser);
  populateYearDropdown();
  setupEventListeners();
  await loadEventsForYear();
});

function setupEventListeners() {
  if (yearSelect) yearSelect.addEventListener('change', loadEventsForYear);
  if (loadEventBtn) loadEventBtn.addEventListener('click', loadSelectedEvent);
  if (loadMoreBtn) loadMoreBtn.addEventListener('click', loadMoreMatches);
  if (eventSearch) eventSearch.addEventListener('input', handleEventSearch);
  if (matchTeamFilter) matchTeamFilter.addEventListener('input', debounce(filterMatchesByTeam, 200));
  if (teamsSearch) teamsSearch.addEventListener('input', debounce(filterTeams, 200));

  if (predictionToggle) {
    predictionToggle.addEventListener('change', () => {
      predictionsEnabled = predictionToggle.checked;
      if (currentMatches.length > 0) renderMatches();
    });
  }

  // Modal close handlers
  document.getElementById('closeTeamModal')?.addEventListener('click', () => {
    if (teamModal) teamModal.style.display = 'none';
  });
  document.getElementById('closeMatchModal')?.addEventListener('click', () => {
    if (matchModal) matchModal.style.display = 'none';
  });

  // Close modals on backdrop click
  teamModal?.addEventListener('click', (e) => {
    if (e.target === teamModal) teamModal.style.display = 'none';
  });
  matchModal?.addEventListener('click', (e) => {
    if (e.target === matchModal) matchModal.style.display = 'none';
  });
}

// Debounce utility for search inputs
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function populateYearDropdown() {
  if (!yearSelect) return;
  const currentYear = new Date().getFullYear();
  yearSelect.innerHTML = '';
  for (let year = currentYear; year >= 2015; year--) {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    yearSelect.appendChild(option);
  }
}

async function loadEventsForYear() {
  if (!yearSelect) return;
  const year = yearSelect.value;

  if (eventSearch) eventSearch.value = '';
  if (eventSelect) eventSelect.value = '';
  if (eventDatalist) eventDatalist.innerHTML = '';

  // Check cache first
  let events = getCached(cache.events, year);

  if (!events) {
    try {
      events = await getBlueAllianceEventList(year);
      if (events && events.length > 0) {
        setCache(cache.events, year, events);
      }
    } catch (error) {
      console.error('Error loading events:', error);
      allEvents = [];
      return;
    }
  }

  if (!events || events.length === 0) {
    allEvents = [];
    return;
  }

  events.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
  allEvents = events;

  // Populate datalist for searchable dropdown
  if (eventDatalist) {
    const fragment = document.createDocumentFragment();
    events.forEach(event => {
      const option = document.createElement('option');
      option.value = event.name + ' (' + event.start_date + ')';
      option.dataset.key = event.key;
      fragment.appendChild(option);
    });
    eventDatalist.innerHTML = '';
    eventDatalist.appendChild(fragment);
  }
}

function handleEventSearch() {
  if (!eventSearch || !eventSelect) return;
  const searchVal = eventSearch.value.toLowerCase();

  const match = allEvents.find(e =>
    (e.name + ' (' + e.start_date + ')').toLowerCase() === searchVal.toLowerCase()
  );

  if (match) {
    eventSelect.value = match.key;
  }
}

async function loadSelectedEvent() {
  if (!eventSelect) return;
  const eventKey = eventSelect.value;
  if (!eventKey) { alert('Please type and select an event from the list'); return; }

  currentEventKey = eventKey;
  displayedMatchCount = MATCHES_PER_PAGE;
  if (matchTeamFilter) matchTeamFilter.value = '';
  if (teamsSearch) teamsSearch.value = '';

  // Show loading state
  const eventInfoCard = document.getElementById('eventInfoCard');
  if (eventInfoCard) eventInfoCard.style.display = 'block';
  if (eventInfo) eventInfo.innerHTML = '<div class="loading-spinner"></div>';
  if (teamsList) teamsList.innerHTML = '<div class="loading-spinner"></div>';
  if (leaderboard) leaderboard.innerHTML = '<div class="loading-spinner"></div>';
  if (matchesList) matchesList.innerHTML = '<div class="loading-spinner"></div>';
  if (loadMoreContainer) loadMoreContainer.style.display = 'none';

  try {
    // Check cache for event details
    let eventDetails = getCached(cache.eventDetails, eventKey);

    if (!eventDetails) {
      eventDetails = await getBlueAllianceEventDetails(eventKey);
      if (eventDetails) setCache(cache.eventDetails, eventKey, eventDetails);
    }

    if (!eventDetails) throw new Error('Failed to load event data');

    currentEvent = eventDetails.event;
    currentMatches = eventDetails.matches || [];
    filteredMatches = [...currentMatches];

    const tbaTeams = eventDetails.teams || [];

    // Render event info and teams immediately with basic data
    renderEventInfo(currentEvent);

    // Render teams with placeholder EPA while loading stats
    currentTeams = tbaTeams.map(t => ({
      team_number: t.team_number,
      nickname: t.nickname,
      city: t.city,
      state_prov: t.state_prov,
      epa_percentile: null,
      epa_raw: 0,
      classification: null
    }));
    filteredTeams = [...currentTeams];
    renderTeamsList(filteredTeams);
    renderMatches();

    // Load EPA stats in background (non-blocking) - pass event key for faster API
    loadTeamStatsAsync(tbaTeams.map(t => t.team_number), eventKey);

  } catch (error) {
    console.error('Error loading event:', error);
    if (eventInfo) eventInfo.innerHTML = '<p class="error">Error: ' + error.message + '</p>';
  }
}

// Load team stats asynchronously to not block initial render
async function loadTeamStatsAsync(teamNumbers, eventKey) {
  if (teamNumbers.length === 0) return;

  try {
    const teamStats = await getEventTeamStats(teamNumbers, eventKey);

    // Update currentTeams with full EPA breakdown data
    currentTeams = currentTeams.map(team => {
      const stats = teamStats.find(s => s.teamNumber === team.team_number);
      if (stats) {
        setCache(cache.teamStats, team.team_number, stats);
      }
      return {
        ...team,
        epa_percentile: stats?.epaPercentile || null,
        epa_raw: stats?.epaTeleop || 0,  // Default display is teleop
        epa_total: stats?.epaTotal || 0,
        epa_teleop: stats?.epaTeleop || 0,
        epa_auto: stats?.epaAuto || 0,
        epa_endgame: stats?.epaEndgame || 0,
        epa_unitless: stats?.epaUnitless || 0,
        classification: stats?.classification || null,
        wins: stats?.wins || 0,
        losses: stats?.losses || 0,
        rank: stats?.rank || 0
      };
    });

    filteredTeams = currentTeams.filter(t => {
      const searchVal = teamsSearch?.value?.toLowerCase() || '';
      if (!searchVal) return true;
      return String(t.team_number).includes(searchVal) ||
             (t.nickname || '').toLowerCase().includes(searchVal);
    });

    // Re-render with EPA data
    renderTeamsList(filteredTeams);
    renderLeaderboard(currentTeams, currentSortBy);
  } catch (error) {
    console.error('Error loading team stats:', error);
  }
}

function renderEventInfo(event) {
  if (!eventInfo || !event) return;
  const startDate = new Date(event.start_date).toLocaleDateString();
  const endDate = new Date(event.end_date).toLocaleDateString();
  eventInfo.innerHTML = `
    <div class="event-header"><h2>${event.name}</h2></div>
    <div class="event-details">
      <p>📍 ${event.city || 'TBD'}, ${event.state_prov || ''}</p>
      <p>📅 ${startDate} - ${endDate}</p>
      <p>🤖 ${currentTeams.length} teams | 📋 ${currentMatches.length} matches</p>
    </div>
  `;
}

function filterTeams() {
  const searchVal = teamsSearch?.value?.toLowerCase()?.trim() || '';
  if (!searchVal) {
    filteredTeams = [...currentTeams];
  } else {
    filteredTeams = currentTeams.filter(t =>
      String(t.team_number).includes(searchVal) ||
      (t.nickname || '').toLowerCase().includes(searchVal)
    );
  }
  renderTeamsList(filteredTeams);
}

function renderTeamsList(teams) {
  if (!teamsList) return;
  if (!teams || teams.length === 0) {
    teamsList.innerHTML = '<p class="no-data">No teams found</p>';
    return;
  }
  const sorted = teams.slice().sort((a, b) => a.team_number - b.team_number);
  let html = '<div class="teams-grid teams-full-grid">';
  sorted.forEach(team => {
    const c = team.epa_percentile ? classifyEPA(team.epa_percentile) : { emoji: '?', color: '#888' };
    const avatarUrl = `https://www.thebluealliance.com/avatar/2024/frc${team.team_number}.png`;
    // Show teleop EPA as default (matches leaderboard default)
    const teleopEpa = team.epa_teleop || 0;
    const epaDisplay = teleopEpa > 0 ? teleopEpa.toFixed(1) : '...';
    html += `
      <div class="team-chip" style="border-left:3px solid ${c.color}" onclick="window.showTeamModal(${team.team_number})">
        <img src="${avatarUrl}" alt="" class="team-avatar" onerror="this.style.display='none'">
        <span class="team-num">${team.team_number}</span>
        <span class="team-name">${team.nickname || ''}</span>
        <span class="team-epa">${epaDisplay}</span>
        <span class="team-class">${c.emoji}</span>
      </div>
    `;
  });
  html += '</div>';
  teamsList.innerHTML = html;
}

function renderLeaderboard(teams, sortBy = 'teleop') {
  if (!leaderboard) return;
  if (!teams || teams.length === 0) {
    leaderboard.innerHTML = '<p class="no-data">No team data available</p>';
    return;
  }

  // Get the EPA field based on sort selection
  const getEpaValue = (team) => {
    switch(sortBy) {
      case 'teleop': return team.epa_teleop || 0;
      case 'auto': return team.epa_auto || 0;
      case 'endgame': return team.epa_endgame || 0;
      case 'total': return team.epa_total || 0;
      default: return team.epa_teleop || 0;
    }
  };

  const sorted = teams.slice()
    .filter(t => getEpaValue(t) > 0)
    .sort((a, b) => getEpaValue(b) - getEpaValue(a));

  if (sorted.length === 0) {
    leaderboard.innerHTML = '<p class="no-data">Loading EPA data...</p>';
    return;
  }

  const sortLabels = { teleop: 'Teleop', auto: 'Auto', endgame: 'Endgame', total: 'Total' };

  let html = `
    <div class="leaderboard-controls">
      <select id="epaSortSelect" class="sort-select">
        <option value="teleop" ${sortBy === 'teleop' ? 'selected' : ''}>Teleop EPA</option>
        <option value="auto" ${sortBy === 'auto' ? 'selected' : ''}>Auto EPA</option>
        <option value="endgame" ${sortBy === 'endgame' ? 'selected' : ''}>Endgame EPA</option>
        <option value="total" ${sortBy === 'total' ? 'selected' : ''}>Total EPA</option>
      </select>
    </div>
    <table class="data-table leaderboard-table"><thead><tr>
    <th>#</th><th>Team</th><th>${sortLabels[sortBy]}</th><th>Total</th></tr></thead><tbody>`;

  sorted.slice(0, 10).forEach((team, index) => {
    const c = team.epa_percentile ? classifyEPA(team.epa_percentile) : { color: '#888' };
    const displayEpa = getEpaValue(team);
    const totalEpa = team.epa_total || 0;
    html += `<tr class="clickable-row" onclick="window.showTeamModal(${team.team_number})">
      <td class="rank">${index + 1}</td>
      <td><strong>${team.team_number}</strong></td>
      <td class="epa-value" style="color:${c.color}">${displayEpa.toFixed(1)}</td>
      <td class="epa-secondary">${totalEpa.toFixed(1)}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  leaderboard.innerHTML = html;

  // Add event listener for sort dropdown
  const sortSelect = document.getElementById('epaSortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      currentSortBy = e.target.value;
      renderLeaderboard(currentTeams, currentSortBy);
    });
  }
}

// Filter matches by team number
function filterMatchesByTeam() {
  const filterVal = matchTeamFilter?.value?.trim() || '';
  displayedMatchCount = MATCHES_PER_PAGE;

  if (!filterVal) {
    filteredMatches = [...currentMatches];
  } else {
    filteredMatches = currentMatches.filter(match => {
      const allTeams = [
        ...(match.alliances?.red?.team_keys || []),
        ...(match.alliances?.blue?.team_keys || [])
      ];
      return allTeams.some(k => k.replace('frc', '').includes(filterVal));
    });
  }

  renderMatches();
}

function renderMatches() {
  if (!matchesList) return;

  if (!filteredMatches || filteredMatches.length === 0) {
    matchesList.innerHTML = '<p class="no-data">No matches found</p>';
    if (loadMoreContainer) loadMoreContainer.style.display = 'none';
    return;
  }

  // Sort matches
  const sorted = filteredMatches.slice().sort((a, b) => {
    if (a.comp_level !== b.comp_level) {
      const order = { qm: 1, ef: 2, qf: 3, sf: 4, f: 5 };
      return (order[a.comp_level] || 0) - (order[b.comp_level] || 0);
    }
    return (a.match_number || 0) - (b.match_number || 0);
  });

  const toDisplay = sorted.slice(0, displayedMatchCount);
  let html = '<div class="matches-grid">';

  toDisplay.forEach((match, idx) => {
    const matchLabel = getMatchLabel(match);
    const redTeams = (match.alliances?.red?.team_keys || []).map(k => k.replace('frc', '')).join(', ');
    const blueTeams = (match.alliances?.blue?.team_keys || []).map(k => k.replace('frc', '')).join(', ');
    const redScore = match.alliances?.red?.score;
    const blueScore = match.alliances?.blue?.score;
    const hasScores = redScore !== null && redScore !== undefined && redScore >= 0 &&
                      blueScore !== null && blueScore !== undefined && blueScore >= 0;

    let redClass = '', blueClass = '', resultHtml = '';
    if (hasScores) {
      if (redScore > blueScore) {
        redClass = 'winner';
        resultHtml = `<div class="match-result red-win">🔴 Red Wins ${redScore}-${blueScore}</div>`;
      } else if (blueScore > redScore) {
        blueClass = 'winner';
        resultHtml = `<div class="match-result blue-win">🔵 Blue Wins ${blueScore}-${redScore}</div>`;
      } else {
        resultHtml = `<div class="match-result tie">⚪ Tie ${redScore}-${blueScore}</div>`;
      }
    }

    // Store match index for modal lookup
    const matchKey = match.key || `match-${idx}`;

    html += `<div class="match-card ${hasScores ? 'completed' : 'upcoming'}" onclick="window.showMatchModal('${matchKey}')">
      <div class="match-number">${matchLabel}</div>
      <div class="alliance red ${redClass}">
        <span class="alliance-label">Red:</span> ${redTeams}
        ${hasScores ? `<span class="score">${redScore}</span>` : ''}
      </div>
      <div class="alliance blue ${blueClass}">
        <span class="alliance-label">Blue:</span> ${blueTeams}
        ${hasScores ? `<span class="score">${blueScore}</span>` : ''}
      </div>
      ${resultHtml}
      ${predictionsEnabled && !hasScores ? `<div class="prediction">${predictMatch(match)}</div>` : ''}
    </div>`;
  });

  html += '</div>';
  matchesList.innerHTML = html;

  // Update load more button
  if (loadMoreContainer && matchCountInfo) {
    if (sorted.length > displayedMatchCount) {
      loadMoreContainer.style.display = 'block';
      matchCountInfo.textContent = `Showing ${displayedMatchCount} of ${sorted.length} matches`;
    } else {
      loadMoreContainer.style.display = 'none';
    }
  }
}

function loadMoreMatches() {
  displayedMatchCount += MATCHES_PER_PAGE;
  renderMatches();
}

function getMatchLabel(match) {
  const labels = { qm: 'Qual', ef: 'Eighths', qf: 'Quarters', sf: 'Semis', f: 'Finals' };
  return (labels[match.comp_level] || match.comp_level) + ' ' + (match.match_number || '');
}

function predictMatch(match) {
  const redEPA = calculateAllianceEPA(match.alliances?.red?.team_keys || []);
  const blueEPA = calculateAllianceEPA(match.alliances?.blue?.team_keys || []);
  if (redEPA === 0 && blueEPA === 0) return 'No prediction data';
  const total = redEPA + blueEPA;
  const redPct = Math.round((redEPA / total) * 100);
  const bluePct = 100 - redPct;
  if (redPct > bluePct) return `Predicted: Red ${redPct}%`;
  if (bluePct > redPct) return `Predicted: Blue ${bluePct}%`;
  return 'Predicted: Even match';
}

function calculateAllianceEPA(teamKeys) {
  let totalEPA = 0;
  teamKeys.forEach(key => {
    const teamNum = key.replace('frc', '');
    const team = currentTeams.find(t => String(t.team_number) === teamNum);
    if (team && team.epa_total) {
      totalEPA += team.epa_total;
    }
  });
  return totalEPA;
}

// ============= TEAM MODAL =============
window.showTeamModal = async function(teamNumber) {
  if (!teamModal || !teamModalBody) return;

  teamModal.style.display = 'flex';
  teamModalBody.innerHTML = '<div class="loading-spinner"></div>';

  const team = currentTeams.find(t => t.team_number === teamNumber);
  const avatarUrl = `https://www.thebluealliance.com/avatar/2024/frc${teamNumber}.png`;
  const c = team?.epa_percentile ? classifyEPA(team.epa_percentile) : { emoji: '?', color: '#888', label: 'Unknown' };

  // Get scouting data for this team at this event
  let scoutingData = [];
  try {
    if (currentEventKey) {
      const scoutingQuery = query(
        collection(db, 'scouting_entries'),
        where('teamNumber', '==', teamNumber),
        where('eventKey', '==', currentEventKey)
      );
      const snapshot = await getDocs(scoutingQuery);
      scoutingData = snapshot.docs.map(doc => doc.data());
    }
  } catch (e) {
    console.error('Error fetching scouting data:', e);
  }

  let scoutingHtml = '';
  if (scoutingData.length > 0) {
    const avgAuto = scoutingData.reduce((sum, d) => sum + (d.autoPoints || 0), 0) / scoutingData.length;
    const avgTeleop = scoutingData.reduce((sum, d) => sum + (d.teleopPoints || 0), 0) / scoutingData.length;
    const avgEndgame = scoutingData.reduce((sum, d) => sum + (d.endgamePoints || 0), 0) / scoutingData.length;
    scoutingHtml = `
      <div class="modal-section">
        <h4>📊 Scouting Data (${scoutingData.length} entries)</h4>
        <div class="stats-row">
          <div class="stat-item"><span class="stat-value">${avgAuto.toFixed(1)}</span><span class="stat-label">Avg Auto</span></div>
          <div class="stat-item"><span class="stat-value">${avgTeleop.toFixed(1)}</span><span class="stat-label">Avg Teleop</span></div>
          <div class="stat-item"><span class="stat-value">${avgEndgame.toFixed(1)}</span><span class="stat-label">Avg Endgame</span></div>
        </div>
      </div>
    `;
  }

  teamModalBody.innerHTML = `
    <div class="team-modal-header">
      <img src="${avatarUrl}" alt="" class="team-modal-avatar" onerror="this.style.display='none'">
      <div>
        <h2>Team ${teamNumber}</h2>
        <p class="team-modal-name">${team?.nickname || 'Unknown Team'}</p>
        <p class="team-modal-location">${team?.city || ''}, ${team?.state_prov || ''}</p>
      </div>
    </div>

    <div class="modal-section">
      <h4>📈 EPA Breakdown</h4>
      <div class="epa-breakdown-grid">
        <div class="epa-breakdown-item teleop">
          <span class="epa-value-large">${team?.epa_teleop?.toFixed(1) || '0.0'}</span>
          <span class="epa-label">Teleop</span>
        </div>
        <div class="epa-breakdown-item auto">
          <span class="epa-value-large">${team?.epa_auto?.toFixed(1) || '0.0'}</span>
          <span class="epa-label">Auto</span>
        </div>
        <div class="epa-breakdown-item endgame">
          <span class="epa-value-large">${team?.epa_endgame?.toFixed(1) || '0.0'}</span>
          <span class="epa-label">Endgame</span>
        </div>
        <div class="epa-breakdown-item total">
          <span class="epa-value-large">${team?.epa_total?.toFixed(1) || '0.0'}</span>
          <span class="epa-label">Total</span>
        </div>
      </div>
      <div class="epa-record">
        Record: <strong>${team?.wins || 0}-${team?.losses || 0}</strong>
        ${team?.rank ? ` | Rank: <strong>#${team.rank}</strong>` : ''}
      </div>
    </div>

    ${scoutingHtml}

    <div class="modal-actions">
      <a href="teams.html?team=${teamNumber}" class="btn btn-primary">View Full Stats</a>
      <a href="scout.html?team=${teamNumber}" class="btn btn-secondary">Scout This Team</a>
    </div>
  `;
};

// ============= MATCH MODAL =============
window.showMatchModal = async function(matchKey) {
  if (!matchModal || !matchModalBody) return;

  matchModal.style.display = 'flex';
  matchModalBody.innerHTML = '<div class="loading-spinner"></div>';

  const match = currentMatches.find(m => m.key === matchKey);
  if (!match) {
    matchModalBody.innerHTML = '<p class="error">Match not found</p>';
    return;
  }

  const matchLabel = getMatchLabel(match);
  const redTeamKeys = match.alliances?.red?.team_keys || [];
  const blueTeamKeys = match.alliances?.blue?.team_keys || [];
  const redScore = match.alliances?.red?.score;
  const blueScore = match.alliances?.blue?.score;
  const hasScores = redScore !== null && redScore !== undefined && redScore >= 0;

  // Get team data for both alliances
  const getTeamRow = (teamKey, alliance) => {
    const num = teamKey.replace('frc', '');
    const team = currentTeams.find(t => String(t.team_number) === num);
    const c = team?.epa_percentile ? classifyEPA(team.epa_percentile) : { emoji: '?', color: '#888' };
    const teleopEpa = team?.epa_teleop || 0;
    return `
      <div class="match-team-row ${alliance}" onclick="window.showTeamModal(${num})">
        <span class="team-num">${num}</span>
        <span class="team-name">${team?.nickname || 'Unknown'}</span>
        <span class="team-epa">${teleopEpa > 0 ? teleopEpa.toFixed(1) : 'N/A'}</span>
        <span class="team-class">${c.emoji}</span>
      </div>
    `;
  };

  // Calculate alliance EPAs
  const redEPA = calculateAllianceEPA(redTeamKeys);
  const blueEPA = calculateAllianceEPA(blueTeamKeys);

  // Get scouting data for teams in this match
  let scoutingHtml = '';
  try {
    if (currentEventKey && match.match_number) {
      const matchScoutQuery = query(
        collection(db, 'scouting_entries'),
        where('eventKey', '==', currentEventKey),
        where('matchNumber', '==', match.match_number)
      );
      const snapshot = await getDocs(matchScoutQuery);
      const scoutingData = snapshot.docs.map(doc => doc.data());

      if (scoutingData.length > 0) {
        scoutingHtml = `
          <div class="modal-section">
            <h4>📋 Scouting Data Available</h4>
            <p>${scoutingData.length} scouting entries for this match</p>
          </div>
        `;
      }
    }
  } catch (e) {
    console.error('Error fetching match scouting data:', e);
  }

  let resultHtml = '';
  if (hasScores) {
    const winner = redScore > blueScore ? 'Red' : blueScore > redScore ? 'Blue' : 'Tie';
    const winnerClass = winner === 'Red' ? 'red-win' : winner === 'Blue' ? 'blue-win' : 'tie';
    resultHtml = `
      <div class="match-result-large ${winnerClass}">
        ${winner === 'Tie' ? '⚪ Tie Game' : `${winner === 'Red' ? '🔴' : '🔵'} ${winner} Alliance Wins!`}
        <div class="final-score">${redScore} - ${blueScore}</div>
      </div>
    `;
  } else {
    // Show prediction
    const total = redEPA + blueEPA;
    if (total > 0) {
      const redPct = Math.round((redEPA / total) * 100);
      resultHtml = `
        <div class="match-prediction-large">
          🔮 Prediction: ${redPct > 50 ? 'Red' : 'Blue'} ${Math.max(redPct, 100-redPct)}%
        </div>
      `;
    }
  }

  matchModalBody.innerHTML = `
    <h2>${matchLabel}</h2>

    ${resultHtml}

    <div class="modal-section alliance-section red-section">
      <h4>🔴 Red Alliance <span class="alliance-epa">EPA: ${redEPA.toFixed(1)}</span></h4>
      <div class="alliance-teams">
        ${redTeamKeys.map(k => getTeamRow(k, 'red')).join('')}
      </div>
    </div>

    <div class="modal-section alliance-section blue-section">
      <h4>🔵 Blue Alliance <span class="alliance-epa">EPA: ${blueEPA.toFixed(1)}</span></h4>
      <div class="alliance-teams">
        ${blueTeamKeys.map(k => getTeamRow(k, 'blue')).join('')}
      </div>
    </div>

    ${scoutingHtml}
  `;
};

console.log('🏆 Events module loaded');
