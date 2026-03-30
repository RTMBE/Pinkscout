/**
 * =============================================================================
 * EVENTS.JSX - Event Browser Page (Redesigned)
 * =============================================================================
 *
 * WHAT IS THIS PAGE?
 * Browse FRC events with a search-first approach:
 * 1. SEARCH VIEW: Large centered search bar to find events
 * 2. EVENT DETAIL VIEW: Full page with teams, leaderboard, and match schedule
 * 3. MATCH MODAL: Click a match to see scores, winner, and team scouting data
 *
 * DATA SOURCES:
 * - The Blue Alliance API for event data
 * - Statbotics API for team EPA at events
 * - Supabase for scouting data
 *
 * =============================================================================
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { getEventList, getEventTeams, getEventMatches, getEventRankings, getEventAwards, forceRefreshMatches, forceRefreshRankings } from '../services/blueAllianceAPI';
import { getEventTeamStats } from '../services/statboticsAPI';
import { getEventScoutingData, getCrossEventScoutingData } from '../services/scoutingService';
import { getSavedEvents, toggleSaveEvent, isEventSaved } from '../services/savedEventsService';
import { classifyEPA, getEPAPercentile, calculateAutoPoints, calculateTeleopPoints } from '../utils/epaUtils';
import { predictMatch } from '../utils/predictionUtils';
import { useAuth } from '../contexts/AuthContext';
import { useDataSharing } from '../hooks/useDataSharing';

// =============================================================================
// TEAM LOGO COMPONENT - Shows team logo with fallback avatar
// =============================================================================
/**
 * Shows the team logo from The Blue Alliance, or a fallback avatar with
 * the first digit of the team number if the logo fails to load.
 */
