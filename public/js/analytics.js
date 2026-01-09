/**
 * ANALYTICS.JS - Team Comparison & Performance Charts
 */

import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { collection, query, where, getDocs, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { signOutUser, getTeamStats, classifyEPA, scaleStatboticsEPA } from './app.js';

const userInfo = document.getElementById('userInfo');
const userEmail = document.getElementById('userEmail');
const logoutBtn = document.getElementById('logoutBtn');
const compareBtn = document.getElementById('compareBtn');
const team1Input = document.getElementById('team1');
const team2Input = document.getElementById('team2');
const comparisonResult = document.getElementById('comparisonResult');
const chartTeam = document.getElementById('chartTeam');
const chartMetric = document.getElementById('chartMetric');
const chartContainer = document.getElementById('chartContainer');

let performanceChart = null;

onAuthStateChanged(auth, (user) => {
  if (!user) { window.location.href = 'login.html'; return; }
  if (userInfo) userInfo.style.display = 'block';
  if (userEmail) userEmail.textContent = user.email;
  loadScoutingSummary();
  loadTeamDropdown();
});

if (logoutBtn) logoutBtn.addEventListener('click', signOutUser);
if (compareBtn) compareBtn.addEventListener('click', compareTeams);
if (chartTeam) chartTeam.addEventListener('change', updateChart);
if (chartMetric) chartMetric.addEventListener('change', updateChart);

async function loadScoutingSummary() {
  try {
    const scoutingRef = collection(db, 'scouting');
    const snapshot = await getDocs(scoutingRef);
    const entries = snapshot.docs.map(doc => doc.data());
    
    const uniqueTeams = new Set(entries.map(e => e.teamNumber));
    const uniqueMatches = new Set(entries.map(e => e.matchNumber));
    
    let totalScore = 0;
    entries.forEach(e => {
      totalScore += (e.autoSpeaker || 0) * 5 + (e.autoAmp || 0) * 2 +
                    (e.teleopSpeaker || 0) * 2 + (e.teleopAmp || 0) * 1;
    });
    
    document.getElementById('totalEntries').textContent = entries.length;
    document.getElementById('teamsScounted').textContent = uniqueTeams.size;
    document.getElementById('matchesScounted').textContent = uniqueMatches.size;
    document.getElementById('avgScore').textContent = entries.length > 0 
      ? Math.round(totalScore / entries.length) : 0;
  } catch (error) {
    console.error('Error loading summary:', error);
  }
}

async function loadTeamDropdown() {
  try {
    const scoutingRef = collection(db, 'scouting');
    const snapshot = await getDocs(scoutingRef);
    const teams = new Set();
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.teamNumber) teams.add(data.teamNumber);
    });
    
    const sorted = Array.from(teams).sort((a, b) => a - b);
    sorted.forEach(team => {
      const option = document.createElement('option');
      option.value = team;
      option.textContent = 'Team ' + team;
      chartTeam.appendChild(option);
    });
  } catch (error) {
    console.error('Error loading teams:', error);
  }
}

async function compareTeams() {
  const t1 = parseInt(team1Input.value);
  const t2 = parseInt(team2Input.value);
  
  if (!t1 || !t2) {
    comparisonResult.innerHTML = '<p class="error">Please enter both team numbers</p>';
    return;
  }
  
  comparisonResult.innerHTML = '<div class="loading-spinner"></div>';
  
  try {
    const [stats1, stats2] = await Promise.all([
      getTeamStats(t1),
      getTeamStats(t2)
    ]);
    
    renderComparison(t1, stats1, t2, stats2);
  } catch (error) {
    comparisonResult.innerHTML = '<p class="error">Error: ' + error.message + '</p>';
  }
}

function renderComparison(t1, s1, t2, s2) {
  const metrics = [
    { label: 'EPA', key: 'epa', format: v => v ? v.toFixed(1) : 'N/A' },
    { label: 'Avg Auto', key: 'avgAuto', format: v => v ? v.toFixed(1) : '0' },
    { label: 'Avg Teleop', key: 'avgTeleop', format: v => v ? v.toFixed(1) : '0' },
    { label: 'Matches', key: 'matchCount', format: v => v || 0 }
  ];
  
  let html = '<div class="comparison-table"><table class="data-table">';
  html += '<thead><tr><th>Metric</th><th>Team ' + t1 + '</th><th>Team ' + t2 + '</th><th>Winner</th></tr></thead><tbody>';
  
  metrics.forEach(m => {
    const v1 = s1 ? s1[m.key] : null;
    const v2 = s2 ? s2[m.key] : null;
    const winner = v1 > v2 ? t1 : (v2 > v1 ? t2 : 'Tie');
    html += '<tr><td>' + m.label + '</td><td>' + m.format(v1) + '</td><td>' + m.format(v2) + '</td><td class="winner">' + winner + '</td></tr>';
  });
  
  html += '</tbody></table></div>';
  comparisonResult.innerHTML = html;
}

async function updateChart() {
  const teamNum = parseInt(chartTeam.value);
  const metric = chartMetric.value;
  
  if (!teamNum) return;
  
  try {
    const scoutingRef = collection(db, 'scouting');
    const q = query(scoutingRef, where('teamNumber', '==', teamNum), orderBy('timestamp', 'asc'));
    const snapshot = await getDocs(q);
    const entries = snapshot.docs.map(doc => doc.data());
    
    const labels = entries.map((e, i) => 'Match ' + (e.matchNumber || i + 1));
    const data = entries.map(e => calculateMetric(e, metric));
    
    if (performanceChart) performanceChart.destroy();
    
    const ctx = document.getElementById('performanceChart').getContext('2d');
    performanceChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Team ' + teamNum + ' - ' + metric,
          data: data,
          borderColor: '#e91e63',
          backgroundColor: 'rgba(233, 30, 99, 0.1)',
          fill: true,
          tension: 0.3
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  } catch (error) {
    console.error('Error updating chart:', error);
  }
}

function calculateMetric(entry, metric) {
  switch (metric) {
    case 'autoPoints': return (entry.autoSpeaker || 0) * 5 + (entry.autoAmp || 0) * 2;
    case 'teleopPoints': return (entry.teleopSpeaker || 0) * 2 + (entry.teleopAmp || 0) * 1;
    case 'climbSuccess': return entry.climbStatus === 'climbed' ? 1 : 0;
    default: return (entry.autoSpeaker || 0) * 5 + (entry.autoAmp || 0) * 2 + 
                    (entry.teleopSpeaker || 0) * 2 + (entry.teleopAmp || 0) * 1;
  }
}

console.log('📊 Analytics module loaded');

