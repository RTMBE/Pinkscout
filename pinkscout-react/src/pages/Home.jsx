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
 * 
 * =============================================================================
 */

import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../contexts/AuthContext';

export default function Home() {
  const { user, userProfile } = useAuth();
  
  // Get display name from profile or email
  const displayName = userProfile?.displayName || user?.displayName || user?.email?.split('@')[0] || 'Scout';

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
    </>
  );
}

