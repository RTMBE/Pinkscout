/**
 * =============================================================================
 * MYMATCHES.JSX - My Team's Matches Page
 * =============================================================================
 *
 * WHAT IS THIS PAGE?
 * Shows matches for the user's configured team at their upcoming/recent events.
 * Requires the user to have set their team number in their profile.
 *
 * FEATURES:
 * - Shows user's team events for the current year
 * - Displays matches at each event with scores
 * - Highlights user's team in match lineups
 * - Click on matches to see detailed scouting data
 *
 * =============================================================================
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../contexts/AuthContext';
import { getTeamEvents, getTeamEventMatches, getEventTeams, getEventRankings } from '../services/blueAllianceAPI';
import { getEventTeamStats } from '../services/statboticsAPI';
import { getEventScoutingData } from '../services/scoutingService';
import { classifyEPA, calculateAutoPoints, calculateTeleopPoints } from '../utils/epaUtils';
import { predictMatch } from '../utils/predictionUtils';

export default function MyMatches() {
  const { userProfile, roleContext } = useAuth();
  const navigate = useNavigate();
  const teamNumber = userProfile?.teamNumber;

  // State
  const currentYear = new Date().getFullYear();
  const [displayYear, setDisplayYear] = useState(currentYear);
  const [events, setEvents] = useState([]);
  const [legacyEvents, setLegacyEvents] = useState([]); // Events from past 2 years
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [matches, setMatches] = useState([]);
  const [eventTeams, setEventTeams] = useState([]);
  const [teamStats, setTeamStats] = useState([]);
  const [scoutingData, setScoutingData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [showLegacySection, setShowLegacySection] = useState(false);
  const [teamRanking, setTeamRanking] = useState(null); // Team's ranking at selected event

  // ==========================================================================
  // LOAD TEAM EVENTS
  // ==========================================================================

  useEffect(() => {
    if (!teamNumber) return;
    loadTeamEvents();
  }, [teamNumber, currentYear]);

  const loadTeamEvents = async () => {
    setLoading(true);
    try {
      // Fetch events from current year and past 2 years in parallel
      const yearsToFetch = [currentYear, currentYear - 1, currentYear - 2];
      const eventPromises = yearsToFetch.map(year => getTeamEvents(teamNumber, year));
      const results = await Promise.all(eventPromises);

      // Current year events (or most recent year if current year is empty)
      let currentYearEvents = results[0] || [];
      let yearToDisplay = currentYear;

      // If no events in current year, use most recent year with events
      if (currentYearEvents.length === 0) {
        if (results[1]?.length > 0) {
          currentYearEvents = results[1];
          yearToDisplay = currentYear - 1;
        } else if (results[2]?.length > 0) {
          currentYearEvents = results[2];
          yearToDisplay = currentYear - 2;
        }
      }

      // Legacy events: events from years prior to the display year
      const allLegacyEvents = [];
      yearsToFetch.forEach((year, index) => {
        if (year < yearToDisplay && results[index]?.length > 0) {
          results[index].forEach(event => {
            allLegacyEvents.push({ ...event, year });
          });
        }
      });

      // Sort legacy events by date (most recent first)
      allLegacyEvents.sort((a, b) => new Date(b.start_date) - new Date(a.start_date));

      setDisplayYear(yearToDisplay);
      setEvents(currentYearEvents);
      setLegacyEvents(allLegacyEvents);

      // Auto-select the nearest/most relevant event
      if (currentYearEvents.length > 0) {
        const now = new Date();
        // Find event that's currently happening or next upcoming
        const relevantEvent = currentYearEvents.find(e => {
          const start = new Date(e.start_date);
          const end = new Date(e.end_date);
          end.setDate(end.getDate() + 1); // Include end date
          return now >= start && now <= end;
        }) || currentYearEvents.find(e => new Date(e.start_date) >= now) || currentYearEvents[currentYearEvents.length - 1];

        if (relevantEvent) {
          selectEvent(relevantEvent);
        }
      }
    } catch (error) {
      console.error('Error loading team events:', error);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // SELECT EVENT & LOAD MATCHES
  // ==========================================================================

  const selectEvent = async (event) => {
    setSelectedEvent(event);
    setLoadingMatches(true);
    setMatches([]);
    setTeamRanking(null);

    try {
      const [matchData, teams, stats, scouting, rankings] = await Promise.allSettled([
        getTeamEventMatches(teamNumber, event.key),
        getEventTeams(event.key),
        getEventTeamStats(event.key),
        getEventScoutingData(event.key, roleContext),
        getEventRankings(event.key)
      ]);

      setMatches(matchData.status === 'fulfilled' ? matchData.value : []);
      setEventTeams(teams.status === 'fulfilled' ? teams.value : []);
      setTeamStats(stats.status === 'fulfilled' ? stats.value : []);
      setScoutingData(scouting.status === 'fulfilled' ? scouting.value : []);

      // Find our team's ranking
      if (rankings.status === 'fulfilled' && rankings.value) {
        const ourRanking = rankings.value.find(r => r.team_key === `frc${teamNumber}`);
        setTeamRanking(ourRanking || null);
      }
    } catch (error) {
      console.error('Error loading event matches:', error);
    } finally {
      setLoadingMatches(false);
    }
  };

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  const getMatchLabel = (match) => {
    const levelNames = { qm: 'Qual', ef: 'Eighths', qf: 'Quarters', sf: 'Semis', f: 'Finals' };
    const levelName = levelNames[match.comp_level] || match.comp_level.toUpperCase();
    if (match.comp_level === 'qm') return `${levelName} ${match.match_number}`;
    return `${levelName} ${match.set_number}-${match.match_number}`;
  };

  const isMatchPlayed = (match) => {
    return match.alliances?.red?.score !== null &&
           match.alliances?.red?.score !== undefined &&
           match.alliances?.red?.score >= 0;
  };

  const getTeamLogoUrl = (num) => {
    const year = selectedEvent?.year || currentYear;
    return `https://www.thebluealliance.com/avatar/${year}/frc${num}.png`;
  };

  const isMyTeam = (teamKey) => {
    return teamKey === `frc${teamNumber}`;
  };

  const getTeamAlliance = (match) => {
    if (match.alliances?.red?.team_keys?.includes(`frc${teamNumber}`)) return 'red';
    if (match.alliances?.blue?.team_keys?.includes(`frc${teamNumber}`)) return 'blue';
    return null;
  };

  const didMyTeamWin = (match) => {
    if (!isMatchPlayed(match)) return null;
    const alliance = getTeamAlliance(match);
    if (!alliance) return null;
    const myScore = match.alliances[alliance]?.score || 0;
    const opponentAlliance = alliance === 'red' ? 'blue' : 'red';
    const opponentScore = match.alliances[opponentAlliance]?.score || 0;
    return myScore > opponentScore;
  };

  // Merge team data with EPA stats
  const mergedTeamData = eventTeams.map(team => {
    const stats = teamStats.find(s => s.team === team.team_number);
    return { ...team, ...stats };
  });

  const getTeamScoutingAverages = (num) => {
    const teamData = scoutingData.filter(d => d.teamNumber === num);
    if (teamData.length === 0) return null;
    const avgAuto = teamData.reduce((s, e) => s + calculateAutoPoints(e), 0) / teamData.length;
    const avgTeleop = teamData.reduce((s, e) => s + calculateTeleopPoints(e), 0) / teamData.length;
    return { matchCount: teamData.length, avgAuto: avgAuto.toFixed(1), avgTeleop: avgTeleop.toFixed(1), avgTotal: (avgAuto + avgTeleop).toFixed(1) };
  };

  // Generate match prediction
  const getMatchPrediction = (match) => {
    if (!match || isMatchPlayed(match)) return null;

    const buildAllianceData = (teamKeys) => {
      return {
        teams: (teamKeys || []).map(key => {
          const teamNum = parseInt(key.replace('frc', ''));
          const teamScoutingEntries = scoutingData.filter(d => d.teamNumber === teamNum);
          const statboticsTeamData = teamStats.find(t => t.team === teamNum);
          return {
            teamKey: key,
            scoutingEntries: teamScoutingEntries,
            statboticsData: statboticsTeamData
          };
        })
      };
    };

    const redAlliance = buildAllianceData(match.alliances?.red?.team_keys);
    const blueAlliance = buildAllianceData(match.alliances?.blue?.team_keys);

    return predictMatch(redAlliance, blueAlliance);
  };

  // Get the team's elimination status based on matches
  const getEliminationStatus = () => {
    if (!matches || matches.length === 0) return null;

    // Check for elimination matches (non-qualification)
    const elimMatches = matches.filter(m => m.comp_level !== 'qm');
    if (elimMatches.length === 0) return null;

    // Find the highest level match played or scheduled
    const levelOrder = { ef: 1, qf: 2, sf: 3, f: 4 };
    const levelNames = { ef: 'Round of 16', qf: 'Quarterfinals', sf: 'Semifinals', f: 'Finals' };

    let highestLevel = null;
    let highestLevelKey = null;
    let isEliminated = false;

    elimMatches.forEach(match => {
      const level = levelOrder[match.comp_level];
      if (level && (!highestLevel || level > highestLevel)) {
        highestLevel = level;
        highestLevelKey = match.comp_level;
      }
    });

    if (!highestLevelKey) return null;

    // Check if team was eliminated (lost in this round)
    const highestLevelMatches = elimMatches.filter(m => m.comp_level === highestLevelKey);
    const playedMatches = highestLevelMatches.filter(m => isMatchPlayed(m));

    // In double elimination, check for losses
    const losses = playedMatches.filter(m => didMyTeamWin(m) === false).length;
    const wins = playedMatches.filter(m => didMyTeamWin(m) === true).length;

    // Check if they won the finals
    if (highestLevelKey === 'f') {
      const finalWins = playedMatches.filter(m => didMyTeamWin(m) === true).length;
      if (finalWins > 0 && losses === 0) {
        return { stage: 'Finals', status: 'champion', label: '🏆 Event Champion!' };
      }
    }

    // If we have upcoming matches at this level, show current stage
    const upcomingAtLevel = highestLevelMatches.filter(m => !isMatchPlayed(m));
    if (upcomingAtLevel.length > 0) {
      return { stage: levelNames[highestLevelKey], status: 'active', label: `🔥 In ${levelNames[highestLevelKey]}` };
    }

    // Check elimination based on the stage
    if (losses > 0 && wins === 0) {
      isEliminated = true;
    }

    return {
      stage: levelNames[highestLevelKey],
      status: isEliminated ? 'eliminated' : 'advanced',
      label: isEliminated ? `Eliminated in ${levelNames[highestLevelKey]}` : `Competed in ${levelNames[highestLevelKey]}`
    };
  };

  const eliminationStatus = getEliminationStatus();

  // ==========================================================================
  // RENDER: NO TEAM NUMBER SET
  // ==========================================================================

  if (!teamNumber) {
    return (
      <>
        <Helmet>
          <title>My Matches - PinkScout</title>
        </Helmet>

        <header className="page-header">
          <h1>📅 My Matches</h1>
          <p>View your team's upcoming and recent matches</p>
        </header>

        <div className="content-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🤖</div>
          <h2>Set Your Team Number</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            To see your team's matches, you need to set your FRC team number in your profile.
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/profile')}>
            👤 Go to Profile
          </button>
        </div>
      </>
    );
  }

  // ==========================================================================
  // RENDER: MAIN PAGE
  // ==========================================================================

  return (
    <>
      <Helmet>
        <title>{`My Matches - Team ${teamNumber} - PinkScout`}</title>
      </Helmet>

      <header className="page-header">
        <h1>📅 Team {teamNumber} Matches</h1>
        <p>Your team's matches at {displayYear} events</p>
      </header>

      {/* Event Selector */}
      <div className="content-card">
        <h3>Select Event</h3>
        {loading ? (
          <p>Loading events...</p>
        ) : events.length === 0 ? (
          <p className="empty-state">No events found for Team {teamNumber} in {displayYear} or {displayYear - 1}</p>
        ) : (
          <div className="my-matches-event-selector">
            {events.map(event => {
              const isActive = selectedEvent?.key === event.key;
              const isPast = new Date(event.end_date) < new Date();
              const isCurrent = new Date() >= new Date(event.start_date) && new Date() <= new Date(event.end_date);

              return (
                <button
                  key={event.key}
                  className={`event-selector-btn ${isActive ? 'active' : ''} ${isPast ? 'past' : ''} ${isCurrent ? 'current' : ''}`}
                  onClick={() => selectEvent(event)}
                >
                  <span className="event-name">{event.name}</span>
                  <span className="event-date">{event.start_date}</span>
                  {isCurrent && <span className="event-badge">LIVE</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Match Schedule */}
      {selectedEvent && (
        <div className="content-card">
          <h3>{selectedEvent.name} - Match Schedule</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            📍 {selectedEvent.city}, {selectedEvent.state_prov} • 📅 {selectedEvent.start_date} to {selectedEvent.end_date}
          </p>

          {/* Team Ranking/Status Banner */}
          {!loadingMatches && (teamRanking || eliminationStatus) && (
            <div className="team-status-banner">
              {eliminationStatus ? (
                <div className={`elimination-status ${eliminationStatus.status}`}>
                  <span className="status-label">{eliminationStatus.label}</span>
                </div>
              ) : teamRanking ? (
                <div className="ranking-status">
                  <div className="ranking-position">
                    <span className="rank-number">#{teamRanking.rank}</span>
                    <span className="rank-label">of {teamRanking.num_teams || eventTeams.length} teams</span>
                  </div>
                  <div className="ranking-details">
                    <div className="ranking-stat">
                      <span className="stat-value">{teamRanking.record?.wins || 0}-{teamRanking.record?.losses || 0}-{teamRanking.record?.ties || 0}</span>
                      <span className="stat-label">Record</span>
                    </div>
                    <div className="ranking-stat">
                      <span className="stat-value">{(teamRanking.sort_orders?.[0] || 0).toFixed(2)}</span>
                      <span className="stat-label">Ranking Score</span>
                    </div>
                    {teamRanking.sort_orders?.[1] !== undefined && (
                      <div className="ranking-stat">
                        <span className="stat-value">{(teamRanking.sort_orders[1] || 0).toFixed(2)}</span>
                        <span className="stat-label">Avg Match</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {loadingMatches ? (
            <div className="loading-container"><div className="loading-spinner"></div></div>
          ) : matches.length === 0 ? (
            <p className="empty-state">No matches scheduled yet for your team at this event.</p>
          ) : (
            <div className="my-matches-list">
              {matches.map(match => {
                const played = isMatchPlayed(match);
                const myAlliance = getTeamAlliance(match);
                const won = didMyTeamWin(match);
                const redScore = match.alliances?.red?.score;
                const blueScore = match.alliances?.blue?.score;

                return (
                  <div
                    key={match.key}
                    className={`my-match-card ${played ? 'played' : 'upcoming'} ${won === true ? 'won' : won === false ? 'lost' : ''}`}
                    onClick={() => setSelectedMatch(match)}
                  >
                    <div className="my-match-header">
                      <span className="my-match-label">{getMatchLabel(match)}</span>
                      {played && (
                        <span className={`my-match-result ${won ? 'win' : 'loss'}`}>
                          {won ? '✓ WIN' : '✗ LOSS'}
                        </span>
                      )}
                      {!played && <span className="my-match-upcoming">Upcoming</span>}
                    </div>

                    <div className="my-match-alliances">
                      <div className={`my-match-alliance red ${myAlliance === 'red' ? 'my-team' : ''}`}>
                        <span className="alliance-label">Red</span>
                        <span className="alliance-teams">
                          {match.alliances?.red?.team_keys?.map(t => {
                            const num = t.replace('frc', '');
                            return (
                              <span key={t} className={isMyTeam(t) ? 'highlight-team' : ''}>
                                {num}
                              </span>
                            );
                          }).reduce((prev, curr, i) => i === 0 ? [curr] : [...prev, ' • ', curr], [])}
                        </span>
                        {played && <span className="alliance-score">{redScore}</span>}
                      </div>

                      <div className={`my-match-alliance blue ${myAlliance === 'blue' ? 'my-team' : ''}`}>
                        <span className="alliance-label">Blue</span>
                        <span className="alliance-teams">
                          {match.alliances?.blue?.team_keys?.map(t => {
                            const num = t.replace('frc', '');
                            return (
                              <span key={t} className={isMyTeam(t) ? 'highlight-team' : ''}>
                                {num}
                              </span>
                            );
                          }).reduce((prev, curr, i) => i === 0 ? [curr] : [...prev, ' • ', curr], [])}
                        </span>
                        {played && <span className="alliance-score">{blueScore}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Legacy Events Section */}
      {legacyEvents.length > 0 && (
        <div className="content-card legacy-events-section">
          <div
            className="legacy-events-header"
            onClick={() => setShowLegacySection(!showLegacySection)}
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <h3>📜 Legacy Events</h3>
            <span style={{ fontSize: '1.2rem' }}>{showLegacySection ? '▼' : '▶'}</span>
          </div>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Events from the past 2 years ({currentYear - 2} - {currentYear - 1})
          </p>

          {showLegacySection && (
            <div className="legacy-events-grid">
              {legacyEvents.map(event => {
                const isSelected = selectedEvent?.key === event.key;
                return (
                  <div
                    key={event.key}
                    className={`legacy-event-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => selectEvent(event)}
                  >
                    <div className="legacy-event-year">{event.year}</div>
                    <div className="legacy-event-name">{event.name}</div>
                    <div className="legacy-event-location">📍 {event.city}, {event.state_prov}</div>
                    <div className="legacy-event-date">📅 {event.start_date}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Match Detail Modal */}
      {selectedMatch && (
        <div className="modal-overlay" onClick={() => setSelectedMatch(null)}>
          <div className="modal-content match-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedMatch(null)}>×</button>

            <h2>{getMatchLabel(selectedMatch)}</h2>

            {/* Match Result */}
            {isMatchPlayed(selectedMatch) ? (
              <div className="match-result-summary">
                <div className={`result-alliance red ${
                  selectedMatch.alliances?.red?.score > selectedMatch.alliances?.blue?.score ? 'winner' : ''
                }`}>
                  <span className="result-label">Red Alliance</span>
                  <span className="result-score">{selectedMatch.alliances?.red?.score}</span>
                </div>
                <div className="result-vs">vs</div>
                <div className={`result-alliance blue ${
                  selectedMatch.alliances?.blue?.score > selectedMatch.alliances?.red?.score ? 'winner' : ''
                }`}>
                  <span className="result-label">Blue Alliance</span>
                  <span className="result-score">{selectedMatch.alliances?.blue?.score}</span>
                </div>
              </div>
            ) : (
              (() => {
                const prediction = getMatchPrediction(selectedMatch);
                if (!prediction) {
                  return (
                    <div className="match-upcoming-notice">
                      <span>⏳ Match has not been played yet</span>
                    </div>
                  );
                }
                return (
                  <div className="match-prediction">
                    <div className="prediction-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '1rem', fontWeight: '600' }}>🔮 Match Prediction</span>
                      <span
                        style={{
                          fontSize: '0.8rem',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '0.25rem',
                          backgroundColor: prediction.confidence.color + '20',
                          color: prediction.confidence.color
                        }}
                        title={`Average ${prediction.confidence.avgMatches?.toFixed(1) || 0} scouted matches per team`}
                      >
                        {prediction.confidence.emoji} {prediction.confidence.label}
                      </span>
                    </div>
                    <div className="match-result-summary">
                      <div className={`result-alliance red ${prediction.winner === 'red' ? 'winner' : ''}`}>
                        <span className="result-label">Red Alliance</span>
                        <span className="result-score">{prediction.red.score}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {Math.round(prediction.red.winProbability * 100)}% win
                        </span>
                      </div>
                      <div className="result-vs">vs</div>
                      <div className={`result-alliance blue ${prediction.winner === 'blue' ? 'winner' : ''}`}>
                        <span className="result-label">Blue Alliance</span>
                        <span className="result-score">{prediction.blue.score}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {Math.round(prediction.blue.winProbability * 100)}% win
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ color: '#ef4444' }}>Auto: {prediction.red.auto} | Teleop: {prediction.red.teleop} | End: {prediction.red.endgame}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ color: '#3b82f6' }}>Auto: {prediction.blue.auto} | Teleop: {prediction.blue.teleop} | End: {prediction.blue.endgame}</div>
                      </div>
                    </div>
                    {(prediction.red.synergy !== 1 || prediction.blue.synergy !== 1) && (
                      <div style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Synergy: Red {prediction.red.synergy.toFixed(2)}x | Blue {prediction.blue.synergy.toFixed(2)}x
                      </div>
                    )}
                  </div>
                );
              })()
            )}

            {/* Red Alliance Teams */}
            <div className="modal-section">
              <h3 className="red-text">🔴 Red Alliance</h3>
              <div className="match-teams-grid">
                {selectedMatch.alliances?.red?.team_keys?.map(key => {
                  const teamNum = parseInt(key.replace('frc', ''));
                  const team = mergedTeamData.find(t => t.team_number === teamNum);
                  const scouting = getTeamScoutingAverages(teamNum);
                  const classification = classifyEPA(team?.epa_percentile || 50);

                  return (
                    <div key={key} className={`match-team-card ${isMyTeam(key) ? 'my-team-card' : ''}`}>
                      <Link to={`/teams?team=${teamNum}`} className="match-team-header">
                        <img src={getTeamLogoUrl(teamNum)} alt={`Team ${teamNum}`} className="match-team-logo" onError={(e) => { e.target.style.display = 'none'; }} />
                        <div>
                          <span className="match-team-number">{teamNum}</span>
                          {isMyTeam(key) && <span className="my-team-badge">MY TEAM</span>}
                          <span className="match-team-badge" style={{ backgroundColor: classification.color }}>{classification.emoji}</span>
                        </div>
                      </Link>
                      <div className="match-team-stats">
                        <div className="stat-row"><span>EPA Total:</span><span>{(team?.epa_total || 0).toFixed(1)}</span></div>
                        <div className="stat-row"><span>Rank:</span><span>{team?.rank || 'N/A'}</span></div>
                        {scouting && (
                          <>
                            <div className="stat-row"><span>Avg Auto:</span><span>{scouting.avgAuto}</span></div>
                            <div className="stat-row"><span>Avg Teleop:</span><span>{scouting.avgTeleop}</span></div>
                            <div className="stat-row muted"><span>Scouted:</span><span>{scouting.matchCount} matches</span></div>
                          </>
                        )}
                        {!scouting && <div className="stat-row muted"><span>No scouting data</span></div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Blue Alliance Teams */}
            <div className="modal-section">
              <h3 className="blue-text">🔵 Blue Alliance</h3>
              <div className="match-teams-grid">
                {selectedMatch.alliances?.blue?.team_keys?.map(key => {
                  const teamNum = parseInt(key.replace('frc', ''));
                  const team = mergedTeamData.find(t => t.team_number === teamNum);
                  const scouting = getTeamScoutingAverages(teamNum);
                  const classification = classifyEPA(team?.epa_percentile || 50);

                  return (
                    <div key={key} className={`match-team-card ${isMyTeam(key) ? 'my-team-card' : ''}`}>
                      <Link to={`/teams?team=${teamNum}`} className="match-team-header">
                        <img src={getTeamLogoUrl(teamNum)} alt={`Team ${teamNum}`} className="match-team-logo" onError={(e) => { e.target.style.display = 'none'; }} />
                        <div>
                          <span className="match-team-number">{teamNum}</span>
                          {isMyTeam(key) && <span className="my-team-badge">MY TEAM</span>}
                          <span className="match-team-badge" style={{ backgroundColor: classification.color }}>{classification.emoji}</span>
                        </div>
                      </Link>
                      <div className="match-team-stats">
                        <div className="stat-row"><span>EPA Total:</span><span>{(team?.epa_total || 0).toFixed(1)}</span></div>
                        <div className="stat-row"><span>Rank:</span><span>{team?.rank || 'N/A'}</span></div>
                        {scouting && (
                          <>
                            <div className="stat-row"><span>Avg Auto:</span><span>{scouting.avgAuto}</span></div>
                            <div className="stat-row"><span>Avg Teleop:</span><span>{scouting.avgTeleop}</span></div>
                            <div className="stat-row muted"><span>Scouted:</span><span>{scouting.matchCount} matches</span></div>
                          </>
                        )}
                        {!scouting && <div className="stat-row muted"><span>No scouting data</span></div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="modal-actions">
              <Link to={`/events?event=${selectedEvent?.key}`} className="btn btn-secondary">
                View Full Event
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

