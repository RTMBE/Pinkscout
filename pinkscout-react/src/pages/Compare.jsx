/**
 * =============================================================================
 * COMPARE.JSX - Multi-Team Comparison with Interactive Charts
 * =============================================================================
 *
 * FEATURES:
 * - Compare up to 6 teams side-by-side
 * - Interactive radar charts, bar charts, line charts
 * - Cross-year overlay capability
 * - Multiple metrics: EPA, ECS, Auto, Teleop, Endgame
 *
 * =============================================================================
 */

import { useState, useRef, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  RadialLinearScale,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Bar, Radar, Line } from 'react-chartjs-2';
import { getStatboticsTeam, getTeamYearStats } from '../services/statboticsAPI';
import { getTeamScoutingData } from '../services/scoutingService';
import { searchTeams } from '../services/blueAllianceAPI';
import { scaleStatboticsEPA, getEPAPercentile, classifyEPA, calculateAutoPoints, calculateTeleopPoints } from '../utils/epaUtils';
import { calculateAverageECS, getScoutingConfig, DEFAULT_SCORING_WEIGHTS } from '../services/scoutingConfigService';
import { useAuth } from '../contexts/AuthContext';
import '../styles/Compare.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  RadialLinearScale,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Team colors for chart lines
const TEAM_COLORS = [
  { bg: 'rgba(233, 30, 99, 0.7)', border: '#e91e63' },   // Pink
  { bg: 'rgba(33, 150, 243, 0.7)', border: '#2196F3' },  // Blue
  { bg: 'rgba(76, 175, 80, 0.7)', border: '#4CAF50' },   // Green
  { bg: 'rgba(255, 152, 0, 0.7)', border: '#FF9800' },   // Orange
  { bg: 'rgba(156, 39, 176, 0.7)', border: '#9C27B0' },  // Purple
  { bg: 'rgba(0, 188, 212, 0.7)', border: '#00BCD4' }    // Cyan
];

const MAX_TEAMS = 6;

