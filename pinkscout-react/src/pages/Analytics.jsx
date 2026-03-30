/**
 * =============================================================================
 * ANALYTICS.JSX - Team Comparison and Charts
 * =============================================================================
 * 
 * WHAT IS THIS PAGE?
 * Provides analytics and comparison tools:
 * - Compare multiple teams side-by-side
 * - View performance charts
 * - Analyze scouting data trends
 * 
 * FEATURES:
 * - Multi-team comparison
 * - EPA breakdown charts
 * - Scouting data aggregation
 * 
 * =============================================================================
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { getStatboticsTeam } from '../services/statboticsAPI';
import { getTeamScoutingData } from '../services/scoutingService';
import { searchTeams } from '../services/blueAllianceAPI';
import { scaleStatboticsEPA, classifyEPA, getEPAPercentile } from '../utils/epaUtils';
import { useAuth } from '../contexts/AuthContext';
import { useDataSharing } from '../hooks/useDataSharing';
import { getPitScoutingForTeam } from '../services/pitScoutingService';
import { calculateAverageECS, getScoutingConfig, DEFAULT_SCORING_WEIGHTS } from '../services/scoutingConfigService';

export default function Analytics() {
  const { roleContext } = useAuth();
  const { useAllEventData } = useDataSharing();
  // ==========================================================================
  // STATE
  // ==========================================================================

  const [teamInput, setTeamInput] = useState('');
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Event key for pit scouting lookup (optional)
  const [eventKey, setEventKey] = useState(() => {
    return localStorage.getItem('pinkscout_selected_event') || '';
  });

  // Autocomplete state
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [searchingTeams, setSearchingTeams] = useState(false);
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // ECS scoring weights (loaded from team config or defaults)
  const [ecsWeights, setEcsWeights] = useState(DEFAULT_SCORING_WEIGHTS);

  // Load ECS weights from team configuration
  useEffect(() => {
    async function loadEcsWeights() {
      if (roleContext?.teamLeadUid) {
        const config = await getScoutingConfig(roleContext.teamLeadUid, 2026);
        if (config?.scoring_weights) {
          setEcsWeights(config.scoring_weights);
        }
      }
    }
    loadEcsWeights();
  }, [roleContext?.teamLeadUid]);

  // ==========================================================================
  // AUTOCOMPLETE: Search teams as user types
  // ==========================================================================

  const searchTeamsDebounced = useCallback(async (query) => {
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setSearchingTeams(true);
    try {
      const results = await searchTeams(query, 8);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setSelectedSuggestionIndex(-1);
    } catch (err) {
      console.error('Error searching teams:', err);
      setSuggestions([]);
    } finally {
      setSearchingTeams(false);
    }
  }, []);

  // Handle input change with debounce
  const handleInputChange = (e) => {
    const value = e.target.value;
    setTeamInput(value);
    setError('');

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce search by 300ms
    debounceTimerRef.current = setTimeout(() => {
      searchTeamsDebounced(value);
    }, 300);
  };

  // Handle keyboard navigation in suggestions
  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev =>
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[selectedSuggestionIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    }
  };

  // Select a suggestion
  const selectSuggestion = (suggestion) => {
    setTeamInput(suggestion.teamNumber);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    // Focus the input for form submission
    inputRef.current?.focus();
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(e.target) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // ==========================================================================
  // ADD TEAM TO COMPARISON
  // ==========================================================================

  const addTeamByNumber = async (teamNumber) => {
    // Check if already added
    if (teams.some(t => t.teamNumber === teamNumber)) {
      setError('Team already added');
      return;
    }

    setLoading(true);
    setError('');
    setShowSuggestions(false);

    try {
      // Build array of promises - include pit scouting if event key is set
      const promises = [
        getStatboticsTeam(teamNumber),
        getTeamScoutingData(teamNumber, { roleContext, useAllEventData })
      ];

      // Add pit scouting fetch if event key is available
      if (eventKey) {
        promises.push(getPitScoutingForTeam(teamNumber, eventKey, roleContext));
      }

      // Use Promise.allSettled to handle individual failures gracefully
      const results = await Promise.allSettled(promises);

      const statbotics = results[0].status === 'fulfilled' ? results[0].value : null;
      const scouting = results[1].status === 'fulfilled' ? results[1].value : [];
      const pitScouting = results[2]?.status === 'fulfilled' ? results[2].value : null;

      if (!statbotics) {
        setError(`Team ${teamNumber} not found in Statbotics`);
        return;
      }

      const epaValue = scaleStatboticsEPA(statbotics);
      const epaPercentile = getEPAPercentile(statbotics);
      const classification = classifyEPA(epaPercentile);

      // Calculate scouting averages
      const scoutingAvg = calculateScoutingAverages(scouting);

      // Calculate ECS (Estimated Contribution Score) from scouting data
      const ecsScore = calculateAverageECS(scouting, ecsWeights);

      setTeams(prev => [...prev, {
        teamNumber,
        name: statbotics.team || `Team ${teamNumber}`,
        epaValue,
        epaPercentile,
        classification,
        scoutingData: scouting,
        scoutingAvg,
        ecsScore, // NEW: Estimated Contribution Score
        pitScouting // Robot configuration from pit scouting
      }]);

      setTeamInput('');
    } catch (err) {
      console.error('Error adding team:', err);
      setError('Failed to fetch team data');
    } finally {
      setLoading(false);
    }
  };

  const addTeam = async (e) => {
    e.preventDefault();
    if (!teamInput.trim()) return;

    const teamNumber = parseInt(teamInput.trim());

    if (isNaN(teamNumber)) {
      setError('Please enter a valid team number or select from suggestions');
      return;
    }

    await addTeamByNumber(teamNumber);
  };

  // ==========================================================================
  // CALCULATE SCOUTING AVERAGES
  // ==========================================================================
  
  const calculateScoutingAverages = (data) => {
    if (!data || data.length === 0) {
      return { autoPoints: 0, teleopPoints: 0, totalPoints: 0, matchCount: 0 };
    }
    
    let totalAuto = 0;
    let totalTeleop = 0;
    
    data.forEach(entry => {
      const auto = ((entry.autoSpeaker || 0) * 5) + 
                   ((entry.autoAmp || 0) * 2) + 
                   (entry.autoMobility ? 2 : 0);
      const teleop = ((entry.teleopSpeaker || 0) * 2) + 
                     ((entry.teleopAmp || 0) * 1) + 
                     ((entry.amplifiedScored || 0) * 5);
      totalAuto += auto;
      totalTeleop += teleop;
    });
    
    return {
      autoPoints: totalAuto / data.length,
      teleopPoints: totalTeleop / data.length,
      totalPoints: (totalAuto + totalTeleop) / data.length,
      matchCount: data.length
    };
  };

  // ==========================================================================
  // REMOVE TEAM
  // ==========================================================================
  
  const removeTeam = (teamNumber) => {
    setTeams(prev => prev.filter(t => t.teamNumber !== teamNumber));
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  
  return (
    <>
      <Helmet>
        <title>Analytics - PinkScout</title>
        <meta name="description" content="Compare teams and analyze scouting data" />
      </Helmet>

      {/* Page Header */}
      <header className="page-header">
        <h1>📈 Analytics</h1>
        <p>Compare teams and analyze performance data</p>
      </header>

      {/* Add Team Form */}
      <div className="content-card">
        <h3>Compare Teams</h3>
        <form onSubmit={addTeam} className="add-team-form">
          <div className="autocomplete-container" style={{ position: 'relative', flex: 1 }}>
            <input
              ref={inputRef}
              type="text"
              value={teamInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="Enter team number or name (e.g., 254 or Cheesy Poofs)"
              className="search-input"
              autoComplete="off"
              style={{ width: '100%' }}
            />
            {searchingTeams && (
              <span className="autocomplete-loading" style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '12px',
                color: '#888'
              }}>
                🔍
              </span>
            )}
            {showSuggestions && suggestions.length > 0 && (
              <ul
                ref={suggestionsRef}
                className="autocomplete-suggestions"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 1000,
                  backgroundColor: 'var(--surface-color, #fff)',
                  border: '1px solid var(--border-color, #ddd)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  listStyle: 'none',
                  margin: '4px 0 0 0',
                  padding: '4px 0',
                  maxHeight: '300px',
                  overflowY: 'auto'
                }}
              >
                {suggestions.map((suggestion, index) => (
                  <li
                    key={suggestion.teamNumber}
                    onClick={() => selectSuggestion(suggestion)}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      backgroundColor: index === selectedSuggestionIndex
                        ? 'var(--primary-color, #e91e63)'
                        : 'transparent',
                      color: index === selectedSuggestionIndex
                        ? 'white'
                        : 'inherit',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      transition: 'background-color 0.15s'
                    }}
                    onMouseEnter={(e) => {
                      if (index !== selectedSuggestionIndex) {
                        e.currentTarget.style.backgroundColor = 'var(--hover-color, #f5f5f5)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (index !== selectedSuggestionIndex) {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }
                    }}
                  >
                    <span>
                      <strong>{suggestion.teamNumber}</strong>
                      {suggestion.nickname && (
                        <span style={{ marginLeft: '8px', opacity: 0.8 }}>
                          {suggestion.nickname}
                        </span>
                      )}
                    </span>
                    <span style={{
                      fontSize: '11px',
                      opacity: 0.6,
                      textTransform: 'capitalize'
                    }}>
                      {suggestion.matchType?.replace(/_/g, ' ')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Adding...' : '+ Add Team'}
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
      </div>

      {/* No Teams State */}
      {teams.length === 0 && (
        <div className="content-card">
          <div className="empty-state">
            <p>Add teams above to compare their stats</p>
          </div>
        </div>
      )}

      {/* Comparison Table */}
      {teams.length > 0 && (
        <div className="content-card">
          <h3>Team Comparison</h3>
          <div className="table-container">
            <table className="data-table comparison-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Classification</th>
                  <th>EPA Points</th>
                  <th>ECS</th>
                  <th>Percentile</th>
                  <th>Avg Auto</th>
                  <th>Avg Teleop</th>
                  <th>Matches</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {teams.map(team => (
                  <tr key={team.teamNumber}>
                    <td data-label="Team">
                      <strong>{team.teamNumber}</strong>
                      <br />
                      <small>{team.name}</small>
                    </td>
                    <td data-label="Class">
                      <span
                        className="classification-badge"
                        style={{ backgroundColor: team.classification.color }}
                      >
                        {team.classification.emoji} {team.classification.label}
                      </span>
                    </td>
                    <td data-label="EPA">{team.epaValue.toFixed(1)}</td>
                    <td data-label="ECS">
                      <span className="ecs-score" title="Estimated Contribution Score">
                        {team.ecsScore > 0 ? team.ecsScore.toFixed(1) : '—'}
                      </span>
                    </td>
                    <td data-label="Percentile">{team.epaPercentile.toFixed(0)}%</td>
                    <td data-label="Avg Auto">{team.scoutingAvg.autoPoints.toFixed(1)}</td>
                    <td data-label="Avg Teleop">{team.scoutingAvg.teleopPoints.toFixed(1)}</td>
                    <td data-label="Matches">{team.scoutingAvg.matchCount}</td>
                    <td data-label="">
                      <button
                        onClick={() => removeTeam(team.teamNumber)}
                        className="btn btn-danger btn-small"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Visual Comparison */}
      {teams.length > 0 && (
        <div className="content-card">
          <h3>EPA Comparison</h3>
          <div className="bar-chart">
            {teams.map(team => (
              <div key={team.teamNumber} className="bar-row">
                <div className="bar-label">{team.teamNumber}</div>
                <div className="bar-container">
                  <div
                    className="bar"
                    style={{
                      width: `${Math.min(100, team.epaPercentile)}%`,
                      backgroundColor: team.classification.color
                    }}
                  >
                    <span className="bar-value">{team.epaValue.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scouting Data Comparison */}
      {teams.length > 0 && teams.some(t => t.scoutingAvg.matchCount > 0) && (
        <div className="content-card">
          <h3>Scouting Data Comparison</h3>
          <div className="bar-chart">
            {teams.filter(t => t.scoutingAvg.matchCount > 0).map(team => (
              <div key={team.teamNumber} className="bar-row">
                <div className="bar-label">{team.teamNumber}</div>
                <div className="bar-container">
                  <div
                    className="bar bar-auto"
                    style={{
                      width: `${Math.min(100, team.scoutingAvg.autoPoints * 2)}%`
                    }}
                  >
                    <span className="bar-value">Auto: {team.scoutingAvg.autoPoints.toFixed(1)}</span>
                  </div>
                </div>
                <div className="bar-container">
                  <div
                    className="bar bar-teleop"
                    style={{
                      width: `${Math.min(100, team.scoutingAvg.teleopPoints)}%`
                    }}
                  >
                    <span className="bar-value">Teleop: {team.scoutingAvg.teleopPoints.toFixed(1)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pit Scouting / Robot Configuration Comparison */}
      {teams.length > 0 && teams.some(t => t.pitScouting) && (
        <div className="content-card">
          <h3>🔧 Robot Configuration (Pit Scouting)</h3>
          <div className="table-container">
            <table className="data-table comparison-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Drive Type</th>
                  <th>Climb Level</th>
                  <th>Shooter</th>
                  <th>Intake</th>
                  <th>Strategy</th>
                </tr>
              </thead>
              <tbody>
                {teams.filter(t => t.pitScouting).map(team => (
                  <tr key={team.teamNumber}>
                    <td data-label="Team">
                      <strong>{team.teamNumber}</strong>
                      <br />
                      <small>{team.name}</small>
                    </td>
                    <td data-label="Drive">
                      <span className={`drive-badge drive-${team.pitScouting.drive_type || 'unknown'}`}>
                        {formatDriveType(team.pitScouting.drive_type)}
                      </span>
                    </td>
                    <td data-label="Climb">
                      <span className={`climb-badge climb-${team.pitScouting.climb_level || 'none'}`}>
                        {formatClimbLevel(team.pitScouting.climb_level)}
                      </span>
                    </td>
                    <td data-label="Shooter">{formatShooterType(team.pitScouting.shooter_type)}</td>
                    <td data-label="Intake">{formatIntakeType(team.pitScouting.intake_type)}</td>
                    <td data-label="Strategy">
                      <small>{team.pitScouting.preferred_strategy || '—'}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!eventKey && (
            <p style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              💡 Select an event on the Scouting page to see pit scouting data for added teams.
            </p>
          )}
        </div>
      )}
    </>
  );
}

// =============================================================================
// HELPER FUNCTIONS FOR PIT SCOUTING DISPLAY
// =============================================================================

function formatDriveType(driveType) {
  const types = {
    tank: '🛞 Tank',
    mecanum: '⚙️ Mecanum',
    swerve: '🔄 Swerve',
    other: '❓ Other'
  };
  return types[driveType] || '—';
}

function formatClimbLevel(climbLevel) {
  const levels = {
    none: '❌ None',
    level1: '1️⃣ L1',
    level2: '2️⃣ L2',
    level3: '3️⃣ L3 (High)'
  };
  return levels[climbLevel] || '—';
}

function formatShooterType(shooterType) {
  const types = {
    fixed_turret: '🎯 Fixed Turret',
    adjustable_turret: '🔄 Adj. Turret',
    none: '❌ None'
  };
  return types[shooterType] || '—';
}

function formatIntakeType(intakeType) {
  const types = {
    over_bumper: '⬆️ Over Bumper',
    under_bumper: '⬇️ Under Bumper',
    both: '↕️ Both',
    none: '❌ None'
  };
  return types[intakeType] || '—';
}