function TeamLogo({ teamNumber, year, className = 'team-logo', alt }) {
  const [hasError, setHasError] = useState(false);
  const logoUrl = `https://www.thebluealliance.com/avatar/${year}/frc${teamNumber}.png`;

  // Get first digit of team number for fallback
  const firstDigit = String(teamNumber).charAt(0);

  // Generate a consistent color based on team number
  const colors = ['#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#f39c12', '#1abc9c', '#e91e63', '#00bcd4', '#ff5722', '#607d8b'];
  const colorIndex = teamNumber % colors.length;
  const bgColor = colors[colorIndex];

  // Determine size based on className
  let size = '48px'; // default for .team-logo
  let fontSize = '1.2rem';
  if (className.includes('match-team-logo')) {
    size = '32px';
    fontSize = '0.9rem';
  } else if (className.includes('award-team-logo')) {
    size = '24px';
    fontSize = '0.7rem';
  }

  if (hasError) {
    return (
      <div
        className={`${className} team-logo-fallback`}
        style={{
          width: size,
          height: size,
          minWidth: size,
          minHeight: size,
          backgroundColor: bgColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 'bold',
          fontSize: fontSize,
          borderRadius: '4px',
          flexShrink: 0
        }}
        title={alt || `Team ${teamNumber}`}
      >
        {firstDigit}
      </div>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={alt || `Team ${teamNumber}`}
      className={className}
      onError={() => setHasError(true)}
    />
  );
}

export default function Events() {
  const { roleContext } = useAuth();
  const { useAllEventData } = useDataSharing();
  // ==========================================================================
  // STATE
  // ==========================================================================

  const currentYear = new Date().getFullYear();

  // View state: 'search' or 'detail'
  const [view, setView] = useState('search');

  // Search state
  const [year, setYear] = useState(currentYear);
  const [events, setEvents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Event detail state
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventTeams, setEventTeams] = useState([]);
  const [eventMatches, setEventMatches] = useState([]);
  const [eventRankings, setEventRankings] = useState([]);
  const [eventAwards, setEventAwards] = useState([]);
  const [teamStats, setTeamStats] = useState([]);
  const [scoutingData, setScoutingData] = useState([]);
  const [crossEventScoutingData, setCrossEventScoutingData] = useState({});  // Cross-event scouting data by team number
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [activeTab, setActiveTab] = useState('teams');

  // Match modal state
  const [selectedMatch, setSelectedMatch] = useState(null);

  // Leaderboard sorting state
  const [sortBy, setSortBy] = useState('rank'); // 'rank', 'epa_total', 'epa_auto', 'epa_teleop', 'wins'
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' or 'desc'

  // Saved events state
  const [savedEvents, setSavedEvents] = useState([]);
  const [savedEventKeys, setSavedEventKeys] = useState(new Set());
  const [loadingSavedEvents, setLoadingSavedEvents] = useState(true);

  // Auto-refresh state for real-time updates
  const [lastRefresh, setLastRefresh] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollIntervalRef = useRef(null);

  // ==========================================================================
  // LOAD SAVED EVENTS ON MOUNT
  // ==========================================================================

  useEffect(() => {
    loadSavedEvents();
  }, []);

  const loadSavedEvents = async () => {
    try {
      setLoadingSavedEvents(true);
      const saved = await getSavedEvents();
      setSavedEvents(saved);
      setSavedEventKeys(new Set(saved.map(e => e.event_key)));
    } catch (err) {
      console.error('Error loading saved events:', err);
    } finally {
      setLoadingSavedEvents(false);
    }
  };

  // ==========================================================================
  // LOAD EVENTS ON MOUNT/YEAR CHANGE
  // ==========================================================================

  useEffect(() => {
    loadEvents();
  }, [year]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const eventList = await getEventList(year);
      setEvents(eventList);
    } catch (err) {
      console.error('Error loading events:', err);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // SELECT AN EVENT - LOAD FULL DETAILS
  // ==========================================================================

  const selectEvent = async (event) => {
    setSelectedEvent(event);
    setView('detail');
    setLoadingDetails(true);
    setActiveTab('teams');
    setCrossEventScoutingData({});  // Reset cross-event data

    // Reset non-critical data while loading
    setTeamStats([]);
    setEventAwards([]);

    // PHASE 1: Load critical data first (teams, matches, rankings, scouting)
    // These are required for the initial view - load in parallel for speed
    const [teamsResult, matchesResult, rankingsResult, scoutingResult] = await Promise.allSettled([
      getEventTeams(event.key),
      getEventMatches(event.key),
      getEventRankings(event.key),
      getEventScoutingData(event.key, roleContext, { useAllEventData })
    ]);

    // Extract critical values with fallbacks
    const teams = teamsResult.status === 'fulfilled' ? teamsResult.value : [];
    const matches = matchesResult.status === 'fulfilled' ? matchesResult.value : [];
    const rankings = rankingsResult.status === 'fulfilled' ? rankingsResult.value : [];
    const scouting = scoutingResult.status === 'fulfilled' ? scoutingResult.value : [];

    // Log any critical errors
    [teamsResult, matchesResult, rankingsResult, scoutingResult].forEach((result, i) => {
      if (result.status === 'rejected') {
        const names = ['teams', 'matches', 'rankings', 'scouting'];
        console.warn(`Failed to load ${names[i]}:`, result.reason);
      }
    });

    // Set critical data immediately - user can start viewing
    setEventTeams(teams);
    setEventMatches(matches);
    setEventRankings(rankings);
    setScoutingData(scouting);
    setLoadingDetails(false);  // Show content now!

    if (import.meta.env.DEV) {
      console.log('Critical event data loaded:', {
        teams: teams.length,
        matches: matches.length,
        rankings: rankings.length,
        scouting: scouting.length
      });
    }

    // PHASE 2: Load non-critical data asynchronously (stats, awards)
    // These are optional enhancements - load in background
    Promise.allSettled([
      getEventTeamStats(event.key),
      getEventAwards(event.key)
    ]).then(([statsResult, awardsResult]) => {
      const stats = statsResult.status === 'fulfilled' ? statsResult.value : [];
      const awards = awardsResult.status === 'fulfilled' ? awardsResult.value : [];

      setTeamStats(stats);
      setEventAwards(awards);

      if (import.meta.env.DEV) {
        console.log('Secondary event data loaded:', {
          stats: stats.length,
          awards: awards.length
        });
      }
    });

    // PHASE 3: Load cross-event scouting data (async, non-blocking)
    // This enables cross-event scouting decay for match predictions
    if (teams.length > 0) {
      const teamNumbers = teams.map(t => t.team_number).filter(Boolean);
      getCrossEventScoutingData(teamNumbers, roleContext, { useAllEventData })
        .then(crossEventData => {
          setCrossEventScoutingData(crossEventData);
          if (import.meta.env.DEV) {
            const totalEntries = Object.values(crossEventData).reduce((sum, arr) => sum + arr.length, 0);
            console.log(`Cross-event scouting loaded: ${totalEntries} entries for ${Object.keys(crossEventData).length} teams`);
          }
        })
        .catch(err => {
          console.warn('Failed to load cross-event scouting data:', err);
        });
    }
  };

  // ==========================================================================
  // BACK TO SEARCH
  // ==========================================================================

  const backToSearch = () => {
    setView('search');
    setSelectedEvent(null);
    setSelectedMatch(null);
  };

  // ==========================================================================
  // TOGGLE SAVE EVENT
  // ==========================================================================

  const handleToggleSave = async (event, e) => {
    e?.stopPropagation(); // Prevent triggering event selection
    try {
      const isSaved = await toggleSaveEvent(event);
      if (isSaved) {
        setSavedEventKeys(prev => new Set([...prev, event.key]));
        setSavedEvents(prev => [...prev, { event_key: event.key, event_name: event.name, cached_data: event }]);
      } else {
        setSavedEventKeys(prev => {
          const next = new Set(prev);
          next.delete(event.key);
          return next;
        });
        setSavedEvents(prev => prev.filter(e => e.event_key !== event.key));
      }
    } catch (err) {
      console.error('Error toggling save:', err);
    }
  };

  // ==========================================================================
  // REAL-TIME POLLING FOR LIVE EVENTS
  // ==========================================================================

  const refreshEventData = useCallback(async () => {
    if (!selectedEvent) return;

    try {
      const [newMatches, newRankings] = await Promise.all([
        forceRefreshMatches(selectedEvent.key),
        forceRefreshRankings(selectedEvent.key)
      ]);

      setEventMatches(newMatches);
      setEventRankings(newRankings);
      setLastRefresh(new Date());

      if (import.meta.env.DEV) {
        console.log('🔄 Real-time refresh completed:', { matches: newMatches.length, rankings: newRankings.length });
      }
    } catch (err) {
      console.warn('Error refreshing event data:', err);
    }
  }, [selectedEvent]);

  // Start/stop polling when viewing event details
  useEffect(() => {
    // Only poll when:
    // 1. Viewing event details
    // 2. Page is visible
    // 3. Event is current or recent (within last week)
    if (view !== 'detail' || !selectedEvent) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        setIsPolling(false);
      }
      return;
    }

    // Check if event is current (happening now or in last week)
    const eventEnd = new Date(selectedEvent.end_date);
    const now = new Date();
    const daysSinceEnd = (now - eventEnd) / (1000 * 60 * 60 * 24);
    const isRecentEvent = daysSinceEnd < 7; // Poll for events that ended within 7 days

    if (!isRecentEvent) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    setLastRefresh(new Date());

    // Poll every 15 seconds when page is visible
    pollIntervalRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshEventData();
      }
    }, 15000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [view, selectedEvent, refreshEventData]);

  // ==========================================================================
  // FILTER EVENTS
  // ==========================================================================

  const filteredEvents = useMemo(() => {
    if (!searchTerm.trim()) return events.slice(0, 50); // Show first 50 if no search

    const term = searchTerm.toLowerCase();
    return events.filter(event => (
      event.name.toLowerCase().includes(term) ||
      event.key.toLowerCase().includes(term) ||
      (event.city || '').toLowerCase().includes(term) ||
      (event.state_prov || '').toLowerCase().includes(term)
    ));
  }, [events, searchTerm]);

  // ==========================================================================
  // COMPUTED: MERGED TEAM DATA (TBA + Statbotics + Rankings)
  // ==========================================================================

  const mergedTeamData = useMemo(() => {
    // Create a map of all teams with their data
    const teamMap = new Map();

    // Add TBA team data first
    eventTeams.forEach(team => {
      const teamNum = parseInt(team.team_number || team.key?.replace('frc', ''));
      if (teamNum) {
        teamMap.set(teamNum, {
          team_number: teamNum,
          nickname: team.nickname || `Team ${teamNum}`,
          city: team.city,
          state_prov: team.state_prov,
          country: team.country,
          rank: null,
          record: null,
          epa_total: 0,
          epa_auto: 0,
          epa_teleop: 0,
          epa_endgame: 0,
          epa_elo: 0,
          epa_percentile: 50
        });
      }
    });

    // Merge TBA rankings data
    eventRankings.forEach(ranking => {
      const teamNum = parseInt(ranking.team_key?.replace('frc', ''));
      if (teamNum && teamMap.has(teamNum)) {
        const team = teamMap.get(teamNum);
        team.rank = ranking.rank;
        team.record = ranking.record;
        team.wins = ranking.record?.wins || 0;
        team.losses = ranking.record?.losses || 0;
        team.ties = ranking.record?.ties || 0;
        team.ranking_points = ranking.extra_stats?.[0] || ranking.sort_orders?.[0] || 0;
        teamMap.set(teamNum, team);
      }
    });

    // Merge Statbotics EPA data (new API format: epa.breakdown.*)
    teamStats.forEach(stat => {
      const teamNum = stat.team;
      if (teamNum && teamMap.has(teamNum)) {
        const team = teamMap.get(teamNum);
        // New Statbotics API format uses epa.breakdown for individual stats
        const breakdown = stat.epa?.breakdown || {};
        team.epa_total = breakdown.total_points || stat.epa?.total_points?.mean || 0;
        team.epa_auto = breakdown.auto_points || 0;
        team.epa_teleop = breakdown.teleop_points || 0;
        team.epa_endgame = breakdown.endgame_points || 0;
        // Store the Elo rating (unitless) for percentile calculation
        team.epa_elo = stat.epa?.unitless || stat.epa?.norm || 0;
        // Use Statbotics rank if TBA rank not available
        if (!team.rank && stat.record?.qual?.rank) {
          team.rank = stat.record.qual.rank;
        }
        // Use Statbotics record if not set
        if (!team.wins && stat.record?.qual?.wins) {
          team.wins = stat.record.qual.wins;
          team.losses = stat.record.qual.losses;
        }
        teamMap.set(teamNum, team);
      }
    });

    // Calculate event-relative percentile based on EPA Elo ratings within this event
    const teams = Array.from(teamMap.values());
    const allElos = teams.map(t => t.epa_elo || 0).filter(e => e > 0).sort((a, b) => a - b);

    teams.forEach(team => {
      if (team.epa_elo > 0 && allElos.length > 0) {
        // Find where this team's Elo ranks among all teams at this event
        const rank = allElos.filter(e => e <= team.epa_elo).length;
        team.epa_percentile = (rank / allElos.length) * 100;
      } else {
        team.epa_percentile = 50; // Default if no data
      }
    });

    return teams;
  }, [eventTeams, eventRankings, teamStats]);

  // ==========================================================================
  // COMPUTED: SORTED LEADERBOARD
  // ==========================================================================

  const leaderboard = useMemo(() => {
    return [...mergedTeamData].sort((a, b) => {
      let aVal, bVal;

      switch (sortBy) {
        case 'rank':
          aVal = a.rank || 999;
          bVal = b.rank || 999;
          break;
        case 'epa_total':
          aVal = a.epa_total || 0;
          bVal = b.epa_total || 0;
          break;
        case 'epa_auto':
          aVal = a.epa_auto || 0;
          bVal = b.epa_auto || 0;
          break;
        case 'epa_teleop':
          aVal = a.epa_teleop || 0;
          bVal = b.epa_teleop || 0;
          break;
        case 'wins':
          aVal = a.wins || 0;
          bVal = b.wins || 0;
          break;
        case 'ranking_points':
          aVal = a.ranking_points || 0;
          bVal = b.ranking_points || 0;
          break;
        case 'team_number':
          aVal = a.team_number || 0;
          bVal = b.team_number || 0;
          break;
        default:
          aVal = a.rank || 999;
          bVal = b.rank || 999;
      }

      // For rank, lower is better (ascending). For EPA/wins, higher is better (descending default)
      if (sortDirection === 'asc') {
        return aVal - bVal;
      } else {
        return bVal - aVal;
      }
    });
  }, [mergedTeamData, sortBy, sortDirection]);

  // ==========================================================================
  // SORT HANDLER
  // ==========================================================================

  const handleSort = (column) => {
    if (sortBy === column) {
      // Toggle direction if clicking same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new column with appropriate default direction
      setSortBy(column);
      // Rank should default to ascending, EPA/wins should default to descending
      if (column === 'rank' || column === 'team_number') {
        setSortDirection('asc');
      } else {
        setSortDirection('desc');
      }
    }
  };

  // Helper to get sort indicator
  const getSortIndicator = (column) => {
    if (sortBy !== column) return '';
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  // ==========================================================================
  // HELPER: GET TEAM LOGO URL
  // ==========================================================================

  const getTeamLogoUrl = (teamNumber) => {
    const eventYear = selectedEvent?.year || year;
    return `https://www.thebluealliance.com/avatar/${eventYear}/frc${teamNumber}.png`;
  };

  // ==========================================================================
  // HELPER: GET MATCH DISPLAY LABEL
  // ==========================================================================

  const getMatchLabel = (match) => {
    const levelNames = {
      qm: 'Qual',
      ef: 'Eighths',
      qf: 'Quarters',
      sf: 'Semis',
      f: 'Finals'
    };
    const levelName = levelNames[match.comp_level] || match.comp_level.toUpperCase();
    if (match.comp_level === 'qm') {
      return `${levelName} ${match.match_number}`;
    }
    return `${levelName} ${match.set_number}-${match.match_number}`;
  };

  // ==========================================================================
  // HELPER: CHECK IF MATCH HAS BEEN PLAYED
  // ==========================================================================

  const isMatchPlayed = (match) => {
    return match.alliances?.red?.score !== null &&
           match.alliances?.red?.score !== undefined &&
           match.alliances?.red?.score >= 0;
  };

  // ==========================================================================
  // HELPER: GET SCOUTING AVERAGES FOR A TEAM
  // ==========================================================================

  const getTeamScoutingAverages = (teamNumber) => {
    const teamData = scoutingData.filter(d => d.teamNumber === teamNumber);
    if (teamData.length === 0) return null;

    const avgAuto = teamData.reduce((s, e) => s + calculateAutoPoints(e), 0) / teamData.length;
    const avgTeleop = teamData.reduce((s, e) => s + calculateTeleopPoints(e), 0) / teamData.length;

    return {
      matchCount: teamData.length,
      avgAuto: avgAuto.toFixed(1),
      avgTeleop: avgTeleop.toFixed(1),
      avgTotal: (avgAuto + avgTeleop).toFixed(1)
    };
  };

  // ==========================================================================
  // MATCH PREDICTION
  // ==========================================================================

  /**
   * Generate match prediction for the selected match
   * Supports cross-event scouting with decay for teams with sparse current-event data
   * @param {Object} match - Match object from TBA
   * @returns {Object|null} - Prediction or null if match already played
   */
  const getMatchPrediction = (match) => {
    if (!match || isMatchPlayed(match)) return null;

    const currentEventKey = selectedEvent?.key;

    const buildAllianceData = (teamKeys) => {
      return {
        teams: (teamKeys || []).map(key => {
          const teamNum = parseInt(key.replace('frc', ''));
          const teamScoutingEntries = scoutingData.filter(d => d.teamNumber === teamNum);
          const statboticsTeamData = teamStats.find(t => t.team === teamNum);

          // Get cross-event scouting data for this team (all events)
          const allScoutingEntries = crossEventScoutingData[teamNum] || [];

          return {
            teamKey: key,
            scoutingEntries: teamScoutingEntries,
            statboticsData: statboticsTeamData,
            // Cross-event scouting fields - used when current event data is sparse
            allScoutingEntries: allScoutingEntries.length > 0 ? allScoutingEntries : null,
            currentEventKey: currentEventKey
          };
        })
      };
    };

    const redAlliance = buildAllianceData(match.alliances?.red?.team_keys);
    const blueAlliance = buildAllianceData(match.alliances?.blue?.team_keys);

    return predictMatch(redAlliance, blueAlliance);
  };

  // ==========================================================================
  // RENDER: SEARCH VIEW
  // ==========================================================================

  const renderSearchView = () => (
    <>
      <Helmet>
        <title>Events - PinkScout</title>
        <meta name="description" content="Search FRC events and view team rankings" />
      </Helmet>

      {/* Large Centered Search Section */}
      <div className="events-search-hero">
        <div className="search-hero-content">
          <h1>🏆 Find an Event</h1>
          <p>Search for FRC events by name, location, or event key</p>

          <div className="search-hero-controls">
            <div className="year-selector-large">
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value))}
                className="year-select-large"
              >
                {[...Array(10)].map((_, i) => (
                  <option key={currentYear - i} value={currentYear - i}>
                    {currentYear - i}
                  </option>
                ))}
              </select>
            </div>

            <input
              type="text"
              placeholder="Search events..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input-large"
              autoFocus
            />
          </div>

          <p className="search-hint">
            {loading ? 'Loading events...' : `${events.length} events in ${year}`}
          </p>
        </div>
      </div>

      {/* Saved Events Section */}
      {savedEvents.length > 0 && !searchTerm && (
        <div className="saved-events-section">
          <h2>⭐ Saved Events</h2>
          <div className="saved-events-grid">
            {savedEvents.map(saved => {
              const event = saved.cached_data || {
                key: saved.event_key,
                name: saved.event_name,
                start_date: saved.start_date,
                city: saved.city,
                state_prov: saved.state_prov
              };
              return (
                <div
                  key={saved.event_key}
                  className="event-result-card saved-event-card"
                  onClick={() => selectEvent(event)}
                >
                  <button
                    className="save-event-btn saved"
                    onClick={(e) => handleToggleSave(event, e)}
                    title="Remove from saved"
                  >
                    ⭐
                  </button>
                  <h3 className="event-result-name">{saved.event_name}</h3>
                  <div className="event-result-meta">
                    {saved.city && <span>📍 {saved.city}, {saved.state_prov || saved.country}</span>}
                    {saved.start_date && <span>📅 {saved.start_date}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Event Results */}
      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading events...</p>
        </div>
      ) : (
        <div className="events-results-grid">
          {filteredEvents.length === 0 ? (
            <div className="content-card empty-state">
              <p>No events found matching "{searchTerm}"</p>
            </div>
          ) : (
            filteredEvents.map(event => (
              <div
                key={event.key}
                className={`event-result-card ${savedEventKeys.has(event.key) ? 'is-saved' : ''}`}
                onClick={() => selectEvent(event)}
              >
                <button
                  className={`save-event-btn ${savedEventKeys.has(event.key) ? 'saved' : ''}`}
                  onClick={(e) => handleToggleSave(event, e)}
                  title={savedEventKeys.has(event.key) ? 'Remove from saved' : 'Save event'}
                >
                  {savedEventKeys.has(event.key) ? '⭐' : '☆'}
                </button>
                <div className="event-result-header">
                  <span className="event-type-badge">
                    {event.event_type_string || 'Regional'}
                  </span>
                  <span className="event-week">
                    Week {event.week !== undefined ? event.week + 1 : '?'}
                  </span>
                </div>
                <h3 className="event-result-name">{event.name}</h3>
                <div className="event-result-meta">
                  <span>📍 {event.city}, {event.state_prov || event.country}</span>
                  <span>📅 {event.start_date}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </>
  );


  // ==========================================================================
  // RENDER: EVENT DETAIL VIEW
  // ==========================================================================

  const renderEventDetail = () => (
    <>
      <Helmet>
        <title>{selectedEvent?.name || 'Event'} - PinkScout</title>
      </Helmet>

      {/* Back Button and Event Header */}
      <div className="event-detail-header">
        <button onClick={backToSearch} className="btn btn-secondary">
          ← Back to Search
        </button>
        <div className="event-detail-title">
          <h1>
            {selectedEvent?.name}
            <button
              className={`save-event-btn-inline ${savedEventKeys.has(selectedEvent?.key) ? 'saved' : ''}`}
              onClick={(e) => handleToggleSave(selectedEvent, e)}
              title={savedEventKeys.has(selectedEvent?.key) ? 'Remove from saved' : 'Save event'}
            >
              {savedEventKeys.has(selectedEvent?.key) ? '⭐' : '☆'}
            </button>
          </h1>
          <p>
            📍 {selectedEvent?.city}, {selectedEvent?.state_prov || selectedEvent?.country} •
            📅 {selectedEvent?.start_date} to {selectedEvent?.end_date}
          </p>
        </div>
        <div className="event-detail-actions">
          {isPolling && (
            <span className="live-indicator" title={`Last updated: ${lastRefresh?.toLocaleTimeString()}`}>
              🔴 LIVE
            </span>
          )}
          <button onClick={refreshEventData} className="btn btn-secondary btn-refresh" title="Refresh data">
            🔄 Refresh
          </button>
        </div>
      </div>

      {loadingDetails ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading event data...</p>
        </div>
      ) : (
        <>
          {/* Stats Summary */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{eventTeams.length}</div>
              <div className="stat-label">Teams</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{eventMatches.length}</div>
              <div className="stat-label">Matches</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{scoutingData.length}</div>
              <div className="stat-label">Scouting Entries</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">
                {eventMatches.filter(m => isMatchPlayed(m)).length}
              </div>
              <div className="stat-label">Matches Played</div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="content-card tab-nav-card">
            <div className="tab-nav">
              <button
                className={`btn ${activeTab === 'teams' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('teams')}
              >
                🤖 Teams ({eventTeams.length})
              </button>
              <button
                className={`btn ${activeTab === 'leaderboard' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('leaderboard')}
              >
                🏆 Leaderboard
              </button>
              <button
                className={`btn ${activeTab === 'matches' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('matches')}
              >
                📋 Match Schedule
              </button>
              <button
                className={`btn ${activeTab === 'awards' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('awards')}
              >
                🏅 Awards
              </button>
            </div>
          </div>

          {/* TEAMS TAB */}
          {activeTab === 'teams' && (
            <div className="content-card">
              <h2>Teams Attending ({mergedTeamData.length})</h2>
              <div className="teams-attending-grid">
                {mergedTeamData
                  .sort((a, b) => a.team_number - b.team_number)
                  .map(team => {
                    const classification = classifyEPA(team.epa_percentile || 50);
                    return (
                      <Link
                        key={team.team_number}
                        to={`/teams?team=${team.team_number}`}
                        className="team-attending-card"
                      >
                        <TeamLogo
                          teamNumber={team.team_number}
                          year={selectedEvent?.year || year}
                          className="team-logo"
                          alt={`Team ${team.team_number}`}
                        />
                        <div className="team-attending-info">
                          <span className="team-number">{team.team_number}</span>
                          <span className="team-name">{team.nickname || 'Unknown'}</span>
                          <span
                            className="team-epa-badge"
                            style={{ backgroundColor: classification.color }}
                          >
                            {classification.emoji} {team.rank ? `#${team.rank}` : 'EPA ' + (team.epa_total || 0).toFixed(0)}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
              </div>
            </div>
          )}

          {/* LEADERBOARD TAB */}
          {activeTab === 'leaderboard' && (
            <div className="content-card">
              <h2>Event Rankings ({leaderboard.length} teams)</h2>
              <p className="sort-hint">Click column headers to sort</p>
              {leaderboard.length === 0 ? (
                <p className="empty-state">Rankings not available yet.</p>
              ) : (
                <div className="table-container">
                  <table className="data-table sortable-table">
                    <thead>
                      <tr>
                        <th
                          className="sortable-header"
                          onClick={() => handleSort('rank')}
                        >
                          Rank{getSortIndicator('rank')}
                        </th>
                        <th
                          className="sortable-header"
                          onClick={() => handleSort('team_number')}
                        >
                          Team{getSortIndicator('team_number')}
                        </th>
                        <th
                          className="sortable-header"
                          onClick={() => handleSort('wins')}
                        >
                          Record{getSortIndicator('wins')}
                        </th>
                        <th
                          className="sortable-header"
                          onClick={() => handleSort('epa_total')}
                        >
                          Total EPA{getSortIndicator('epa_total')}
                        </th>
                        <th
                          className="sortable-header"
                          onClick={() => handleSort('epa_auto')}
                        >
                          Auto EPA{getSortIndicator('epa_auto')}
                        </th>
                        <th
                          className="sortable-header"
                          onClick={() => handleSort('epa_teleop')}
                        >
                          Teleop EPA{getSortIndicator('epa_teleop')}
                        </th>
                        <th
                          className="sortable-header"
                          onClick={() => handleSort('ranking_points')}
                          title="Ranking Points"
                        >
                          RP{getSortIndicator('ranking_points')}
                        </th>
                        <th>Classification</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((team, index) => {
                        // Use the team's actual global EPA percentile from Statbotics
                        const classification = classifyEPA(team.epa_percentile || 50);
                        const record = team.ties ?
                          `${team.wins || 0}-${team.losses || 0}-${team.ties}` :
                          `${team.wins || 0}-${team.losses || 0}`;
                        return (
                          <tr key={team.team_number}>
                            <td className="rank-cell">
                              {team.rank || '-'}
                            </td>
                            <td>
                              <Link to={`/teams?team=${team.team_number}`}>
                                <strong>{team.team_number}</strong>
                                <span className="team-name-small"> {team.nickname}</span>
                              </Link>
                            </td>
                            <td>{record}</td>
                            <td><strong>{(team.epa_total || 0).toFixed(1)}</strong></td>
                            <td>{(team.epa_auto || 0).toFixed(1)}</td>
                            <td>{(team.epa_teleop || 0).toFixed(1)}</td>
                            <td className="rp-cell">{team.ranking_points || '-'}</td>
                            <td>
                              <span
                                className="classification-badge-small"
                                style={{ backgroundColor: classification.color }}
                              >
                                {classification.emoji} {classification.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* MATCHES TAB */}
          {activeTab === 'matches' && (
            <div className="content-card">
              <h2>Match Schedule</h2>
              {eventMatches.length === 0 ? (
                <p className="empty-state">No matches scheduled yet.</p>
              ) : (
                <div className="matches-schedule">
                  {eventMatches.map(match => {
                    const played = isMatchPlayed(match);
                    const redScore = match.alliances?.red?.score;
                    const blueScore = match.alliances?.blue?.score;
                    const redWon = played && redScore > blueScore;
                    const blueWon = played && blueScore > redScore;

                    return (
                      <div
                        key={match.key}
                        className={`match-schedule-item ${played ? 'played' : 'upcoming'}`}
                        onClick={() => setSelectedMatch(match)}
                      >
                        <div className="match-schedule-label">
                          {getMatchLabel(match)}
                          {played && <span className="match-played-badge">✓</span>}
                        </div>

                        <div className={`match-alliance red ${redWon ? 'winner' : ''}`}>
                          <span className="alliance-label">Red</span>
                          <span className="alliance-teams">
                            {match.alliances?.red?.team_keys?.map(t => t.replace('frc', '')).join(' • ')}
                          </span>
                          {played && <span className="alliance-score">{redScore}</span>}
                        </div>

                        <div className={`match-alliance blue ${blueWon ? 'winner' : ''}`}>
                          <span className="alliance-label">Blue</span>
                          <span className="alliance-teams">
                            {match.alliances?.blue?.team_keys?.map(t => t.replace('frc', '')).join(' • ')}
                          </span>
                          {played && <span className="alliance-score">{blueScore}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* AWARDS TAB */}
          {activeTab === 'awards' && (
            <div className="content-card">
              <h2>🏅 Event Awards</h2>
              {eventAwards.length === 0 ? (
                <div className="empty-state">
                  <p>🏅 No awards yet</p>
                  <p className="empty-hint">Awards will appear here once the event has concluded and awards have been announced.</p>
                </div>
              ) : (
                <div className="awards-list">
                  {/* Sort awards by type - Winners/Finalists first, then by name */}
                  {eventAwards
                    .sort((a, b) => {
                      // Winner (1) and Finalist (2) should come first
                      const priorityOrder = { 1: 0, 2: 1 };
                      const aPriority = priorityOrder[a.award_type] ?? 10;
                      const bPriority = priorityOrder[b.award_type] ?? 10;
                      if (aPriority !== bPriority) return aPriority - bPriority;
                      return a.name.localeCompare(b.name);
                    })
                    .map((award, index) => (
                      <div key={`${award.award_type}-${index}`} className="award-card">
                        <div className="award-header">
                          <span className="award-icon">
                            {award.award_type === 1 ? '🥇' :
                             award.award_type === 2 ? '🥈' :
                             award.award_type === 0 ? '👑' :
                             award.name.toLowerCase().includes('impact') ? '🌟' :
                             award.name.toLowerCase().includes('engineering') ? '⚙️' :
                             award.name.toLowerCase().includes('rookie') ? '🌱' :
                             award.name.toLowerCase().includes('gracious') ? '🤝' :
                             award.name.toLowerCase().includes('spirit') ? '💪' :
                             award.name.toLowerCase().includes('safety') ? '🦺' :
                             award.name.toLowerCase().includes('imagery') ? '🎨' :
                             award.name.toLowerCase().includes('quality') ? '✨' :
                             award.name.toLowerCase().includes('creativity') ? '💡' :
                             award.name.toLowerCase().includes('autonomous') ? '🤖' :
                             award.name.toLowerCase().includes('judges') ? '⭐' :
                             '🏆'}
                          </span>
                          <span className="award-name">{award.name}</span>
                        </div>
                        <div className="award-recipients">
                          {award.recipient_list?.map((recipient, rIndex) => {
                            const teamNum = recipient.team_key?.replace('frc', '');
                            const team = mergedTeamData.find(t => t.team_number === parseInt(teamNum));
                            return (
                              <div key={rIndex} className="award-recipient">
                                {teamNum && (
                                  <Link to={`/teams?team=${teamNum}`} className="award-team-link">
                                    <TeamLogo
                                      teamNumber={parseInt(teamNum)}
                                      year={selectedEvent?.year || year}
                                      className="award-team-logo"
                                      alt={`Team ${teamNum}`}
                                    />
                                    <span className="award-team-number">{teamNum}</span>
                                    {team?.nickname && (
                                      <span className="award-team-name">{team.nickname}</span>
                                    )}
                                  </Link>
                                )}
                                {recipient.awardee && (
                                  <span className="award-awardee">
                                    {teamNum ? ' - ' : ''}{recipient.awardee}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* MATCH DETAIL MODAL */}
      {selectedMatch && (
        <div className="modal-overlay" onClick={() => setSelectedMatch(null)}>
          <div className="modal-content match-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedMatch(null)}>×</button>

            <h2>{getMatchLabel(selectedMatch)}</h2>

            {/* Match Result */}
            {isMatchPlayed(selectedMatch) ? (
              <>
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
                {/* Ranking Points (only for qual matches) */}
                {selectedMatch.score_breakdown && selectedMatch.comp_level === 'qm' && (
                  <div className="match-rp-summary">
                    <div className="rp-alliance red">
                      <span className="rp-label">RP:</span>
                      <span className="rp-value">{selectedMatch.score_breakdown.red?.rp || 0}</span>
                      {selectedMatch.score_breakdown.red?.melodyBonusAchieved && (
                        <span className="rp-bonus" title="Melody Bonus">🎵</span>
                      )}
                      {selectedMatch.score_breakdown.red?.ensembleBonusAchieved && (
                        <span className="rp-bonus" title="Ensemble Bonus">🎭</span>
                      )}
                      {selectedMatch.score_breakdown.red?.coopertitionBonusAchieved && (
                        <span className="rp-bonus" title="Coopertition Bonus">🤝</span>
                      )}
                    </div>
                    <div className="rp-divider">|</div>
                    <div className="rp-alliance blue">
                      <span className="rp-label">RP:</span>
                      <span className="rp-value">{selectedMatch.score_breakdown.blue?.rp || 0}</span>
                      {selectedMatch.score_breakdown.blue?.melodyBonusAchieved && (
                        <span className="rp-bonus" title="Melody Bonus">🎵</span>
                      )}
                      {selectedMatch.score_breakdown.blue?.ensembleBonusAchieved && (
                        <span className="rp-bonus" title="Ensemble Bonus">🎭</span>
                      )}
                      {selectedMatch.score_breakdown.blue?.coopertitionBonusAchieved && (
                        <span className="rp-bonus" title="Coopertition Bonus">🤝</span>
                      )}
                    </div>
                  </div>
                )}
              </>
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
                    <div key={key} className="match-team-card">
                      <Link to={`/teams?team=${teamNum}`} className="match-team-header">
                        <TeamLogo
                          teamNumber={teamNum}
                          year={selectedEvent?.year || year}
                          className="match-team-logo"
                          alt={`Team ${teamNum}`}
                        />
                        <div>
                          <span className="match-team-number">{teamNum}</span>
                          <span
                            className="match-team-badge"
                            style={{ backgroundColor: classification.color }}
                          >
                            {classification.emoji}
                          </span>
                        </div>
                      </Link>
                      <div className="match-team-stats">
                        <div className="stat-row">
                          <span>EPA Total:</span>
                          <span>{(team?.epa_total || 0).toFixed(1)}</span>
                        </div>
                        <div className="stat-row">
                          <span>Rank:</span>
                          <span>{team?.rank || 'N/A'}</span>
                        </div>
                        {scouting && (
                          <>
                            <div className="stat-row">
                              <span>Avg Auto:</span>
                              <span>{scouting.avgAuto}</span>
                            </div>
                            <div className="stat-row">
                              <span>Avg Teleop:</span>
                              <span>{scouting.avgTeleop}</span>
                            </div>
                            <div className="stat-row">
                              <span>Avg Total:</span>
                              <span>{scouting.avgTotal}</span>
                            </div>
                            <div className="stat-row muted">
                              <span>Scouted:</span>
                              <span>{scouting.matchCount} matches</span>
                            </div>
                          </>
                        )}
                        {!scouting && (
                          <div className="stat-row muted">
                            <span>No scouting data</span>
                          </div>
                        )}
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
                    <div key={key} className="match-team-card">
                      <Link to={`/teams?team=${teamNum}`} className="match-team-header">
                        <TeamLogo
                          teamNumber={teamNum}
                          year={selectedEvent?.year || year}
                          className="match-team-logo"
                          alt={`Team ${teamNum}`}
                        />
                        <div>
                          <span className="match-team-number">{teamNum}</span>
                          <span
                            className="match-team-badge"
                            style={{ backgroundColor: classification.color }}
                          >
                            {classification.emoji}
                          </span>
                        </div>
                      </Link>
                      <div className="match-team-stats">
                        <div className="stat-row">
                          <span>EPA Total:</span>
                          <span>{(team?.epa_total || 0).toFixed(1)}</span>
                        </div>
                        <div className="stat-row">
                          <span>Rank:</span>
                          <span>{team?.rank || 'N/A'}</span>
                        </div>
                        {scouting && (
                          <>
                            <div className="stat-row">
                              <span>Avg Auto:</span>
                              <span>{scouting.avgAuto}</span>
                            </div>
                            <div className="stat-row">
                              <span>Avg Teleop:</span>
                              <span>{scouting.avgTeleop}</span>
                            </div>
                            <div className="stat-row">
                              <span>Avg Total:</span>
                              <span>{scouting.avgTotal}</span>
                            </div>
                            <div className="stat-row muted">
                              <span>Scouted:</span>
                              <span>{scouting.matchCount} matches</span>
                            </div>
                          </>
                        )}
                        {!scouting && (
                          <div className="stat-row muted">
                            <span>No scouting data</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // ==========================================================================
  // MAIN RENDER
  // ==========================================================================

  return view === 'search' ? renderSearchView() : renderEventDetail();
}

