/**
 * =============================================================================
 * RECOMMENDED ALLIANCE PAGE
 * =============================================================================
 * 
 * Helps teams identify optimal alliance partners using scouting data.
 * Uses 90% robot performance stats + 10% ranking points for scoring.
 * 
 * VISIBILITY: Only shows if user has a team number set.
 * 
 * =============================================================================
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../contexts/AuthContext';
import { getTeamEvents, getEventTeams, getEventRankings } from '../services/blueAllianceAPI';
import { getEventScoutingData, calculateTeamAggregates } from '../services/scoutingService';

// Minimum matches required to include a team in recommendations
const MIN_MATCH_THRESHOLD = 1;

export default function RecommendedAlliance() {
  const { userProfile, roleContext } = useAuth();
  const navigate = useNavigate();
  const teamNumber = userProfile?.teamNumber;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventTeams, setEventTeams] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [scoutingData, setScoutingData] = useState([]);
  const [loadingEventData, setLoadingEventData] = useState(false);

  // Current year for fetching events
  const currentYear = new Date().getFullYear();

  // ==========================================================================
  // LOAD TEAM EVENTS ON MOUNT
  // ==========================================================================
  useEffect(() => {
    if (teamNumber) {
      loadTeamEvents();
    }
  }, [teamNumber]);

  const loadTeamEvents = async () => {
    setLoading(true);
    setError('');
    try {
      // Fetch events from current year and past year
      const yearsToFetch = [currentYear, currentYear - 1];
      const eventPromises = yearsToFetch.map(year => getTeamEvents(teamNumber, year));
      const results = await Promise.all(eventPromises);

      // Current year events (or most recent year if current year is empty)
      let currentYearEvents = results[0] || [];
      if (currentYearEvents.length === 0 && results[1]?.length > 0) {
        currentYearEvents = results[1];
      }

      // Sort by start date
      currentYearEvents.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
      setEvents(currentYearEvents);

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
    } catch (err) {
      console.error('Error loading team events:', err);
      setError('Failed to load events. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // SELECT AN EVENT AND LOAD DATA
  // ==========================================================================
  const selectEvent = async (event) => {
    setSelectedEvent(event);
    setLoadingEventData(true);
    setError('');

    try {
      const [teams, rankingsData, scouting] = await Promise.allSettled([
        getEventTeams(event.key),
        getEventRankings(event.key),
        getEventScoutingData(event.key, roleContext)
      ]);

      setEventTeams(teams.status === 'fulfilled' ? teams.value : []);
      setRankings(rankingsData.status === 'fulfilled' ? rankingsData.value : []);
      setScoutingData(scouting.status === 'fulfilled' ? scouting.value : []);
    } catch (err) {
      console.error('Error loading event data:', err);
      setError('Failed to load event data. Please try again.');
    } finally {
      setLoadingEventData(false);
    }
  };

  // ==========================================================================
  // CALCULATE TEAM STATS FROM SCOUTING DATA
  // ==========================================================================
  const teamStats = useMemo(() => {
    const statsMap = new Map();

    // Group scouting entries by team number
    const teamEntries = {};
    for (const entry of scoutingData) {
      const teamNum = entry.teamNumber;
      if (!teamEntries[teamNum]) {
        teamEntries[teamNum] = [];
      }
      teamEntries[teamNum].push(entry);
    }

    // Calculate aggregates for each team
    for (const [teamNum, entries] of Object.entries(teamEntries)) {
      const aggregates = calculateTeamAggregates(entries);
      
      // Count role occurrences
      const roleCounts = { shooter: 0, cycler: 0, defense: 0 };
      for (const entry of entries) {
        if (entry.robotRole && roleCounts.hasOwnProperty(entry.robotRole)) {
          roleCounts[entry.robotRole]++;
        }
      }

      // Determine primary role
      const maxRoleCount = Math.max(...Object.values(roleCounts));
      let primaryRole = 'hybrid';
      if (maxRoleCount > 0) {
        if (roleCounts.shooter === maxRoleCount) primaryRole = 'shooter';
        else if (roleCounts.cycler === maxRoleCount) primaryRole = 'cycler';
        else if (roleCounts.defense === maxRoleCount) primaryRole = 'defense';
      }

      statsMap.set(parseInt(teamNum), {
        ...aggregates,
        primaryRole,
        roleCounts
      });
    }

    return statsMap;
  }, [scoutingData]);

  // ==========================================================================
  // NORMALIZE RANKING POINTS
  // ==========================================================================
  const rankingsMap = useMemo(() => {
    const map = new Map();
    if (!rankings.length) return map;

    // Find max ranking points for normalization
    const maxRankingPoints = Math.max(...rankings.map(r => r.sort_orders?.[0] || 0), 1);

    for (const r of rankings) {
      const teamNum = parseInt(r.team_key?.replace('frc', '') || '0');
      const rankingPoints = r.sort_orders?.[0] || 0;
      map.set(teamNum, {
        rank: r.rank,
        rankingPoints,
        normalizedRP: rankingPoints / maxRankingPoints // 0-1 scale
      });
    }
    return map;
  }, [rankings]);

  // ==========================================================================
  // GET TEAM WITH ALL DATA
  // ==========================================================================
  const getTeamFullData = (teamNum) => {
    const team = eventTeams.find(t => t.team_number === teamNum);
    const stats = teamStats.get(teamNum);
    const ranking = rankingsMap.get(teamNum);
    return {
      teamNumber: teamNum,
      nickname: team?.nickname || `Team ${teamNum}`,
      ...stats,
      rank: ranking?.rank,
      normalizedRP: ranking?.normalizedRP || 0
    };
  };

  // ==========================================================================
  // CATEGORIZE TEAMS INTO SHOOTER, CYCLER, DEFENSE
  // ==========================================================================
  const categorizedTeams = useMemo(() => {
    const shooters = [];
    const cyclers = [];
    const defenders = [];

    for (const team of eventTeams) {
      const teamNum = team.team_number;
      const stats = teamStats.get(teamNum);

      // Exclude teams with insufficient data
      if (!stats || stats.matchCount < MIN_MATCH_THRESHOLD) continue;

      const fullData = getTeamFullData(teamNum);

      // Categorize based on primary role and stats
      if (stats.primaryRole === 'shooter' || (stats.primaryRole === 'hybrid' && stats.avgAutoFuel + stats.avgTeleopFuel > stats.avgCycles)) {
        shooters.push(fullData);
      }
      if (stats.primaryRole === 'cycler' || (stats.primaryRole === 'hybrid' && stats.avgCycles > 0)) {
        cyclers.push(fullData);
      }
      if (stats.primaryRole === 'defense' || stats.roleCounts?.defense > 0) {
        defenders.push(fullData);
      }
    }

    // Sort shooters by average balls scored (auto + teleop), then RP
    shooters.sort((a, b) => {
      const aScore = (a.avgAutoFuel || 0) + (a.avgTeleopFuel || 0);
      const bScore = (b.avgAutoFuel || 0) + (b.avgTeleopFuel || 0);
      if (bScore !== aScore) return bScore - aScore;
      return (b.normalizedRP || 0) - (a.normalizedRP || 0);
    });

    // Sort cyclers by average balls cycled, then RP
    cyclers.sort((a, b) => {
      if ((b.avgCycles || 0) !== (a.avgCycles || 0)) return (b.avgCycles || 0) - (a.avgCycles || 0);
      return (b.normalizedRP || 0) - (a.normalizedRP || 0);
    });

    // Sort defenders: defense count, then cycles, then scoring, then RP
    defenders.sort((a, b) => {
      const aDefCount = a.roleCounts?.defense || 0;
      const bDefCount = b.roleCounts?.defense || 0;
      if (bDefCount !== aDefCount) return bDefCount - aDefCount;
      if ((b.avgCycles || 0) !== (a.avgCycles || 0)) return (b.avgCycles || 0) - (a.avgCycles || 0);
      const aScore = (a.avgAutoFuel || 0) + (a.avgTeleopFuel || 0);
      const bScore = (b.avgAutoFuel || 0) + (b.avgTeleopFuel || 0);
      if (bScore !== aScore) return bScore - aScore;
      return (b.normalizedRP || 0) - (a.normalizedRP || 0);
    });

    return { shooters, cyclers, defenders };
  }, [eventTeams, teamStats, rankingsMap]);

  // ==========================================================================
  // CALCULATE SYNERGY SCORE FOR AN ALLIANCE
  // ==========================================================================
  const calculateSynergyScore = (team1, team2, team3) => {
    // Performance score (normalized 0-100)
    const getPerformanceScore = (t) => {
      const scoring = (t?.avgAutoFuel || 0) + (t?.avgTeleopFuel || 0);
      const cycles = t?.avgCycles || 0;
      const climbRate = t?.climbRate || 0;
      return scoring * 2 + cycles * 1.5 + climbRate * 0.3;
    };

    const p1 = getPerformanceScore(team1);
    const p2 = getPerformanceScore(team2);
    const p3 = getPerformanceScore(team3);
    const totalPerformance = p1 + p2 + p3;

    // Role diversity bonus (favor complementary roles)
    const roles = [team1?.primaryRole, team2?.primaryRole, team3?.primaryRole].filter(Boolean);
    const uniqueRoles = new Set(roles).size;
    const diversityBonus = uniqueRoles === 3 ? 20 : uniqueRoles === 2 ? 10 : 0;

    // Performance score with diversity
    const synergyPerformance = totalPerformance + diversityBonus;

    // Ranking points (averaged, normalized 0-1)
    const avgRP = ((team1?.normalizedRP || 0) + (team2?.normalizedRP || 0) + (team3?.normalizedRP || 0)) / 3;

    // Final score: 90% performance, 10% ranking
    return (0.9 * synergyPerformance) + (0.1 * avgRP * 100);
  };

  // ==========================================================================
  // GENERATE RECOMMENDED ALLIANCES
  // ==========================================================================
  const recommendedAlliances = useMemo(() => {
    const userTeam = getTeamFullData(teamNumber);
    const userRole = userTeam?.primaryRole || 'hybrid';
    const allTeamsWithData = eventTeams
      .map(t => getTeamFullData(t.team_number))
      .filter(t => t.teamNumber !== teamNumber && t.matchCount >= MIN_MATCH_THRESHOLD);

    if (allTeamsWithData.length < 2) {
      return [];
    }

    // Generate candidate alliances
    const candidates = [];
    for (let i = 0; i < allTeamsWithData.length; i++) {
      for (let j = i + 1; j < allTeamsWithData.length; j++) {
        const partner1 = allTeamsWithData[i];
        const partner2 = allTeamsWithData[j];
        const score = calculateSynergyScore(userTeam, partner1, partner2);
        candidates.push({ partner1, partner2, score });
      }
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // Get top 2 distinct alliances (ensure different teams in each)
    const alliances = [];
    const usedTeams = new Set();

    for (const c of candidates) {
      if (alliances.length >= 2) break;

      // For second alliance, try to pick different teams if possible
      if (alliances.length === 1) {
        if (!usedTeams.has(c.partner1.teamNumber) || !usedTeams.has(c.partner2.teamNumber)) {
          alliances.push({
            userTeam,
            partners: [c.partner1, c.partner2],
            score: c.score
          });
          break;
        }
      } else {
        alliances.push({
          userTeam,
          partners: [c.partner1, c.partner2],
          score: c.score
        });
        usedTeams.add(c.partner1.teamNumber);
        usedTeams.add(c.partner2.teamNumber);
      }
    }

    // If we only got 1 alliance, add the second best as fallback
    if (alliances.length === 1 && candidates.length > 1) {
      const fallback = candidates[1];
      alliances.push({
        userTeam,
        partners: [fallback.partner1, fallback.partner2],
        score: fallback.score
      });
    }

    return alliances;
  }, [teamNumber, eventTeams, teamStats, rankingsMap]);

  // ==========================================================================
  // RENDER: NO TEAM NUMBER SET
  // ==========================================================================
  if (!teamNumber) {
    return (
      <>
        <Helmet>
          <title>Recommended Alliance - PinkScout</title>
        </Helmet>
        <header className="page-header">
          <h1>🤝 Recommended Alliance</h1>
          <p>Find optimal alliance partners using scouting data</p>
        </header>
        <div className="content-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🤖</div>
          <h2>Set Your Team Number</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            To see alliance recommendations, you need to set your FRC team number in your profile.
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
        <title>Recommended Alliance - PinkScout</title>
      </Helmet>

      <header className="page-header">
        <h1>🤝 Recommended Alliance</h1>
        <p>Find optimal alliance partners for Team {teamNumber}</p>
      </header>

      {/* Event Selector */}
      <div className="content-card">
        <h3>Select Event</h3>
        {loading ? (
          <p>Loading events...</p>
        ) : events.length === 0 ? (
          <p className="empty-state">No events found for Team {teamNumber}</p>
        ) : (
          <div className="my-matches-event-selector">
            {events.map(event => {
              const isActive = selectedEvent?.key === event.key;
              const isPast = new Date(event.end_date) < new Date();
              const isCurrent = new Date() >= new Date(event.start_date) && new Date() <= new Date(event.end_date);
              return (
                <button
                  key={event.key}
                  className={`event-btn ${isActive ? 'active' : ''} ${isPast ? 'past' : ''} ${isCurrent ? 'current' : ''}`}
                  onClick={() => selectEvent(event)}
                >
                  <span className="event-name">{event.name}</span>
                  <span className="event-date">
                    {new Date(event.start_date).toLocaleDateString()}
                    {isCurrent && ' 🔴 LIVE'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {selectedEvent && !loadingEventData && (
        <>
          {/* Recommended Alliances Section */}
          <div className="content-card">
            <h2 style={{ marginBottom: '1.5rem' }}>🏆 Your Recommended Alliance</h2>
            {recommendedAlliances.length === 0 ? (
              <p className="empty-state">Not enough scouting data to generate recommendations. Scout more teams!</p>
            ) : (
              <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                {recommendedAlliances.map((alliance, idx) => (
                  <div key={idx} className="content-card" style={{ background: 'var(--card-bg-alt)', margin: 0 }}>
                    <h3 style={{ color: idx === 0 ? '#FFD700' : '#C0C0C0', marginBottom: '1rem' }}>
                      {idx === 0 ? '🥇 Top Pick' : '🥈 Alternative'}
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <TeamCard team={alliance.userTeam} isUser={true} />
                      {alliance.partners.map((p, i) => (
                        <TeamCard key={p.teamNumber} team={p} />
                      ))}
                    </div>
                    <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Synergy Score: {alliance.score.toFixed(1)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Alliance Candidate Breakdown - Three Columns */}
          <div className="content-card">
            <h2 style={{ marginBottom: '1.5rem' }}>📊 Alliance Candidate Breakdown</h2>
            <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
              {/* Shooter Bots Column */}
              <div>
                <h3 style={{ color: '#e91e63', marginBottom: '1rem' }}>🎯 Shooter Bots</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Sorted by avg balls scored
                </p>
                {categorizedTeams.shooters.length === 0 ? (
                  <p className="empty-state">No shooters with data</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '400px', overflowY: 'auto' }}>
                    {categorizedTeams.shooters.slice(0, 15).map((team, idx) => (
                      <TeamRowCard key={team.teamNumber} team={team} rank={idx + 1} statLabel="Balls" statValue={(team.avgAutoFuel + team.avgTeleopFuel).toFixed(1)} />
                    ))}
                  </div>
                )}
              </div>

              {/* Cycler Bots Column */}
              <div>
                <h3 style={{ color: '#4CAF50', marginBottom: '1rem' }}>🔄 Cycler Bots</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Sorted by avg balls cycled
                </p>
                {categorizedTeams.cyclers.length === 0 ? (
                  <p className="empty-state">No cyclers with data</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '400px', overflowY: 'auto' }}>
                    {categorizedTeams.cyclers.slice(0, 15).map((team, idx) => (
                      <TeamRowCard key={team.teamNumber} team={team} rank={idx + 1} statLabel="Cycled" statValue={(team.avgCycles || 0).toFixed(1)} />
                    ))}
                  </div>
                )}
              </div>

              {/* Defense Bots Column */}
              <div>
                <h3 style={{ color: '#2196F3', marginBottom: '1rem' }}>🛡️ Defense Bots</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Sorted by defense capability
                </p>
                {categorizedTeams.defenders.length === 0 ? (
                  <p className="empty-state">No defenders with data</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '400px', overflowY: 'auto' }}>
                    {categorizedTeams.defenders.slice(0, 15).map((team, idx) => (
                      <TeamRowCard key={team.teamNumber} team={team} rank={idx + 1} statLabel="Def" statValue={team.roleCounts?.defense || 0} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {loadingEventData && (
        <div className="content-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div className="loading-spinner"></div>
          <p>Loading event data...</p>
        </div>
      )}
    </>
  );
}

// ==========================================================================
// HELPER COMPONENTS
// ==========================================================================

function TeamCard({ team, isUser = false }) {
  const roleColors = {
    shooter: '#e91e63',
    cycler: '#4CAF50',
    defense: '#2196F3',
    hybrid: '#9c27b0'
  };
  const roleColor = roleColors[team?.primaryRole] || '#666';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      padding: '0.75rem',
      background: isUser ? 'rgba(233, 30, 99, 0.1)' : 'var(--card-bg)',
      borderRadius: '0.5rem',
      border: isUser ? '2px solid #e91e63' : '1px solid var(--border-color)'
    }}>
      <div style={{ fontWeight: 'bold', fontSize: '1.25rem', minWidth: '60px' }}>
        {team?.teamNumber}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: '500' }}>{team?.nickname || `Team ${team?.teamNumber}`}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {team?.matchCount || 0} matches scouted
        </div>
      </div>
      <div style={{
        padding: '0.25rem 0.5rem',
        borderRadius: '0.25rem',
        background: roleColor,
        color: 'white',
        fontSize: '0.75rem',
        textTransform: 'capitalize'
      }}>
        {team?.primaryRole || 'N/A'}
      </div>
    </div>
  );
}

function TeamRowCard({ team, rank, statLabel, statValue }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.5rem 0.75rem',
      background: 'var(--card-bg)',
      borderRadius: '0.5rem',
      border: '1px solid var(--border-color)'
    }}>
      <span style={{ fontWeight: 'bold', color: 'var(--text-muted)', minWidth: '24px' }}>#{rank}</span>
      <span style={{ fontWeight: 'bold', minWidth: '50px' }}>{team.teamNumber}</span>
      <span style={{ flex: 1, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {team.nickname}
      </span>
      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        {statLabel}: <strong>{statValue}</strong>
      </span>
      {team.rank && (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Rank #{team.rank}
        </span>
      )}
    </div>
  );
}