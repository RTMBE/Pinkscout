/**
 * =============================================================================
 * HOME.JSX - Home/Landing Page Component
 * =============================================================================
 *
 * WHAT IS THIS PAGE?
 * The landing page for authenticated users. Provides:
 * - Welcome message
 * - Quick action buttons to main features
 * - Overview of the app's capabilities
 * - World Rankings (Top 20 teams)
 * - Previous World Champions
 *
 * =============================================================================
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../contexts/AuthContext';
import { getTopTeams } from '../services/statboticsAPI';

// FRC World Champions data (Einstein winning alliances)
const WORLD_CHAMPIONS = [
  { year: 2025, alliance: [
    { team: 1323, name: 'MadTown Robotics' },
    { team: 2910, name: 'Jack in the Bot' },
    { team: 4272, name: 'Maverick Robotics' },
    { team: 5026, name: 'Iron Panthers' },
  ]},
  { year: 2024, alliance: [
    { team: 1678, name: 'Citrus Circuits' },
    { team: 4414, name: 'HighTide' },
    { team: 6036, name: 'Peninsula Robotics' },
  ]},
  { year: 2023, alliance: [
    { team: 1678, name: 'Citrus Circuits' },
    { team: 4414, name: 'HighTide' },
    { team: 253, name: 'Boba Bots' },
  ]},
  { year: 2022, alliance: [
    { team: 4099, name: 'The Falcons' },
    { team: 2910, name: 'Jack in the Bot' },
    { team: 8033, name: 'Highlander Robotics' },
  ]},
  { year: 2019, alliance: [
    { team: 254, name: 'The Cheesy Poofs' },
    { team: 2056, name: 'OP Robotics' },
    { team: 1323, name: 'MadTown Robotics' },
  ]},
  { year: 2018, alliance: [
    { team: 254, name: 'The Cheesy Poofs' },
    { team: 2056, name: 'OP Robotics' },
    { team: 1640, name: 'Sab-BOT-age' },
  ]},
  { year: 2017, alliance: [
    { team: 2767, name: 'Stryke Force' },
    { team: 2481, name: 'Roboteers' },
    { team: 6325, name: 'Team Cyborg Soldiers' },
  ]},
  { year: 2016, alliance: [
    { team: 1114, name: 'Simbotics' },
    { team: 2056, name: 'OP Robotics' },
    { team: 4334, name: 'Alberta Tech Alliance' },
  ]},
  { year: 2015, alliance: [
    { team: 1678, name: 'Citrus Circuits' },
    { team: 254, name: 'The Cheesy Poofs' },
    { team: 5499, name: 'The Bay Orangutans' },
  ]},
  { year: 2014, alliance: [
    { team: 254, name: 'The Cheesy Poofs' },
    { team: 2848, name: 'Birds of Prey' },
    { team: 469, name: 'Las Guerrillas' },
  ]},
  { year: 2013, alliance: [
    { team: 254, name: 'The Cheesy Poofs' },
    { team: 604, name: 'Quixilver' },
    { team: 968, name: 'RAWC' },
  ]},
];

export default function Home() {
  const { user, userProfile } = useAuth();
  const [topTeams, setTopTeams] = useState([]);
  const [loadingRankings, setLoadingRankings] = useState(true);

  // Get display name from profile or email
  const displayName = userProfile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'Scout';

  // Fetch top teams on mount
  useEffect(() => {
    async function fetchTopTeams() {
      setLoadingRankings(true);
      const currentYear = new Date().getFullYear();
      const teams = await getTopTeams(currentYear, 20);
      setTopTeams(teams);
      setLoadingRankings(false);
    }
    fetchTopTeams();
  }, []);

  return (
    <>
      {/* SEO Meta Tags */}
      <Helmet>
        <title>Home - PinkScout</title>
        <meta name="description" content="PinkScout FRC scouting application - Track team performance and match data" />
      </Helmet>

      {/* Page Header */}
      <header className="page-header">
        <h1>Welcome, {displayName}! 👋</h1>
        <p>Your FRC scouting dashboard is ready to help you analyze teams and track matches.</p>
      </header>

      {/* Quick Actions Grid */}
      <div className="content-card">
        <h2>Quick Actions</h2>
        <div className="quick-actions-grid">
          {/* Scout a Match */}
          <Link to="/scouting" className="quick-action-card">
            <div className="quick-action-icon">📝</div>
            <h3>Scout a Match</h3>
            <p>Record match data for a team</p>
          </Link>

          {/* Search Teams */}
          <Link to="/teams" className="quick-action-card">
            <div className="quick-action-icon">🤖</div>
            <h3>Search Teams</h3>
            <p>Look up team stats and EPA</p>
          </Link>

          {/* View Events */}
          <Link to="/events" className="quick-action-card">
            <div className="quick-action-icon">🏆</div>
            <h3>View Events</h3>
            <p>Browse event schedules and matches</p>
          </Link>

          {/* Analytics */}
          <Link to="/analytics" className="quick-action-card">
            <div className="quick-action-icon">📈</div>
            <h3>Analytics</h3>
            <p>Compare teams and view charts</p>
          </Link>
        </div>
      </div>

      {/* Features Overview */}
      <div className="content-card">
        <h2>What PinkScout Can Do</h2>
        <div className="features-list">
          <div className="feature-item">
            <span className="feature-icon">📊</span>
            <div>
              <h4>EPA Classification</h4>
              <p>Automatically classifies teams as Elite, Top Tier, Normal, or Below Average based on Statbotics data.</p>
            </div>
          </div>
          
          <div className="feature-item">
            <span className="feature-icon">🔍</span>
            <div>
              <h4>Combined Data View</h4>
              <p>See both Statbotics data and your team's scouting data side-by-side.</p>
            </div>
          </div>
          
          <div className="feature-item">
            <span className="feature-icon">📱</span>
            <div>
              <h4>Mobile-Friendly</h4>
              <p>Scout matches from your phone or tablet at competitions.</p>
            </div>
          </div>
          
          <div className="feature-item">
            <span className="feature-icon">🏆</span>
            <div>
              <h4>Event Integration</h4>
              <p>Pull live event data from The Blue Alliance API.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Getting Started */}
      <div className="content-card">
        <h2>Getting Started</h2>
        <ol className="getting-started-list">
          <li>
            <strong>Scout a match:</strong> Go to{' '}
            <Link to="/scouting">Scout</Link> and fill out the form for each match you observe.
          </li>
          <li>
            <strong>Search teams:</strong> Use{' '}
            <Link to="/teams">Teams</Link> to look up any FRC team and see their EPA rating.
          </li>
          <li>
            <strong>View dashboard:</strong> Check the{' '}
            <Link to="/dashboard">Dashboard</Link> for an overview of all scouting data.
          </li>
          <li>
            <strong>Analyze data:</strong> Use{' '}
            <Link to="/analytics">Analytics</Link> to compare teams and view performance charts.
          </li>
        </ol>
      </div>

      {/* World Rankings Section */}
      <div className="content-card world-rankings-section">
        <h2>🌍 World Rankings {new Date().getFullYear()}</h2>
        <p className="section-subtitle">Top 20 teams globally by EPA (Expected Points Added)</p>

        {loadingRankings ? (
          <div className="loading-spinner">Loading rankings...</div>
        ) : topTeams.length > 0 ? (
          <div className="rankings-table-container">
            <table className="rankings-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Team</th>
                  <th>Name</th>
                  <th>EPA</th>
                  <th>Record</th>
                </tr>
              </thead>
              <tbody>
                {topTeams.map((team, idx) => (
                  <tr key={team.team} className={idx < 3 ? 'top-three' : ''}>
                    <td className="rank-cell">
                      {idx === 0 && '🥇'}
                      {idx === 1 && '🥈'}
                      {idx === 2 && '🥉'}
                      {idx > 2 && (idx + 1)}
                    </td>
                    <td>
                      <Link to={`/teams?team=${team.team}`} className="team-link">
                        {team.team}
                      </Link>
                    </td>
                    <td className="team-name-cell">{team.name || `Team ${team.team}`}</td>
                    <td className="epa-cell">{team.epa_end?.toFixed(1) || team.epa?.toFixed(1) || '-'}</td>
                    <td className="record-cell">
                      {team.record ? `${team.record.wins}-${team.record.losses}-${team.record.ties || 0}` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="no-data">No ranking data available for this year yet.</p>
        )}
      </div>

      {/* World Champions Section */}
      <div className="content-card world-champions-section">
        <h2>🏆 FRC World Champions</h2>
        <p className="section-subtitle">Einstein Winning Alliances (2013-2025)</p>

        <div className="champions-list">
          {WORLD_CHAMPIONS.map((champ) => (
            <div key={champ.year} className="champion-card">
              <div className="champion-year">{champ.year}</div>
              <div className="champion-alliance">
                {champ.alliance.map((team, idx) => (
                  <Link
                    key={team.team}
                    to={`/teams?team=${team.team}`}
                    className="alliance-team"
                  >
                    <span className="alliance-team-number">{team.team}</span>
                    <span className="alliance-team-name">{team.name}</span>
                    {idx < champ.alliance.length - 1 && <span className="alliance-separator">•</span>}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

