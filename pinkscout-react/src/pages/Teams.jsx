/**
 * =============================================================================
 * TEAMS.JSX - Team Search and Stats Page (Matching Original PinkScout Design)
 * =============================================================================
 *
 * FEATURES:
 * - Search by team number with URL param support
 * - Team header with classification badge (Elite, Top Tier, Normal, Below Avg)
 * - Team Overview cards (EPA Rating, Record, Your Scouting)
 * - Data source tabs (Statbotics / Scouting Data)
 * - Split view with colored stat boxes
 * - Match history table
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
      // Fetch data from all sources in parallel, handling individual failures
      const [statboticsResult, tbaResult, scoutingResult] = await Promise.allSettled([
        getStatboticsTeam(number),
        getTeamInfo(number),
        getTeamScoutingData(number)
      ]);

      const statbotics = statboticsResult.status === 'fulfilled' ? statboticsResult.value : null;
      const tba = tbaResult.status === 'fulfilled' ? tbaResult.value : null;
      const scouting = scoutingResult.status === 'fulfilled' ? scoutingResult.value : [];

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

  // Get record from teamData
  const wins = teamData?.record?.wins || 0;
  const losses = teamData?.record?.losses || 0;
  const ties = teamData?.record?.ties || 0;
  const totalMatches = wins + losses + ties;
  const winRate = totalMatches > 0 ? ((wins / totalMatches) * 100).toFixed(0) : 'N/A';

  // ==========================================================================
  // CALCULATE SCOUTING AVERAGES
  // ==========================================================================

  const scoutingAvg = scoutingData.length > 0 ? {
    autoPoints: scoutingData.reduce((s, e) => s + (e.autoPoints || 0), 0) / scoutingData.length,
    teleopPoints: scoutingData.reduce((s, e) => s + (e.teleopPoints || 0), 0) / scoutingData.length,
    totalPoints: scoutingData.reduce((s, e) => s + ((e.autoPoints || 0) + (e.teleopPoints || 0)), 0) / scoutingData.length,
    autoSpeaker: scoutingData.reduce((s, e) => s + (e.autoSpeaker || 0), 0) / scoutingData.length,
    autoAmp: scoutingData.reduce((s, e) => s + (e.autoAmp || 0), 0) / scoutingData.length,
    teleopSpeaker: scoutingData.reduce((s, e) => s + (e.teleopSpeaker || 0), 0) / scoutingData.length,
    teleopAmp: scoutingData.reduce((s, e) => s + (e.teleopAmp || 0), 0) / scoutingData.length,
    bestMatch: Math.max(...scoutingData.map(e => (e.autoPoints || 0) + (e.teleopPoints || 0))),
    matchCount: scoutingData.length
  } : null;

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
        <h1>🔍 Team Search</h1>
        <p>Search for any FRC team to view combined statistics</p>
      </header>

      {/* Search Bar */}
      <div className="content-card search-card">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            value={teamNumber}
            onChange={(e) => setTeamNumber(e.target.value)}
            placeholder="Enter team number (e.g., 254)"
            pattern="[0-9]+"
            title="Enter a team number"
            className="search-input"
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>
      </div>

      {/* Results Container */}
      {(loading || teamData || tbaData || error) && (
        <div id="resultsContainer">
          {/* Loading State */}
          {loading && (
            <div className="content-card">
              <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Loading team data...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="content-card">
              <div className="placeholder-content">
                <div className="icon">🔍</div>
                <h3>No Team Found</h3>
                <p>{error}</p>
              </div>
            </div>
          )}

          {/* Team Header with Classification Badge */}
          {!loading && !error && (teamData || tbaData) && (
            <div className="content-card team-header-card">
              <div className="team-header">
                <div className="team-identity">
                  <h2>{tbaData?.nickname || teamData?.team || `Team ${teamNumber}`}</h2>
                  <span className="team-number-badge">#{teamNumber}</span>
                </div>
                {teamData && (
                  <div className="classification-badge-container">
                    <span
                      className="classification-badge"
                      style={{ backgroundColor: classification.color }}
                    >
                      {classification.emoji} {classification.label}
                    </span>
                    <span className="classification-desc">{classification.description}</span>
                  </div>
                )}
              </div>
              {tbaData && (
                <p className="team-location">
                  {tbaData.city}, {tbaData.state_prov}
                </p>
              )}
            </div>
          )}

          {/* Team Overview - 3 Cards */}
          {!loading && !error && (teamData || tbaData) && (
            <div className="content-card">
              <h3>📊 Team Overview</h3>
              <div className="overview-cards">
                {/* EPA Rating Card */}
                <div className="overview-card epa-card" style={{ borderLeftColor: classification.color }}>
                  <div className="overview-card-header">
                    <span className="overview-icon">📊</span>
                    <span>EPA Rating</span>
                  </div>
                  <div className="overview-card-value">{epaValue.toFixed(1)}</div>
                  <div className="overview-card-sub">
                    Percentile: {epaPercentile.toFixed(0)}%
                    <span className="mini-badge" style={{ color: classification.color }}>
                      {classification.emoji} {classification.label}
                    </span>
                  </div>
                </div>

                {/* Record Card */}
                <div className="overview-card">
                  <div className="overview-card-header">
                    <span className="overview-icon">🏆</span>
                    <span>Record</span>
                  </div>
                  <div className="overview-card-value">{wins}-{losses}-{ties}</div>
                  <div className="overview-card-sub">Win Rate: {winRate}%</div>
                </div>

                {/* Your Scouting Card */}
                <div className="overview-card scouting-card">
                  <div className="overview-card-header">
                    <span className="overview-icon">📋</span>
                    <span>Your Scouting</span>
                  </div>
                  <div className="overview-card-value">
                    {scoutingAvg ? scoutingAvg.totalPoints.toFixed(1) : '0'} pts
                  </div>
                  <div className="overview-card-sub">
                    {scoutingData.length} matches scouted
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Data Sources - Split View */}
          {!loading && !error && (teamData || tbaData) && (
            <div className="split-view">
              {/* Statbotics Data */}
              <div className="split-pane">
                <div className="content-card data-source-card">
                  <h3>📈 Statbotics Data</h3>
                  <p className="pane-subtitle">External EPA rankings and statistics</p>
                  {teamData ? (
                    <div className="stat-boxes-grid">
                      <div className="stat-box epa-box">
                        <div className="stat-box-value" style={{ color: '#e91e63' }}>
                          {epaValue.toFixed(1)}
                        </div>
                        <div className="stat-box-label">EPA</div>
                      </div>
                      <div className="stat-box">
                        <div className="stat-box-value" style={{ color: '#e91e63' }}>
                          {epaPercentile.toFixed(0)}%
                        </div>
                        <div className="stat-box-label">Percentile</div>
                      </div>
                      <div className="stat-box">
                        <div className="stat-box-value">
                          {teamData?.rank || 'N/A'}
                        </div>
                        <div className="stat-box-label">Rank</div>
                      </div>
                      <div className="stat-box">
                        <div className="stat-box-value" style={{ color: '#e91e63' }}>
                          {wins}-{losses}-{ties}
                        </div>
                        <div className="stat-box-label">Record</div>
                      </div>
                      <div className="stat-box">
                        <div className="stat-box-value">
                          {tbaData?.rookie_year || teamData?.rookie_year || 'N/A'}
                        </div>
                        <div className="stat-box-label">Rookie Year</div>
                      </div>
                      <div className="stat-box">
                        <div className="stat-box-value">{teamNumber}</div>
                        <div className="stat-box-label">Team Number</div>
                      </div>
                    </div>
                  ) : (
                    <p className="no-data">No Statbotics data available</p>
                  )}
                </div>
              </div>

              {/* Scouting Data */}
              <div className="split-pane">
                <div className="content-card data-source-card">
                  <h3>📋 Your Scouting Data</h3>
                  <p className="pane-subtitle">Data from your team's observations</p>
                  {scoutingData.length > 0 && scoutingAvg ? (
                    <div className="stat-boxes-grid scouting-boxes">
                      <div className="stat-box">
                        <div className="stat-box-value" style={{ color: '#e91e63' }}>
                          {scoutingAvg.matchCount}
                        </div>
                        <div className="stat-box-label">Matches Scouted</div>
                      </div>
                      <div className="stat-box">
                        <div className="stat-box-value" style={{ color: '#e91e63' }}>
                          {scoutingAvg.totalPoints.toFixed(1)}
                        </div>
                        <div className="stat-box-label">Avg Total</div>
                      </div>
                      <div className="stat-box">
                        <div className="stat-box-value" style={{ color: '#e91e63' }}>
                          {scoutingAvg.autoPoints.toFixed(1)}
                        </div>
                        <div className="stat-box-label">Avg Auto</div>
                      </div>
                      <div className="stat-box">
                        <div className="stat-box-value" style={{ color: '#e91e63' }}>
                          {scoutingAvg.teleopPoints.toFixed(1)}
                        </div>
                        <div className="stat-box-label">Avg Teleop</div>
                      </div>
                      <div className="stat-box">
                        <div className="stat-box-value" style={{ color: '#e91e63' }}>
                          {scoutingAvg.bestMatch}
                        </div>
                        <div className="stat-box-label">Best Match</div>
                      </div>
                      <div className="stat-box">
                        <div className="stat-box-value">Consistent</div>
                        <div className="stat-box-label">Consistency</div>
                      </div>
                    </div>
                  ) : (
                    <p className="no-data">No scouting data available for this team</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Match History */}
          {!loading && !error && scoutingData.length > 0 && (
            <div className="content-card">
              <h3>📜 Match History</h3>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Match</th>
                      <th>Event</th>
                      <th>Auto Pts</th>
                      <th>Teleop Pts</th>
                      <th>Total</th>
                      <th>Scouter</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoutingData.map((entry, idx) => (
                      <tr key={entry.id || idx}>
                        <td>{entry.matchNumber || '-'}</td>
                        <td>{entry.eventKey || '-'}</td>
                        <td>{entry.autoPoints || 0}</td>
                        <td>{entry.teleopPoints || 0}</td>
                        <td><strong>{(entry.autoPoints || 0) + (entry.teleopPoints || 0)}</strong></td>
                        <td>{entry.scouterName || 'Unknown'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* No Results Message (initial state) */}
      {!loading && !error && !teamData && !tbaData && (
        <div className="content-card">
          <div className="placeholder-content">
            <div className="icon">🔍</div>
            <h3>Search for a Team</h3>
            <p>Enter a team number above to view their stats</p>
          </div>
        </div>
      )}
    </>
  );
}

