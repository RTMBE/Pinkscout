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

import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { getStatboticsTeam } from '../services/statboticsAPI';
import { getTeamScoutingData } from '../services/scoutingService';
import { scaleStatboticsEPA, classifyEPA, getEPAPercentile } from '../utils/epaUtils';
import { useAuth } from '../contexts/AuthContext';

export default function Analytics() {
  const { roleContext } = useAuth();
  // ==========================================================================
  // STATE
  // ==========================================================================
  
  const [teamInput, setTeamInput] = useState('');
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ==========================================================================
  // ADD TEAM TO COMPARISON
  // ==========================================================================
  
  const addTeam = async (e) => {
    e.preventDefault();
    if (!teamInput.trim()) return;
    
    const teamNumber = parseInt(teamInput.trim());
    
    // Check if already added
    if (teams.some(t => t.teamNumber === teamNumber)) {
      setError('Team already added');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      // Use Promise.allSettled to handle individual failures gracefully
      const [statboticsResult, scoutingResult] = await Promise.allSettled([
        getStatboticsTeam(teamNumber),
        getTeamScoutingData(teamNumber, { roleContext })
      ]);

      const statbotics = statboticsResult.status === 'fulfilled' ? statboticsResult.value : null;
      const scouting = scoutingResult.status === 'fulfilled' ? scoutingResult.value : [];

      if (!statbotics) {
        setError(`Team ${teamNumber} not found in Statbotics`);
        return;
      }

      const epaValue = scaleStatboticsEPA(statbotics);
      const epaPercentile = getEPAPercentile(statbotics);
      const classification = classifyEPA(epaPercentile);

      // Calculate scouting averages
      const scoutingAvg = calculateScoutingAverages(scouting);

      setTeams(prev => [...prev, {
        teamNumber,
        name: statbotics.team || `Team ${teamNumber}`,
        epaValue,
        epaPercentile,
        classification,
        scoutingData: scouting,
        scoutingAvg
      }]);

      setTeamInput('');
    } catch (err) {
      console.error('Error adding team:', err);
      setError('Failed to fetch team data');
    } finally {
      setLoading(false);
    }
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
          <input
            type="number"
            value={teamInput}
            onChange={(e) => setTeamInput(e.target.value)}
            placeholder="Enter team number"
            className="search-input"
            min="1"
            max="99999"
          />
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
                  <th>Percentile</th>
                  <th>Avg Auto (Scouted)</th>
                  <th>Avg Teleop (Scouted)</th>
                  <th>Matches Scouted</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {teams.map(team => (
                  <tr key={team.teamNumber}>
                    <td>
                      <strong>{team.teamNumber}</strong>
                      <br />
                      <small>{team.name}</small>
                    </td>
                    <td>
                      <span
                        className="classification-badge"
                        style={{ backgroundColor: team.classification.color }}
                      >
                        {team.classification.emoji} {team.classification.label}
                      </span>
                    </td>
                    <td>{team.epaValue.toFixed(1)}</td>
                    <td>{team.epaPercentile.toFixed(0)}%</td>
                    <td>{team.scoutingAvg.autoPoints.toFixed(1)}</td>
                    <td>{team.scoutingAvg.teleopPoints.toFixed(1)}</td>
                    <td>{team.scoutingAvg.matchCount}</td>
                    <td>
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
    </>
  );
}

