/**
 * =============================================================================
 * RECOMMENDEDALLIANCE.JSX - Alliance Partner Recommendation System
 * =============================================================================
 *
 * WHAT IS THIS FILE?
 * This page helps FRC teams find optimal alliance partners for competitions.
 * It analyzes scouting data to suggest the best 2 teams to pair with.
 *
 * HOW IT WORKS:
 * 1. Loads all events your team is attending
 * 2. For each event, fetches:
 *    - List of teams at the event (from The Blue Alliance API)
 *    - Official rankings (from The Blue Alliance API)
 *    - Scouting data collected by your team (from Supabase database)
 * 3. Categorizes robots into three types: Shooters, Cyclers, Defenders
 * 4. Calculates a "synergy score" for every possible 3-team alliance
 * 5. Recommends the top 2 alliance combinations
 *
 * SCORING FORMULA:
 * Final Score = 75% Performance + 15% Auto Rating + 10% Ranking Points
 *
 * Performance is calculated as:
 *   - (avgAutoFuel + avgTeleopFuel) * 2
 *   - + avgCycles * 1.5
 *   - + climbRate * 0.3
 *   - + Diversity Bonus (20 if 3 different roles, 10 if 2)
 *
 * VISIBILITY: Only shows if user has set their team number in Profile.
 *
 * =============================================================================
 * KEY REACT CONCEPTS USED IN THIS FILE
 * =============================================================================
 *
 * useState - Stores data that changes (like loading state, selected event)
 * useEffect - Runs code when component loads or dependencies change
 * useMemo - Caches expensive calculations (team stats, categorization)
 *
 * =============================================================================
 */

// -----------------------------------------------------------------------------
// IMPORTS
// -----------------------------------------------------------------------------

// React hooks for state management
// useState: store data that changes
// useEffect: run code when component loads
// useMemo: cache expensive calculations
import { useState, useEffect, useMemo } from 'react';

// Navigation hook from React Router
import { useNavigate } from 'react-router-dom';

// SEO - sets the page title in browser tab
import { Helmet } from 'react-helmet-async';

// Auth context - provides user profile and role information
import { useAuth } from '../contexts/AuthContext';

// The Blue Alliance API - fetches team events, teams at events, and rankings
import { getTeamEvents, getEventTeams, getEventRankings } from '../services/blueAllianceAPI';

// Scouting service - fetches scouting data and calculates team statistics
import { getEventScoutingData, calculateTeamAggregates } from '../services/scoutingService';

// -----------------------------------------------------------------------------
// CONSTANTS
// -----------------------------------------------------------------------------

// Teams must have at least this many scouted matches to be included
// This prevents unreliable recommendations based on too little data
const MIN_MATCH_THRESHOLD = 1;

