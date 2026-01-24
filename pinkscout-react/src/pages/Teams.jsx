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

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { getStatboticsTeam, getTeamYearStats } from '../services/statboticsAPI';
import { getTeamInfo, getTeamAllAwards, getTeamAwardsForYear, getTeamMatchesForYear, getTeamYearsParticipated } from '../services/blueAllianceAPI';
import { getTeamScoutingData } from '../services/scoutingService';
import { scaleStatboticsEPA, classifyEPA, getEPAPercentile, calculateAutoPoints, calculateTeleopPoints } from '../utils/epaUtils';
import { useAuth } from '../contexts/AuthContext';

export default function Teams() {
  const { roleContext } = useAuth();
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

  // Awards state
  const [allAwards, setAllAwards] = useState([]);
  const [awardsViewMode, setAwardsViewMode] = useState('thisYear'); // 'thisYear' or 'allTime'

  // Record/matches state
  const [recordViewMode, setRecordViewMode] = useState('thisYear'); // 'thisYear' or 'allTime'
  const [thisYearMatches, setThisYearMatches] = useState([]);
  const [allTimeRecord, setAllTimeRecord] = useState({ wins: 0, losses: 0, ties: 0 });
  const [thisYearRecord, setThisYearRecord] = useState({ wins: 0, losses: 0, ties: 0 });

  // Filter state
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState('all');
  const [selectedEvent, setSelectedEvent] = useState('all');

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
    setAllAwards([]);
    setThisYearMatches([]);
    setAllTimeRecord({ wins: 0, losses: 0, ties: 0 });
    setThisYearRecord({ wins: 0, losses: 0, ties: 0 });
    // Reset filters when searching new team
    setSelectedYear('all');
    setSelectedEvent('all');

    try {
      // Fetch data from all sources in parallel, handling individual failures
      const [statboticsResult, tbaResult, scoutingResult, awardsResult, thisYearMatchesResult, thisYearStatsResult] = await Promise.allSettled([
        getStatboticsTeam(number),
        getTeamInfo(number),
        getTeamScoutingData(number, { roleContext }),
        getTeamAllAwards(number),
        getTeamMatchesForYear(number, currentYear),
        getTeamYearStats(number, currentYear)
      ]);

      const statbotics = statboticsResult.status === 'fulfilled' ? statboticsResult.value : null;
      const tba = tbaResult.status === 'fulfilled' ? tbaResult.value : null;
      const scouting = scoutingResult.status === 'fulfilled' ? scoutingResult.value : [];
      const awards = awardsResult.status === 'fulfilled' ? awardsResult.value : [];
      const yearMatches = thisYearMatchesResult.status === 'fulfilled' ? thisYearMatchesResult.value : [];
      const yearStats = thisYearStatsResult.status === 'fulfilled' ? thisYearStatsResult.value : null;

      if (!statbotics && !tba) {
        setError(`Team ${number} not found. Please check the team number.`);
        return;
      }

      setTeamData(statbotics);
      setTbaData(tba);
      setScoutingData(scouting);
      setAllAwards(awards);
      setThisYearMatches(yearMatches);

      // Calculate records
      // All-time record from statbotics base data
      if (statbotics?.record) {
        setAllTimeRecord({
          wins: statbotics.record.wins || 0,
          losses: statbotics.record.losses || 0,
          ties: statbotics.record.ties || 0
        });
      }

      // This year record from year stats or calculate from matches
      if (yearStats?.record) {
        setThisYearRecord({
          wins: yearStats.record.wins || 0,
          losses: yearStats.record.losses || 0,
          ties: yearStats.record.ties || 0
        });
      } else if (yearMatches.length > 0) {
        // Calculate from matches
        let wins = 0, losses = 0, ties = 0;
        yearMatches.forEach(match => {
          if (!match.alliances) return;
          const teamKey = `frc${number}`;
          const isBlue = match.alliances.blue?.team_keys?.includes(teamKey);
          const isRed = match.alliances.red?.team_keys?.includes(teamKey);
          if (!isBlue && !isRed) return;

          const blueScore = match.alliances.blue?.score ?? -1;
          const redScore = match.alliances.red?.score ?? -1;
          if (blueScore < 0 || redScore < 0) return; // Match not played yet

          if (isBlue) {
            if (blueScore > redScore) wins++;
            else if (blueScore < redScore) losses++;
            else ties++;
          } else {
            if (redScore > blueScore) wins++;
            else if (redScore < blueScore) losses++;
            else ties++;
          }
        });
        setThisYearRecord({ wins, losses, ties });
      }
    } catch (err) {
      console.error('Error searching team:', err);
      setError('Failed to fetch team data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // FILTER SCOUTING DATA
  // ==========================================================================

  // Extract unique years and events from scouting data
  const { availableYears, availableEvents } = useMemo(() => {
    const years = new Set();
    const events = new Map(); // eventKey -> eventKey (for display)

    scoutingData.forEach(entry => {
      // Extract year from eventKey (e.g., "2025flor" -> 2025) or eventYear field
      const year = entry.eventYear || (entry.eventKey ? parseInt(entry.eventKey.substring(0, 4)) : null);
      if (year && !isNaN(year)) {
        years.add(year);
      }
      if (entry.eventKey) {
        events.set(entry.eventKey, entry.eventKey);
      }
    });

    return {
      availableYears: [...years].sort((a, b) => b - a),
      availableEvents: [...events.keys()].sort()
    };
  }, [scoutingData]);

  // Filter scouting data based on selected year and event
  const filteredScoutingData = useMemo(() => {
    return scoutingData.filter(entry => {
      // Year filter
      if (selectedYear !== 'all') {
        const entryYear = entry.eventYear || (entry.eventKey ? parseInt(entry.eventKey.substring(0, 4)) : null);
        if (entryYear !== parseInt(selectedYear)) return false;
      }

      // Event filter
      if (selectedEvent !== 'all') {
        if (entry.eventKey !== selectedEvent) return false;
      }

      return true;
    });
  }, [scoutingData, selectedYear, selectedEvent]);

  // Filter available events based on selected year
  const filteredAvailableEvents = useMemo(() => {
    if (selectedYear === 'all') return availableEvents;
    return availableEvents.filter(eventKey => eventKey.startsWith(selectedYear));
  }, [availableEvents, selectedYear]);

  // Reset event selection when year changes
  const handleYearChange = (year) => {
    setSelectedYear(year);
    setSelectedEvent('all');
  };

  // ==========================================================================
  // COMPUTED VALUES
  // ==========================================================================

  const epaValue = teamData ? scaleStatboticsEPA(teamData) : 0;
  const epaPercentile = teamData ? getEPAPercentile(teamData) : 0;
  const classification = classifyEPA(epaPercentile);

  // Get record based on view mode
  const displayRecord = recordViewMode === 'thisYear' ? thisYearRecord : allTimeRecord;
  const wins = displayRecord.wins;
  const losses = displayRecord.losses;
  const ties = displayRecord.ties;
  const totalMatches = wins + losses + ties;
  const winRate = totalMatches > 0 ? ((wins / totalMatches) * 100).toFixed(0) : 'N/A';

  // Filter awards based on view mode
  const displayAwards = useMemo(() => {
    if (awardsViewMode === 'thisYear') {
      return allAwards.filter(award => award.year === currentYear);
    }
    return allAwards;
  }, [allAwards, awardsViewMode, currentYear]);

  // ==========================================================================
  // CALCULATE SCOUTING AVERAGES (using filtered data)
  // ==========================================================================

  const scoutingAvg = filteredScoutingData.length > 0 ? {
    autoPoints: filteredScoutingData.reduce((s, e) => s + calculateAutoPoints(e), 0) / filteredScoutingData.length,
    teleopPoints: filteredScoutingData.reduce((s, e) => s + calculateTeleopPoints(e), 0) / filteredScoutingData.length,
    totalPoints: filteredScoutingData.reduce((s, e) => s + calculateAutoPoints(e) + calculateTeleopPoints(e), 0) / filteredScoutingData.length,
    autoSpeaker: filteredScoutingData.reduce((s, e) => s + (e.autoSpeaker || 0), 0) / filteredScoutingData.length,
    autoAmp: filteredScoutingData.reduce((s, e) => s + (e.autoAmp || 0), 0) / filteredScoutingData.length,
    teleopSpeaker: filteredScoutingData.reduce((s, e) => s + (e.teleopSpeaker || 0), 0) / filteredScoutingData.length,
    teleopAmp: filteredScoutingData.reduce((s, e) => s + (e.teleopAmp || 0), 0) / filteredScoutingData.length,
    bestMatch: Math.max(...filteredScoutingData.map(e => calculateAutoPoints(e) + calculateTeleopPoints(e))),
    matchCount: filteredScoutingData.length
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

                {/* Record Card with Toggle */}
                <div className="overview-card">
                  <div className="overview-card-header">
                    <span className="overview-icon">🏆</span>
                    <span>Record</span>
                    <div className="toggle-switch-mini" style={{ marginLeft: 'auto' }}>
                      <button
                        className={`toggle-btn-mini ${recordViewMode === 'thisYear' ? 'active' : ''}`}
                        onClick={() => setRecordViewMode('thisYear')}
                      >
                        {currentYear}
                      </button>
                      <button
                        className={`toggle-btn-mini ${recordViewMode === 'allTime' ? 'active' : ''}`}
                        onClick={() => setRecordViewMode('allTime')}
                      >
                        All
                      </button>
                    </div>
                  </div>
                  <div className="overview-card-value">{wins}-{losses}-{ties}</div>
                  <div className="overview-card-sub">
                    Win Rate: {winRate}% ({recordViewMode === 'thisYear' ? currentYear : 'All Time'})
                  </div>
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
                    {filteredScoutingData.length} matches {selectedYear !== 'all' || selectedEvent !== 'all' ? '(filtered)' : 'scouted'}
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

                  {/* Year/Event Filter */}
                  {scoutingData.length > 0 && (
                    <div className="scouting-filters" style={{
                      display: 'flex',
                      gap: '1rem',
                      marginBottom: '1rem',
                      flexWrap: 'wrap'
                    }}>
                      <div className="form-group" style={{ flex: '1', minWidth: '120px' }}>
                        <label htmlFor="yearFilter" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Year</label>
                        <select
                          id="yearFilter"
                          value={selectedYear}
                          onChange={(e) => handleYearChange(e.target.value)}
                          style={{ width: '100%' }}
                        >
                          <option value="all">All Years</option>
                          {availableYears.map(year => (
                            <option key={year} value={year}>{year}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group" style={{ flex: '2', minWidth: '180px' }}>
                        <label htmlFor="eventFilter" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Event</label>
                        <select
                          id="eventFilter"
                          value={selectedEvent}
                          onChange={(e) => setSelectedEvent(e.target.value)}
                          style={{ width: '100%' }}
                        >
                          <option value="all">All Events</option>
                          {filteredAvailableEvents.map(eventKey => (
                            <option key={eventKey} value={eventKey}>{eventKey}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {filteredScoutingData.length > 0 && scoutingAvg ? (
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
                  ) : scoutingData.length > 0 ? (
                    <p className="no-data">No scouting data matches the selected filters</p>
                  ) : (
                    <p className="no-data">No scouting data available for this team</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Awards Section */}
          {!loading && !error && (teamData || tbaData) && (
            <div className="content-card awards-section">
              <div className="section-header-with-toggle">
                <h3>🏅 Awards</h3>
                <div className="toggle-switch">
                  <button
                    className={`toggle-btn ${awardsViewMode === 'thisYear' ? 'active' : ''}`}
                    onClick={() => setAwardsViewMode('thisYear')}
                  >
                    {currentYear}
                  </button>
                  <button
                    className={`toggle-btn ${awardsViewMode === 'allTime' ? 'active' : ''}`}
                    onClick={() => setAwardsViewMode('allTime')}
                  >
                    All Time
                  </button>
                </div>
              </div>
              <p className="section-subtitle">
                {awardsViewMode === 'thisYear'
                  ? `Awards won in ${currentYear}`
                  : `All-time awards (${allAwards.length} total)`}
              </p>

              {displayAwards.length > 0 ? (
                <div className="awards-list">
                  {displayAwards.map((award, idx) => (
                    <div key={`${award.event_key}-${award.award_type}-${idx}`} className="award-card">
                      <div className="award-icon">
                        {award.award_type === 0 ? '🌟' :
                         award.award_type === 1 ? '🥇' :
                         award.award_type === 2 ? '🥈' :
                         award.award_type === 69 ? '🔧' :
                         award.award_type === 9 ? '📐' :
                         '🏅'}
                      </div>
                      <div className="award-details">
                        <div className="award-name">{award.name}</div>
                        <div className="award-event">
                          {award.event_key} • {award.year}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="no-data">
                  {awardsViewMode === 'thisYear'
                    ? `No awards won in ${currentYear} yet`
                    : 'No awards on record'}
                </p>
              )}
            </div>
          )}

          {/* Match History */}
          {!loading && !error && filteredScoutingData.length > 0 && (
            <div className="content-card">
              <h3>📜 Match History {selectedYear !== 'all' || selectedEvent !== 'all' ? '(Filtered)' : ''}</h3>
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
                    {filteredScoutingData.map((entry, idx) => {
                      const autoPoints = calculateAutoPoints(entry);
                      const teleopPoints = calculateTeleopPoints(entry);
                      return (
                        <tr key={entry.id || idx}>
                          <td>{entry.matchNumber || '-'}</td>
                          <td>{entry.eventKey || '-'}</td>
                          <td>{autoPoints}</td>
                          <td>{teleopPoints}</td>
                          <td><strong>{autoPoints + teleopPoints}</strong></td>
                          <td>{entry.scouterName || 'Unknown'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Team Notes Section */}
          {filteredScoutingData.length > 0 && (
            <div className="content-card team-notes-section">
              <h3>📝 Team Notes</h3>
              <p className="section-subtitle">
                Notes from scouting entries {selectedYear !== 'all' || selectedEvent !== 'all' ? '(filtered)' : ''}
              </p>
              <div className="team-notes-list">
                {filteredScoutingData
                  .filter(entry => entry.notes && entry.notes.trim())
                  .map((entry, idx) => (
                    <div key={entry.id || idx} className="team-note-card">
                      <div className="note-header">
                        <span className="note-match">Match {entry.matchNumber || '?'}</span>
                        <span className="note-event">{entry.eventKey || 'Unknown Event'}</span>
                        <span className="note-scouter">by {entry.scouterName || 'Unknown'}</span>
                      </div>
                      <div className="note-content">{entry.notes}</div>
                    </div>
                  ))}
                {filteredScoutingData.filter(entry => entry.notes && entry.notes.trim()).length === 0 && (
                  <p className="no-notes">No notes recorded for this team yet.</p>
                )}
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