export default function Compare() {
  const { roleContext } = useAuth();
  
  // State
  const [teams, setTeams] = useState([]);
  const [teamInput, setTeamInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [chartType, setChartType] = useState('radar'); // radar, bar, line
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [searchResults, setSearchResults] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [ecsWeights, setEcsWeights] = useState(DEFAULT_SCORING_WEIGHTS);
  
  const searchInputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const currentYear = new Date().getFullYear();
  
  // Load ECS weights from team configuration
  useEffect(() => {
    async function loadEcsWeights() {
      if (roleContext?.activeTeamId) {
        const config = await getScoutingConfig(roleContext.activeTeamId, selectedYear);
        if (config?.scoring_weights) {
          setEcsWeights(config.scoring_weights);
        }
      } else {
        setEcsWeights(DEFAULT_SCORING_WEIGHTS);
      }
    }
    loadEcsWeights();
  }, [roleContext?.activeTeamId, selectedYear]);

  // Debounced team search
  useEffect(() => {
    const query = teamInput.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setShowSuggestions(false);
      return;
    }

    const timer = setTimeout(async () => {
      const results = await searchTeams(query);
      setSearchResults(results.slice(0, 8));
      setShowSuggestions(results.length > 0);
    }, 300);

    return () => clearTimeout(timer);
  }, [teamInput]);

  // Click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        searchInputRef.current && !searchInputRef.current.contains(e.target) &&
        suggestionsRef.current && !suggestionsRef.current.contains(e.target)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calculate scouting averages
  const calculateScoutingAverages = (scoutingData) => {
    if (!scoutingData || scoutingData.length === 0) {
      return { autoPoints: 0, teleopPoints: 0, endgamePoints: 0, totalPoints: 0, matchCount: 0 };
    }
    let totalAuto = 0, totalTeleop = 0, totalEndgame = 0;
    scoutingData.forEach(entry => {
      totalAuto += calculateAutoPoints(entry);
      totalTeleop += calculateTeleopPoints(entry);
      totalEndgame += entry.endgamePoints || entry.climbPoints || 0;
    });
    const count = scoutingData.length;
    return {
      autoPoints: totalAuto / count,
      teleopPoints: totalTeleop / count,
      endgamePoints: totalEndgame / count,
      totalPoints: (totalAuto + totalTeleop + totalEndgame) / count,
      matchCount: count
    };
  };

  // Add team to comparison
  const addTeam = async (teamNumber) => {
    if (teams.length >= MAX_TEAMS) {
      setError(`Maximum ${MAX_TEAMS} teams allowed`);
      return;
    }
    if (teams.some(t => t.teamNumber === parseInt(teamNumber))) {
      setError('Team already added');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [statboticsResult, scoutingResult, yearStatsResult] = await Promise.allSettled([
        getStatboticsTeam(teamNumber),
        getTeamScoutingData(teamNumber, { roleContext, year: selectedYear }),
        getTeamYearStats(teamNumber, selectedYear)
      ]);

      const statbotics = statboticsResult.status === 'fulfilled' ? statboticsResult.value : null;
      const scouting = scoutingResult.status === 'fulfilled' ? scoutingResult.value : [];
      const yearStats = yearStatsResult.status === 'fulfilled' ? yearStatsResult.value : null;

      if (!statbotics && scouting.length === 0) {
        setError(`No data found for team ${teamNumber}`);
        setLoading(false);
        return;
      }

      const epaValue = statbotics ? scaleStatboticsEPA(statbotics) : 0;
      const epaPercentile = statbotics ? getEPAPercentile(statbotics) : 0;
      const classification = classifyEPA(epaPercentile);
      const scoutingAvg = calculateScoutingAverages(scouting);
      const ecsScore = calculateAverageECS(scouting, ecsWeights);

      setTeams(prev => [...prev, {
        teamNumber: parseInt(teamNumber),
        name: statbotics?.team || `Team ${teamNumber}`,
        epaValue,
        epaPercentile,
        classification,
        scoutingData: scouting,
        scoutingAvg,
        ecsScore,
        yearStats,
        colorIndex: prev.length
      }]);

      setTeamInput('');
      setShowSuggestions(false);
    } catch (err) {
      console.error('Error adding team:', err);
      setError('Failed to fetch team data');
    } finally {
      setLoading(false);
    }
  };

  const removeTeam = (teamNumber) => {
    setTeams(prev => {
      const filtered = prev.filter(t => t.teamNumber !== teamNumber);
      // Reassign color indices
      return filtered.map((t, idx) => ({ ...t, colorIndex: idx }));
    });
  };

  const handleSelectSuggestion = (result) => {
    addTeam(result.team_number);
    setSearchResults([]);
    setShowSuggestions(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const teamNum = teamInput.trim();
    if (teamNum && /^\d+$/.test(teamNum)) {
      addTeam(teamNum);
    }
  };

  // Chart data generators
  const getRadarData = () => ({
    labels: ['EPA', 'ECS', 'Auto', 'Teleop', 'Endgame', 'Consistency'],
    datasets: teams.map(team => ({
      label: `Team ${team.teamNumber}`,
      data: [
        Math.min(100, team.epaPercentile),
        Math.min(100, team.ecsScore * 2),
        Math.min(100, team.scoutingAvg.autoPoints * 3),
        Math.min(100, team.scoutingAvg.teleopPoints * 2),
        Math.min(100, team.scoutingAvg.endgamePoints * 5),
        team.scoutingAvg.matchCount > 0 ? 70 : 30
      ],
      backgroundColor: TEAM_COLORS[team.colorIndex]?.bg || TEAM_COLORS[0].bg,
      borderColor: TEAM_COLORS[team.colorIndex]?.border || TEAM_COLORS[0].border,
      borderWidth: 2,
      pointBackgroundColor: TEAM_COLORS[team.colorIndex]?.border || TEAM_COLORS[0].border
    }))
  });

  const getBarData = () => ({
    labels: teams.map(t => `Team ${t.teamNumber}`),
    datasets: [
      {
        label: 'EPA Points',
        data: teams.map(t => t.epaValue),
        backgroundColor: 'rgba(233, 30, 99, 0.7)',
        borderColor: '#e91e63',
        borderWidth: 1
      },
      {
        label: 'ECS Score',
        data: teams.map(t => t.ecsScore),
        backgroundColor: 'rgba(156, 39, 176, 0.7)',
        borderColor: '#9C27B0',
        borderWidth: 1
      },
      {
        label: 'Avg Auto',
        data: teams.map(t => t.scoutingAvg.autoPoints),
        backgroundColor: 'rgba(33, 150, 243, 0.7)',
        borderColor: '#2196F3',
        borderWidth: 1
      },
      {
        label: 'Avg Teleop',
        data: teams.map(t => t.scoutingAvg.teleopPoints),
        backgroundColor: 'rgba(76, 175, 80, 0.7)',
        borderColor: '#4CAF50',
        borderWidth: 1
      }
    ]
  });

  const getLineData = () => {
    const labels = ['Auto', 'Teleop', 'Endgame', 'Total'];
    return {
      labels,
      datasets: teams.map(team => ({
        label: `Team ${team.teamNumber}`,
        data: [
          team.scoutingAvg.autoPoints,
          team.scoutingAvg.teleopPoints,
          team.scoutingAvg.endgamePoints,
          team.scoutingAvg.totalPoints
        ],
        borderColor: TEAM_COLORS[team.colorIndex]?.border || TEAM_COLORS[0].border,
        backgroundColor: TEAM_COLORS[team.colorIndex]?.bg || TEAM_COLORS[0].bg,
        fill: true,
        tension: 0.4
      }))
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { color: 'var(--text-color)' } },
      title: { display: false }
    },
    scales: chartType !== 'radar' ? {
      x: { ticks: { color: 'var(--text-color)' }, grid: { color: 'var(--border-color)' } },
      y: { ticks: { color: 'var(--text-color)' }, grid: { color: 'var(--border-color)' } }
    } : undefined
  };

  const radarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { color: 'var(--text-color)' } }
    },
    scales: {
      r: {
        angleLines: { color: 'var(--border-color)' },
        grid: { color: 'var(--border-color)' },
        pointLabels: { color: 'var(--text-color)' },
        ticks: { display: false }
      }
    }
  };

  return (
    <div className="compare-page">
      <Helmet>
        <title>Compare Teams - PinkScout</title>
      </Helmet>

      <h2>📊 Team Comparison</h2>
      <p className="page-subtitle">Compare up to {MAX_TEAMS} teams with interactive charts</p>

      {/* Team Input */}
      <div className="content-card">
        <h3>Add Teams to Compare</h3>
        <form onSubmit={handleSubmit} className="compare-form">
          <div className="search-container" ref={searchInputRef}>
            <input
              type="text"
              value={teamInput}
              onChange={(e) => setTeamInput(e.target.value)}
              placeholder="Search team number or name..."
              className="form-input"
              disabled={teams.length >= MAX_TEAMS}
            />
            {showSuggestions && (
              <div className="suggestions-dropdown" ref={suggestionsRef}>
                {searchResults.map(result => (
                  <div
                    key={result.team_number}
                    className="suggestion-item"
                    onClick={() => handleSelectSuggestion(result)}
                  >
                    <strong>{result.team_number}</strong>
                    <span className="suggestion-name">{result.nickname}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading || teams.length >= MAX_TEAMS}>
            {loading ? 'Loading...' : 'Add Team'}
          </button>
        </form>
        {error && <p className="error-message">{error}</p>}

        {/* Team Pills */}
        {teams.length > 0 && (
          <div className="team-pills">
            {teams.map(team => (
              <div
                key={team.teamNumber}
                className="team-pill"
                style={{ borderColor: TEAM_COLORS[team.colorIndex]?.border }}
              >
                <span className="pill-color" style={{ backgroundColor: TEAM_COLORS[team.colorIndex]?.border }} />
                <span className="pill-number">{team.teamNumber}</span>
                <span className="pill-name">{team.name}</span>
                <button className="pill-remove" onClick={() => removeTeam(team.teamNumber)}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Year Selector */}
      {teams.length > 0 && (
        <div className="content-card">
          <div className="compare-controls">
            <div className="control-group">
              <label>Year:</label>
              <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))}>
                {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
            <div className="control-group">
              <label>Chart Type:</label>
              <div className="chart-type-buttons">
                <button className={`chart-btn ${chartType === 'radar' ? 'active' : ''}`} onClick={() => setChartType('radar')}>
                  Radar
                </button>
                <button className={`chart-btn ${chartType === 'bar' ? 'active' : ''}`} onClick={() => setChartType('bar')}>
                  Bar
                </button>
                <button className={`chart-btn ${chartType === 'line' ? 'active' : ''}`} onClick={() => setChartType('line')}>
                  Line
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      {teams.length > 0 && (
        <div className="content-card">
          <h3>Performance Comparison</h3>
          <div className="chart-container">
            {chartType === 'radar' && <Radar data={getRadarData()} options={radarOptions} />}
            {chartType === 'bar' && <Bar data={getBarData()} options={chartOptions} />}
            {chartType === 'line' && <Line data={getLineData()} options={chartOptions} />}
          </div>
        </div>
      )}

      {/* Comparison Table */}
      {teams.length > 0 && (
        <div className="content-card">
          <h3>Detailed Comparison</h3>
          <div className="table-container">
            <table className="data-table comparison-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>EPA</th>
                  <th>ECS</th>
                  <th>Percentile</th>
                  <th>Avg Auto</th>
                  <th>Avg Teleop</th>
                  <th>Avg Endgame</th>
                  <th>Matches</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {teams.map(team => (
                  <tr key={team.teamNumber}>
                    <td data-label="Team">
                      <span className="team-indicator" style={{ backgroundColor: TEAM_COLORS[team.colorIndex]?.border }} />
                      <strong>{team.teamNumber}</strong>
                      <br /><small>{team.name}</small>
                    </td>
                    <td data-label="EPA">{team.epaValue.toFixed(1)}</td>
                    <td data-label="ECS" style={{ color: '#9C27B0', fontWeight: 'bold' }}>{team.ecsScore.toFixed(1)}</td>
                    <td data-label="Percentile">{team.epaPercentile.toFixed(0)}%</td>
                    <td data-label="Avg Auto">{team.scoutingAvg.autoPoints.toFixed(1)}</td>
                    <td data-label="Avg Teleop">{team.scoutingAvg.teleopPoints.toFixed(1)}</td>
                    <td data-label="Avg Endgame">{team.scoutingAvg.endgamePoints.toFixed(1)}</td>
                    <td data-label="Matches">{team.scoutingAvg.matchCount}</td>
                    <td data-label="">
                      <button onClick={() => removeTeam(team.teamNumber)} className="btn btn-danger btn-small">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {teams.length === 0 && (
        <div className="content-card empty-state">
          <div className="empty-icon">📈</div>
          <h3>No Teams Added</h3>
          <p>Search for teams above to start comparing their performance</p>
        </div>
      )}
    </div>
  );
}