// =============================================================================
// MAIN COMPONENT
// =============================================================================
export default function RecommendedAlliance() {
  // ---------------------------------------------------------------------------
  // HOOKS - Get auth context and navigation
  // ---------------------------------------------------------------------------
  const { userProfile, roleContext } = useAuth();  // Current user's profile
  const navigate = useNavigate();                   // Function to navigate to other pages
  const teamNumber = userProfile?.teamNumber;       // User's FRC team number (e.g., 4639)

  // ---------------------------------------------------------------------------
  // STATE VARIABLES - Track data and UI state
  // ---------------------------------------------------------------------------
  // Loading states
  const [loading, setLoading] = useState(true);           // Initial page load
  const [loadingEventData, setLoadingEventData] = useState(false);  // Loading specific event

  // Error message to display
  const [error, setError] = useState('');

  // Events the user's team is attending
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Data for the selected event
  const [eventTeams, setEventTeams] = useState([]);      // Teams at this event
  const [rankings, setRankings] = useState([]);          // Official rankings
  const [scoutingData, setScoutingData] = useState([]);  // Our scouting entries

  // Current year for fetching events
  const currentYear = new Date().getFullYear();

  // ==========================================================================
  // EFFECT: Load team events when component mounts
  // ==========================================================================
  // useEffect runs code after the component renders
  // The [teamNumber] dependency array means it re-runs when teamNumber changes
  useEffect(() => {
    if (teamNumber) {
      loadTeamEvents();
    }
  }, [teamNumber]);

  // ---------------------------------------------------------------------------
  // FUNCTION: Load all events for the user's team
  // ---------------------------------------------------------------------------
  // async/await pattern - allows waiting for API calls to finish
  const loadTeamEvents = async () => {
    setLoading(true);   // Show loading spinner
    setError('');       // Clear any previous errors

    try {
      // Fetch events from current year and past year
      // Promise.all runs multiple API calls in parallel (faster than one-by-one)
      const yearsToFetch = [currentYear, currentYear - 1];
      const eventPromises = yearsToFetch.map(year => getTeamEvents(teamNumber, year));
      const results = await Promise.all(eventPromises);

      // Use current year events, or fall back to last year if empty
      let currentYearEvents = results[0] || [];
      if (currentYearEvents.length === 0 && results[1]?.length > 0) {
        currentYearEvents = results[1];
      }

      // Sort events by date (earliest first)
      currentYearEvents.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
      setEvents(currentYearEvents);

      // Auto-select the most relevant event (current or next upcoming)
      if (currentYearEvents.length > 0) {
        const now = new Date();
        // Priority: 1) Currently happening, 2) Next upcoming, 3) Most recent past
        const relevantEvent = currentYearEvents.find(e => {
          const start = new Date(e.start_date);
          const end = new Date(e.end_date);
          end.setDate(end.getDate() + 1); // Include the end date
          return now >= start && now <= end;  // Is it happening right now?
        }) || currentYearEvents.find(e => new Date(e.start_date) >= now) || currentYearEvents[currentYearEvents.length - 1];

        if (relevantEvent) {
          selectEvent(relevantEvent);  // Load data for this event
        }
      }
    } catch (err) {
      console.error('Error loading team events:', err);
      setError('Failed to load events. Please try again.');
    } finally {
      // finally block always runs, even if there's an error
      setLoading(false);  // Hide loading spinner
    }
  };

  // ---------------------------------------------------------------------------
  // FUNCTION: Load all data for a selected event
  // ---------------------------------------------------------------------------
  // Called when user clicks an event button or on initial load
  const selectEvent = async (event) => {
    setSelectedEvent(event);
    setLoadingEventData(true);
    setError('');

    try {
      // Promise.allSettled - like Promise.all but doesn't fail if one request fails
      // Returns objects with { status: 'fulfilled'|'rejected', value|reason }
      const [teams, rankingsData, scouting] = await Promise.allSettled([
        getEventTeams(event.key),                      // All teams at this event
        getEventRankings(event.key),                   // Official rankings
        getEventScoutingData(event.key, roleContext)   // Our scouting data
      ]);

      // Set state only if the promise succeeded
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
  // MEMO: Calculate team statistics from scouting data
  // ==========================================================================
  // useMemo caches this calculation - only re-runs when scoutingData changes
  // This prevents expensive recalculation on every render
  const teamStats = useMemo(() => {
    // Map is like an object but with better performance for large datasets
    // Map: teamNumber → { aggregates, primaryRole, roleCounts }
    const statsMap = new Map();

    // STEP 1: Group scouting entries by team number
    // Result: { 4639: [entry1, entry2], 1234: [entry3], ... }
    const teamEntries = {};
    for (const entry of scoutingData) {
      const teamNum = entry.teamNumber;
      if (!teamEntries[teamNum]) {
        teamEntries[teamNum] = [];  // Initialize array for this team
      }
      teamEntries[teamNum].push(entry);  // Add this entry to the team's array
    }

    // STEP 2: Calculate aggregates for each team
    // Object.entries converts { 4639: [...] } into [['4639', [...]], ...]
    for (const [teamNum, entries] of Object.entries(teamEntries)) {
      // calculateTeamAggregates returns averages, rates, and auto metrics
      const aggregates = calculateTeamAggregates(entries);

      // STEP 3: Count how often each role was assigned to this team
      const roleCounts = { shooter: 0, cycler: 0, defense: 0 };
      for (const entry of entries) {
        // hasOwnProperty checks if the role is valid (shooter/cycler/defense)
        if (entry.robotRole && roleCounts.hasOwnProperty(entry.robotRole)) {
          roleCounts[entry.robotRole]++;
        }
      }

      // STEP 4: Determine primary role (most frequently assigned)
      // Math.max(...Object.values(roleCounts)) finds the highest count
      const maxRoleCount = Math.max(...Object.values(roleCounts));
      let primaryRole = 'hybrid';  // Default if no clear role
      if (maxRoleCount > 0) {
        // Assign primary role based on which has the highest count
        if (roleCounts.shooter === maxRoleCount) primaryRole = 'shooter';
        else if (roleCounts.cycler === maxRoleCount) primaryRole = 'cycler';
        else if (roleCounts.defense === maxRoleCount) primaryRole = 'defense';
      }

      // Store in the Map (parseInt converts string "4639" to number 4639)
      statsMap.set(parseInt(teamNum), {
        ...aggregates,    // Spread: includes all properties from aggregates
        primaryRole,
        roleCounts
      });
    }

    return statsMap;
  }, [scoutingData]);  // Re-run only when scoutingData changes

  // ==========================================================================
  // MEMO: Normalize ranking points to 0-1 scale
  // ==========================================================================
  // This makes ranking points comparable across events with different scoring
  const rankingsMap = useMemo(() => {
    const map = new Map();
    if (!rankings.length) return map;  // Return empty map if no rankings

    // Find the team with the most ranking points (for normalization)
    // Math.max(...array) finds the highest value in the array
    const maxRankingPoints = Math.max(...rankings.map(r => r.sort_orders?.[0] || 0), 1);

    // Create a map: teamNumber → { rank, rankingPoints, normalizedRP }
    for (const r of rankings) {
      // team_key is "frc4639", we extract just "4639" and convert to number
      const teamNum = parseInt(r.team_key?.replace('frc', '') || '0');
      const rankingPoints = r.sort_orders?.[0] || 0;
      map.set(teamNum, {
        rank: r.rank,                                    // 1, 2, 3, etc.
        rankingPoints,                                   // Raw RP value
        normalizedRP: rankingPoints / maxRankingPoints   // 0 to 1 scale
      });
    }
    return map;
  }, [rankings]);

  // ---------------------------------------------------------------------------
  // HELPER: Combine all data sources for a single team
  // ---------------------------------------------------------------------------
  // Merges: TBA team info + our scouting stats + official rankings
  const getTeamFullData = (teamNum) => {
    const team = eventTeams.find(t => t.team_number === teamNum);  // TBA data
    const stats = teamStats.get(teamNum);    // Our scouting aggregates
    const ranking = rankingsMap.get(teamNum); // Official rankings

    return {
      teamNumber: teamNum,
      nickname: team?.nickname || `Team ${teamNum}`,  // Fallback if no nickname
      ...stats,                              // All our calculated stats
      rank: ranking?.rank,
      normalizedRP: ranking?.normalizedRP || 0
    };
  };

  // ==========================================================================
  // MEMO: Categorize teams into Shooter, Cycler, and Defense buckets
  // ==========================================================================
  // Teams can appear in multiple categories (e.g., a cycler who also plays defense)
  const categorizedTeams = useMemo(() => {
    const shooters = [];   // Teams primarily focused on scoring
    const cyclers = [];    // Teams primarily focused on moving balls
    const defenders = [];  // Teams that play defense

    // CATEGORIZATION LOOP: Place each team into appropriate buckets
    for (const team of eventTeams) {
      const teamNum = team.team_number;
      const stats = teamStats.get(teamNum);

      // Skip teams without enough scouting data
      // continue: skip to the next iteration of the loop
      if (!stats || stats.matchCount < MIN_MATCH_THRESHOLD) continue;

      const fullData = getTeamFullData(teamNum);

      // --- Categorization Logic ---
      // Shooters: explicitly marked as shooter, OR hybrid with more scoring than cycling
      if (stats.primaryRole === 'shooter' || (stats.primaryRole === 'hybrid' && stats.avgAutoFuel + stats.avgTeleopFuel > stats.avgCycles)) {
        shooters.push(fullData);
      }
      // Cyclers: explicitly marked as cycler, OR hybrid with any cycling
      if (stats.primaryRole === 'cycler' || (stats.primaryRole === 'hybrid' && stats.avgCycles > 0)) {
        cyclers.push(fullData);
      }
      // Defenders: explicitly marked as defense, OR played defense in any match
      if (stats.primaryRole === 'defense' || stats.roleCounts?.defense > 0) {
        defenders.push(fullData);
      }
    }

    // -------------------------------------------------------------------------
    // SORTING: Rank teams within each category
    // -------------------------------------------------------------------------
    // array.sort((a, b) => ...) sorts in place
    // Return negative: a comes first, Return positive: b comes first

    // SHOOTERS: Sort by total balls scored → auto rating → ranking points
    shooters.sort((a, b) => {
      const aScore = (a.avgAutoFuel || 0) + (a.avgTeleopFuel || 0);
      const bScore = (b.avgAutoFuel || 0) + (b.avgTeleopFuel || 0);
      if (bScore !== aScore) return bScore - aScore;  // Higher score first
      // Tiebreaker 1: Auto rating (teams with better auto performance ranked higher)
      if ((b.autoRating || 0) !== (a.autoRating || 0)) return (b.autoRating || 0) - (a.autoRating || 0);
      // Tiebreaker 2: Official ranking points
      return (b.normalizedRP || 0) - (a.normalizedRP || 0);
    });

    // CYCLERS: Sort by avg cycles → auto rating → ranking points
    cyclers.sort((a, b) => {
      if ((b.avgCycles || 0) !== (a.avgCycles || 0)) return (b.avgCycles || 0) - (a.avgCycles || 0);
      // Tiebreaker 1: Auto rating
      if ((b.autoRating || 0) !== (a.autoRating || 0)) return (b.autoRating || 0) - (a.autoRating || 0);
      // Tiebreaker 2: Official ranking points
      return (b.normalizedRP || 0) - (a.normalizedRP || 0);
    });

    // DEFENDERS: Sort by defense count → cycles → auto rating → scoring → RP
    // (More tiebreakers since defense is harder to quantify)
    defenders.sort((a, b) => {
      const aDefCount = a.roleCounts?.defense || 0;
      const bDefCount = b.roleCounts?.defense || 0;
      if (bDefCount !== aDefCount) return bDefCount - aDefCount;  // More defense matches first
      if ((b.avgCycles || 0) !== (a.avgCycles || 0)) return (b.avgCycles || 0) - (a.avgCycles || 0);
      // Tiebreaker: Auto rating
      if ((b.autoRating || 0) !== (a.autoRating || 0)) return (b.autoRating || 0) - (a.autoRating || 0);
      const aScore = (a.avgAutoFuel || 0) + (a.avgTeleopFuel || 0);
      const bScore = (b.avgAutoFuel || 0) + (b.avgTeleopFuel || 0);
      if (bScore !== aScore) return bScore - aScore;
      return (b.normalizedRP || 0) - (a.normalizedRP || 0);
    });

    return { shooters, cyclers, defenders };
  }, [eventTeams, teamStats, rankingsMap]);  // Re-run when any of these change

  // ==========================================================================
  // FUNCTION: Calculate synergy score for a 3-team alliance
  // ==========================================================================
  // This is the core algorithm that determines how well 3 teams work together
  // Higher score = better alliance combination
  const calculateSynergyScore = (team1, team2, team3) => {
    // -------------------------------------------------------------------------
    // PERFORMANCE SCORE: How good is each robot at doing things?
    // -------------------------------------------------------------------------
    const getPerformanceScore = (t) => {
      const scoring = (t?.avgAutoFuel || 0) + (t?.avgTeleopFuel || 0);  // Total balls scored
      const cycles = t?.avgCycles || 0;                                  // Balls cycled
      const climbRate = t?.climbRate || 0;                               // % of matches with climb
      // Weighted sum: scoring is most important, then cycling, then climbing
      return scoring * 2 + cycles * 1.5 + climbRate * 0.3;
    };

    // -------------------------------------------------------------------------
    // AUTO SCORE: How good is the robot during autonomous period?
    // -------------------------------------------------------------------------
    const getAutoScore = (t) => t?.autoRating || 0;  // 0-100 scale from calculateTeamAggregates

    // Calculate performance for all 3 teams
    const p1 = getPerformanceScore(team1);
    const p2 = getPerformanceScore(team2);
    const p3 = getPerformanceScore(team3);
    const totalPerformance = p1 + p2 + p3;

    // Calculate average auto rating across the alliance
    const a1 = getAutoScore(team1);
    const a2 = getAutoScore(team2);
    const a3 = getAutoScore(team3);
    const avgAutoRating = (a1 + a2 + a3) / 3;

    // -------------------------------------------------------------------------
    // DIVERSITY BONUS: Alliances with complementary roles work better
    // -------------------------------------------------------------------------
    // Get unique roles - Set automatically removes duplicates
    const roles = [team1?.primaryRole, team2?.primaryRole, team3?.primaryRole].filter(Boolean);
    const uniqueRoles = new Set(roles).size;  // 1, 2, or 3
    // 3 different roles = +20, 2 different roles = +10, all same = +0
    const diversityBonus = uniqueRoles === 3 ? 20 : uniqueRoles === 2 ? 10 : 0;

    // Total performance including diversity bonus
    const synergyPerformance = totalPerformance + diversityBonus;

    // -------------------------------------------------------------------------
    // RANKING POINTS: Official competition performance
    // -------------------------------------------------------------------------
    const avgRP = ((team1?.normalizedRP || 0) + (team2?.normalizedRP || 0) + (team3?.normalizedRP || 0)) / 3;

    // -------------------------------------------------------------------------
    // FINAL SCORE FORMULA:
    // 75% robot performance (what they can do)
    // 15% autonomous rating (how good their auto is)
    // 10% ranking points (official competition results)
    // -------------------------------------------------------------------------
    return (0.75 * synergyPerformance) + (0.15 * avgAutoRating) + (0.1 * avgRP * 100);
  };

  // ==========================================================================
  // MEMO: Generate the recommended alliance combinations
  // ==========================================================================
  // This is the main algorithm output - finds the 2 best alliance combinations
  const recommendedAlliances = useMemo(() => {
    // Get the user's own team data
    const userTeam = getTeamFullData(teamNumber);
    const userRole = userTeam?.primaryRole || 'hybrid';

    // Get all other teams with sufficient scouting data
    // .map transforms each item, .filter removes items that don't pass the test
    const allTeamsWithData = eventTeams
      .map(t => getTeamFullData(t.team_number))
      .filter(t => t.teamNumber !== teamNumber && t.matchCount >= MIN_MATCH_THRESHOLD);

    // Need at least 2 other teams to form an alliance
    if (allTeamsWithData.length < 2) {
      return [];  // Return empty array = "Not enough data"
    }

    // -------------------------------------------------------------------------
    // GENERATE ALL POSSIBLE ALLIANCE COMBINATIONS
    // -------------------------------------------------------------------------
    // For N teams, there are N*(N-1)/2 possible pairs (combinatorics)
    const candidates = [];
    for (let i = 0; i < allTeamsWithData.length; i++) {
      for (let j = i + 1; j < allTeamsWithData.length; j++) {
        const partner1 = allTeamsWithData[i];
        const partner2 = allTeamsWithData[j];
        // Calculate how well these 3 teams (user + partner1 + partner2) work together
        const score = calculateSynergyScore(userTeam, partner1, partner2);
        candidates.push({ partner1, partner2, score });
      }
    }

    // Sort by synergy score (highest first)
    candidates.sort((a, b) => b.score - a.score);

    // -------------------------------------------------------------------------
    // SELECT TOP 2 ALLIANCES (with diversity)
    // -------------------------------------------------------------------------
    // Try to pick alliances with different teams for variety
    const alliances = [];
    const usedTeams = new Set();  // Track which teams we've already recommended

    for (const c of candidates) {
      if (alliances.length >= 2) break;  // We only want 2 recommendations

      // For the second alliance, prefer teams not used in the first
      if (alliances.length === 1) {
        // At least one new team? Add it as the alternative
        if (!usedTeams.has(c.partner1.teamNumber) || !usedTeams.has(c.partner2.teamNumber)) {
          alliances.push({
            userTeam,
            partners: [c.partner1, c.partner2],
            score: c.score
          });
          break;
        }
      } else {
        // First alliance - just pick the best
        alliances.push({
          userTeam,
          partners: [c.partner1, c.partner2],
          score: c.score
        });
        usedTeams.add(c.partner1.teamNumber);
        usedTeams.add(c.partner2.teamNumber);
      }
    }

    // Fallback: If we couldn't find a diverse second alliance, just use #2 ranked
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

  // =============================================================================
  // JSX RENDERING
  // =============================================================================
  // Everything below this point is the visual output (what users see)
  // JSX looks like HTML but it's actually JavaScript that creates DOM elements

  // ---------------------------------------------------------------------------
  // RENDER: Show this if user hasn't set their team number yet
  // ---------------------------------------------------------------------------
  if (!teamNumber) {
    return (
      <>
        {/* Helmet sets the browser tab title */}
        <Helmet>
          <title>Recommended Alliance - PinkScout</title>
        </Helmet>
        <header className="page-header">
          <h1>🤝 Recommended Alliance</h1>
          <p>Find optimal alliance partners using scouting data</p>
        </header>
        {/* Prompt user to set their team number */}
        <div className="content-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🤖</div>
          <h2>Set Your Team Number</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
            To see alliance recommendations, you need to set your FRC team number in your profile.
          </p>
          {/* onClick navigates to the profile page */}
          <button className="btn btn-primary" onClick={() => navigate('/profile')}>
            👤 Go to Profile
          </button>
        </div>
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: Main page content (user has team number set)
  // ---------------------------------------------------------------------------
  return (
    <>
      {/* Browser tab title */}
      <Helmet>
        <title>Recommended Alliance - PinkScout</title>
      </Helmet>

      {/* Page Header */}
      <header className="page-header">
        <h1>🤝 Recommended Alliance</h1>
        <p>Find optimal alliance partners for Team {teamNumber}</p>
      </header>

      {/* ===================================================================== */}
      {/* EVENT SELECTOR - Buttons to choose which competition to analyze */}
      {/* ===================================================================== */}
      <div className="content-card">
        <h3>Select Event</h3>
        {/* Conditional rendering using ternary operators (condition ? ifTrue : ifFalse) */}
        {loading ? (
          <p>Loading events...</p>
        ) : events.length === 0 ? (
          <p className="empty-state">No events found for Team {teamNumber}</p>
        ) : (
          <div className="my-matches-event-selector">
            {/* .map() loops through events and creates a button for each */}
            {events.map(event => {
              // Calculate state for styling
              const isActive = selectedEvent?.key === event.key;  // Currently selected?
              const isPast = new Date(event.end_date) < new Date();  // Already happened?
              const isCurrent = new Date() >= new Date(event.start_date) && new Date() <= new Date(event.end_date);  // Happening now?
              return (
                <button
                  key={event.key}  // React requires unique key for list items
                  // Template literal for dynamic class names
                  className={`event-btn ${isActive ? 'active' : ''} ${isPast ? 'past' : ''} ${isCurrent ? 'current' : ''}`}
                  onClick={() => selectEvent(event)}  // Load this event's data
                >
                  <span className="event-name">{event.name}</span>
                  <span className="event-date">
                    {new Date(event.start_date).toLocaleDateString()}
                    {/* Show "LIVE" indicator if event is happening now */}
                    {isCurrent && ' 🔴 LIVE'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Error message (only shows if error state is truthy) */}
      {error && <div className="error-message">{error}</div>}

      {/* ===================================================================== */}
      {/* MAIN CONTENT - Only shows when an event is selected and loaded */}
      {/* ===================================================================== */}
      {selectedEvent && !loadingEventData && (
        <>
          {/* --- RECOMMENDED ALLIANCES SECTION --- */}
          {/* Shows the top 2 recommended alliance combinations */}
          <div className="content-card">
            <h2 style={{ marginBottom: '1.5rem' }}>🏆 Your Recommended Alliance</h2>
            {recommendedAlliances.length === 0 ? (
              <p className="empty-state">Not enough scouting data to generate recommendations. Scout more teams!</p>
            ) : (
              // CSS Grid for responsive 2-column layout
              <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                {/* Loop through recommended alliances (usually 2) */}
                {recommendedAlliances.map((alliance, idx) => (
                  <div key={idx} className="content-card" style={{ background: 'var(--card-bg-alt)', margin: 0 }}>
                    {/* Gold for #1, Silver for #2 */}
                    <h3 style={{ color: idx === 0 ? '#FFD700' : '#C0C0C0', marginBottom: '1rem' }}>
                      {idx === 0 ? '🥇 Top Pick' : '🥈 Alternative'}
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {/* User's team card (highlighted) */}
                      <TeamCard team={alliance.userTeam} isUser={true} />
                      {/* Partner team cards */}
                      {alliance.partners.map((p, i) => (
                        <TeamCard key={p.teamNumber} team={p} />
                      ))}
                    </div>
                    {/* Display the calculated synergy score */}
                    <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Synergy Score: {alliance.score.toFixed(1)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* --- ALLIANCE CANDIDATE BREAKDOWN --- */}
          {/* Three columns showing all teams categorized by role */}
          <div className="content-card">
            <h2 style={{ marginBottom: '1.5rem' }}>📊 Alliance Candidate Breakdown</h2>
            {/* 3-column responsive grid */}
            <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>

              {/* --- SHOOTERS COLUMN (Pink) --- */}
              <div>
                <h3 style={{ color: '#e91e63', marginBottom: '1rem' }}>🎯 Shooter Bots</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Sorted by avg balls scored
                </p>
                {categorizedTeams.shooters.length === 0 ? (
                  <p className="empty-state">No shooters with data</p>
                ) : (
                  // Scrollable list (max 400px height)
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '400px', overflowY: 'auto' }}>
                    {/* .slice(0, 15) limits to top 15 teams */}
                    {categorizedTeams.shooters.slice(0, 15).map((team, idx) => (
                      <TeamRowCard key={team.teamNumber} team={team} rank={idx + 1} statLabel="Balls" statValue={(team.avgAutoFuel + team.avgTeleopFuel).toFixed(1)} />
                    ))}
                  </div>
                )}
              </div>

              {/* --- CYCLERS COLUMN (Green) --- */}
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

              {/* --- DEFENDERS COLUMN (Blue) --- */}
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

      {/* Loading spinner while fetching event data */}
      {loadingEventData && (
        <div className="content-card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div className="loading-spinner"></div>
          <p>Loading event data...</p>
        </div>
      )}
    </>
  );
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================
// These are smaller, reusable components used in the main page above
// In React, you can define multiple components in one file

/**
 * TeamCard Component
 * -----------------
 * Displays a single team in the recommended alliance cards.
 * Shows: team number, nickname, match count, auto rating badge, and role badge.
 *
 * Props:
 *   - team: Object with team data (teamNumber, nickname, matchCount, autoRatingLabel, primaryRole)
 *   - isUser: Boolean - if true, highlights the card (user's own team)
 */
function TeamCard({ team, isUser = false }) {
  // Color mapping for robot roles
  const roleColors = {
    shooter: '#e91e63',  // Pink
    cycler: '#4CAF50',   // Green
    defense: '#2196F3',  // Blue
    hybrid: '#9c27b0'    // Purple
  };
  const roleColor = roleColors[team?.primaryRole] || '#666';

  // Color mapping for auto rating badges
  const autoRatingColors = {
    'High': '#4CAF50',    // Green - excellent auto
    'Medium': '#FF9800',  // Orange - average auto
    'Low': '#f44336',     // Red - needs improvement
    'N/A': '#666'         // Gray - no data
  };
  const autoLabel = team?.autoRatingLabel || 'N/A';
  const autoColor = autoRatingColors[autoLabel] || '#666';

  return (
    // Inline styles with ternary operators for conditional styling
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      padding: '0.75rem',
      // User's team gets a pink tint and pink border
      background: isUser ? 'rgba(233, 30, 99, 0.1)' : 'var(--card-bg)',
      borderRadius: '0.5rem',
      border: isUser ? '2px solid #e91e63' : '1px solid var(--border-color)'
    }}>
      {/* Team Number */}
      <div style={{ fontWeight: 'bold', fontSize: '1.25rem', minWidth: '60px' }}>
        {team?.teamNumber}
      </div>

      {/* Team Name and Match Count */}
      <div style={{ flex: 1 }}>  {/* flex: 1 makes this take remaining space */}
        <div style={{ fontWeight: '500' }}>{team?.nickname || `Team ${team?.teamNumber}`}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {team?.matchCount || 0} matches scouted
        </div>
      </div>

      {/* Auto Rating Badge - Shows how good their autonomous is */}
      {/* Color-coded: Green (High), Orange (Medium), Red (Low) */}
      <div style={{
        padding: '0.2rem 0.4rem',
        borderRadius: '0.25rem',
        background: `${autoColor}22`,  // 22 = light transparency
        border: `1px solid ${autoColor}`,
        color: autoColor,
        fontSize: '0.65rem',
        fontWeight: '600'
      }}>
        🤖 {autoLabel}
      </div>

      {/* Role Badge - Shows their primary role (shooter/cycler/defense) */}
      <div style={{
        padding: '0.25rem 0.5rem',
        borderRadius: '0.25rem',
        background: roleColor,
        color: 'white',
        fontSize: '0.75rem',
        textTransform: 'capitalize'  // Makes "shooter" display as "Shooter"
      }}>
        {team?.primaryRole || 'N/A'}
      </div>
    </div>
  );
}

/**
 * TeamRowCard Component
 * --------------------
 * Compact row display for the candidate breakdown lists.
 * Shows: rank, team number, nickname, auto rating, and primary stat.
 *
 * Props:
 *   - team: Object with team data
 *   - rank: Number - position in the sorted list (1, 2, 3, ...)
 *   - statLabel: String - what stat to show (e.g., "Balls", "Cycled", "Def")
 *   - statValue: Number - the value of that stat
 */
function TeamRowCard({ team, rank, statLabel, statValue }) {
  // Auto rating color coding (same as TeamCard)
  const autoRatingColors = {
    'High': '#4CAF50',
    'Medium': '#FF9800',
    'Low': '#f44336',
    'N/A': '#666'
  };
  const autoLabel = team?.autoRatingLabel || 'N/A';
  const autoColor = autoRatingColors[autoLabel] || '#666';

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
      {/* Rank in category */}
      <span style={{ fontWeight: 'bold', color: 'var(--text-muted)', minWidth: '24px' }}>#{rank}</span>

      {/* Team Number */}
      <span style={{ fontWeight: 'bold', minWidth: '50px' }}>{team.teamNumber}</span>

      {/* Team Nickname (truncated if too long) */}
      <span style={{ flex: 1, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {team.nickname}
      </span>

      {/* Auto Rating Badge (smaller version) */}
      <span style={{
        padding: '0.15rem 0.35rem',
        borderRadius: '0.2rem',
        background: `${autoColor}22`,
        border: `1px solid ${autoColor}`,
        color: autoColor,
        fontSize: '0.6rem',
        fontWeight: '600'
      }}>
        🤖 {autoLabel}
      </span>

      {/* Primary Stat for this category */}
      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        {statLabel}: <strong>{statValue}</strong>
      </span>

      {/* Official rank (if available) */}
      {/* Conditional rendering: only show if team.rank exists */}
      {team.rank && (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Rank #{team.rank}
        </span>
      )}
    </div>
  );
}

// =============================================================================
// END OF FILE
// =============================================================================