/**
 * =============================================================================
 * TEAMS.JSX - Team Search and Stats Page
 * =============================================================================
 * 
 * WHAT IS THIS PAGE?
 * Allows users to search for FRC teams and view their stats:
 * - Search by team number
 * - View EPA rating and classification
 * - See team info from TBA
 * - View scouting data for the team
 * 
 * DATA SOURCES:
 * - Statbotics API for EPA data
 * - The Blue Alliance API for team info
 * - Firestore for scouting data
 * 
 * =============================================================================
 */

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { getStatboticsTeam } from '../services/statboticsAPI';
import { getTeamInfo } from '../services/blueAllianceAPI';
import { getTeamScoutingData } from '../services/scoutingService';
import { scaleStatboticsEPA, classifyEPA, getEPAPercentile } from '../utils/epaUtils';

export default function Teams() {
  // ==========================================================================
  // STATE
  // ==========================================================================
  
  const [searchParams, setSearchParams] = useSearchParams();
  const [teamNumber, setTeamNumber] = useState(searchParams.get('team') || '');
  const [teamData, setTeamData] = useState(null);
  const [tbaData, setTbaData] = useState(null);
  const [scoutingData, setScoutingData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ==========================================================================
  // SEARCH ON URL PARAM CHANGE
  // ==========================================================================
  
  useEffect(() => {
    const teamParam = searchParams.get('team');
    if (teamParam) {
      setTeamNumber(teamParam);
      searchTeam(teamParam);
    }
  }, [searchParams]);

  // ==========================================================================
  // SEARCH HANDLER
  // ==========================================================================
  
  const handleSearch = (e) => {
    e.preventDefault();
    if (!teamNumber.trim()) return;
    
    // Update URL
    setSearchParams({ team: teamNumber.trim() });
    searchTeam(teamNumber.trim());
  };

  const searchTeam = async (number) => {
    setLoading(true);
    setError(null);
    setTeamData(null);
    setTbaData(null);
    setScoutingData([]);

    try {
      // Fetch data from all sources in parallel
      const [statbotics, tba, scouting] = await Promise.all([
        getStatboticsTeam(number),
        getTeamInfo(number),
        getTeamScoutingData(number)
      ]);

      if (!statbotics && !tba) {
        setError(`Team ${number} not found. Please check the team number.`);
        return;
      }

      setTeamData(statbotics);
      setTbaData(tba);
      setScoutingData(scouting);
    } catch (err) {
      console.error('Error searching team:', err);
      setError('Failed to fetch team data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // COMPUTED VALUES
  // ==========================================================================
  
  const epaValue = teamData ? scaleStatboticsEPA(teamData) : 0;
  const epaPercentile = teamData ? getEPAPercentile(teamData) : 0;
  const classification = classifyEPA(epaPercentile);

  // ==========================================================================
  // RENDER
  // ==========================================================================
  
  return (
    <>
      <Helmet>
        <title>Teams - PinkScout</title>
        <meta name="description" content="Search FRC teams and view their EPA ratings" />
      </Helmet>

      {/* Page Header */}
      <header className="page-header">
        <h1>🤖 Team Search</h1>
        <p>Look up any FRC team to see their EPA rating and stats</p>
      </header>

      {/* Search Form */}
      <div className="content-card">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="number"
            value={teamNumber}
            onChange={(e) => setTeamNumber(e.target.value)}
            placeholder="Enter team number (e.g., 1551)"
            className="search-input search-input-large"
            min="1"
            max="99999"
          />
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Searching...' : '🔍 Search'}
          </button>
        </form>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="content-card">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Fetching team data...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="content-card">
          <div className="error-message">{error}</div>
        </div>
      )}

      {/* Team Results */}
      {!loading && !error && (teamData || tbaData) && (
        <>
          {/* Team Header Card */}
          <div className="content-card team-header-card">
            <div className="team-header">
              <div className="team-number-large">
                {teamNumber}
              </div>
              <div className="team-info">
                <h2>{tbaData?.nickname || teamData?.team || `Team ${teamNumber}`}</h2>
                {tbaData && (
                  <p className="team-location">
                    📍 {tbaData.city}, {tbaData.state_prov}, {tbaData.country}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* EPA Stats Card */}
          {teamData && (
            <div className="content-card">
              <h3>EPA Rating</h3>
              <div className="epa-display">
                <div
                  className="epa-badge"
                  style={{ backgroundColor: classification.color }}
                >
                  <span className="epa-emoji">{classification.emoji}</span>
                  <span className="epa-label">{classification.label}</span>
                </div>
                <div className="epa-details">
                  <div className="epa-stat">
                    <span className="epa-stat-value">{epaValue.toFixed(1)}</span>
                    <span className="epa-stat-label">EPA Points</span>
                  </div>
                  <div className="epa-stat">
                    <span className="epa-stat-value">{epaPercentile.toFixed(0)}%</span>
                    <span className="epa-stat-label">Percentile</span>
                  </div>
                </div>
              </div>
              <p className="epa-description">{classification.description}</p>
            </div>
          )}

          {/* Scouting Data Card */}
          <div className="content-card">
            <h3>Your Team's Scouting Data</h3>
            {scoutingData.length === 0 ? (
              <p className="empty-state-text">
                No scouting data for this team yet.
              </p>
            ) : (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Match</th>
                      <th>Event</th>
                      <th>Auto Pts</th>
                      <th>Teleop Pts</th>
                      <th>Scouter</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoutingData.map(entry => (
                      <tr key={entry.id}>
                        <td>{entry.matchNumber || '-'}</td>
                        <td>{entry.eventKey || '-'}</td>
                        <td>
                          {((entry.autoSpeaker || 0) * 5) +
                           ((entry.autoAmp || 0) * 2) +
                           (entry.autoMobility ? 2 : 0)}
                        </td>
                        <td>
                          {((entry.teleopSpeaker || 0) * 2) +
                           ((entry.teleopAmp || 0) * 1) +
                           ((entry.amplifiedScored || 0) * 5)}
                        </td>
                        <td>{entry.scouterName || 'Unknown'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

