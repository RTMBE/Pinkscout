/**
 * =============================================================================
 * SIDEBAR.JSX - Navigation Sidebar Component (Redesigned)
 * =============================================================================
 *
 * WHAT IS THIS COMPONENT?
 * The main navigation sidebar with grouped navigation for cleaner UX.
 * Consolidated from 12+ items to 6 main groups.
 *
 * NAVIGATION GROUPS:
 * 1. Dashboard - Home, My Matches
 * 2. Scouting - Match Scout, Pit Scout, Config
 * 3. Teams - Teams Search, Compare
 * 4. Competition - Events, Alliance Picks, Strategy
 * 5. Insights - Analytics, Rules Reference
 * 6. Account - Profile, Admin (if admin), Theme
 *
 * =============================================================================
 */

import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from './ThemeToggle';

// Navigation group configuration (no Dashboard - Home/My Matches are top-level)
const NAV_GROUPS = {
  scouting: {
    label: 'Scouting',
    icon: '📝',
    routes: ['/scouting', '/pit-scouting']
  },
  teams: {
    label: 'Teams',
    icon: '🤖',
    routes: ['/teams']
  },
  competition: {
    label: 'Competition',
    icon: '🏆',
    routes: ['/events', '/recommended-alliance', '/strategy']
  },
  insights: {
    label: 'Insights',
    icon: '📊',
    routes: ['/analytics', '/compare', '/rules']
  },
  account: {
    label: 'Account',
    icon: '👤',
    routes: ['/profile', '/admin', '/scouting-config']
  }
};

/**
 * Sidebar Navigation Component (Redesigned with Groups)
 */
export default function Sidebar({ isOpen = false, onClose }) {
  const { user, userProfile, logout } = useAuth();
  const location = useLocation();

  // Track which groups are expanded
  const [expandedGroups, setExpandedGroups] = useState(() => {
    // Auto-expand the group containing the current route
    const saved = localStorage.getItem('pinkscout_sidebar_expanded');
    return saved ? JSON.parse(saved) : { scouting: true };
  });

  // Auto-expand group when route changes
  useEffect(() => {
    const currentPath = location.pathname;
    for (const [groupKey, group] of Object.entries(NAV_GROUPS)) {
      if (group.routes.some(route =>
        route === currentPath ||
        (route !== '/' && currentPath.startsWith(route))
      )) {
        setExpandedGroups(prev => ({ ...prev, [groupKey]: true }));
        break;
      }
    }
  }, [location.pathname]);

  // Save expanded state
  useEffect(() => {
    localStorage.setItem('pinkscout_sidebar_expanded', JSON.stringify(expandedGroups));
  }, [expandedGroups]);

  const toggleGroup = (groupKey) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  };

  const isGroupActive = (groupKey) => {
    const group = NAV_GROUPS[groupKey];
    return group.routes.some(route =>
      route === location.pathname ||
      (route !== '/' && location.pathname.startsWith(route))
    );
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Check if user is admin
  const isAdmin = userProfile?.role === 'master_admin' || userProfile?.role === 'admin';
  const hasTeam = userProfile?.teamNumber;

  return (
    <aside className={`sidebar sidebar-redesigned ${isOpen ? 'mobile-open' : ''}`}>
      {/* Compact Header */}
      <div className="sidebar-header-compact">
        <div className="sidebar-logo">
          <span className="logo-icon">🤖</span>
          <div className="logo-text">
            <span className="logo-title">PinkScout</span>
            <span className="logo-subtitle">FRC Scouting</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav-grouped">
        {/* Top-level Home link */}
        <div className="nav-top-level">
          <NavLink to="/" end onClick={onClose} className="nav-top-link">
            <span className="nav-item-icon">🏠</span> Home
          </NavLink>
        </div>

        {/* Top-level My Matches link (only if user has team) */}
        {hasTeam && (
          <div className="nav-top-level">
            <NavLink to="/my-matches" onClick={onClose} className="nav-top-link">
              <span className="nav-item-icon">📅</span> My Matches
            </NavLink>
          </div>
        )}

        {/* Divider */}
        <div className="nav-divider"></div>

        {/* Scouting Group */}
        <div className={`nav-group ${isGroupActive('scouting') ? 'active' : ''}`}>
          <button
            className="nav-group-header"
            onClick={() => toggleGroup('scouting')}
            aria-expanded={expandedGroups.scouting}
          >
            <span className="nav-group-icon">📝</span>
            <span className="nav-group-label">Scouting</span>
            <span className={`nav-group-arrow ${expandedGroups.scouting ? 'expanded' : ''}`}>▸</span>
          </button>
          {expandedGroups.scouting && (
            <ul className="nav-group-items">
              <li>
                <NavLink to="/scouting" onClick={onClose}>
                  <span className="nav-item-icon">📋</span> Match Scout
                </NavLink>
              </li>
              <li>
                <NavLink to="/pit-scouting" onClick={onClose}>
                  <span className="nav-item-icon">🔧</span> Pit Scout
                </NavLink>
              </li>
            </ul>
          )}
        </div>

        {/* Teams Group */}
        <div className={`nav-group ${isGroupActive('teams') ? 'active' : ''}`}>
          <button
            className="nav-group-header"
            onClick={() => toggleGroup('teams')}
            aria-expanded={expandedGroups.teams}
          >
            <span className="nav-group-icon">🤖</span>
            <span className="nav-group-label">Teams</span>
            <span className={`nav-group-arrow ${expandedGroups.teams ? 'expanded' : ''}`}>▸</span>
          </button>
          {expandedGroups.teams && (
            <ul className="nav-group-items">
              <li>
                <NavLink to="/teams" onClick={onClose}>
                  <span className="nav-item-icon">🔍</span> Search
                </NavLink>
              </li>
            </ul>
          )}
        </div>

        {/* Competition Group */}
        <div className={`nav-group ${isGroupActive('competition') ? 'active' : ''}`}>
          <button
            className="nav-group-header"
            onClick={() => toggleGroup('competition')}
            aria-expanded={expandedGroups.competition}
          >
            <span className="nav-group-icon">🏆</span>
            <span className="nav-group-label">Competition</span>
            <span className={`nav-group-arrow ${expandedGroups.competition ? 'expanded' : ''}`}>▸</span>
          </button>
          {expandedGroups.competition && (
            <ul className="nav-group-items">
              <li>
                <NavLink to="/events" onClick={onClose}>
                  <span className="nav-item-icon">📆</span> Events
                </NavLink>
              </li>
              {hasTeam && (
                <li>
                  <NavLink to="/recommended-alliance" onClick={onClose}>
                    <span className="nav-item-icon">🤝</span> Alliance Picks
                  </NavLink>
                </li>
              )}
              <li>
                <NavLink to="/strategy" onClick={onClose}>
                  <span className="nav-item-icon">🎯</span> Strategy Board
                </NavLink>
              </li>
            </ul>
          )}
        </div>

        {/* Insights Group */}
        <div className={`nav-group ${isGroupActive('insights') ? 'active' : ''}`}>
          <button
            className="nav-group-header"
            onClick={() => toggleGroup('insights')}
            aria-expanded={expandedGroups.insights}
          >
            <span className="nav-group-icon">📊</span>
            <span className="nav-group-label">Insights</span>
            <span className={`nav-group-arrow ${expandedGroups.insights ? 'expanded' : ''}`}>▸</span>
          </button>
          {expandedGroups.insights && (
            <ul className="nav-group-items">
              <li>
                <NavLink to="/analytics" onClick={onClose}>
                  <span className="nav-item-icon">📈</span> Analytics
                </NavLink>
              </li>
              <li>
                <NavLink to="/compare" onClick={onClose}>
                  <span className="nav-item-icon">⚖️</span> Compare
                </NavLink>
              </li>
              <li>
                <NavLink to="/rules" onClick={onClose}>
                  <span className="nav-item-icon">📖</span> Rules
                </NavLink>
              </li>
            </ul>
          )}
        </div>

        {/* Account Group */}
        <div className={`nav-group ${isGroupActive('account') ? 'active' : ''}`}>
          <button
            className="nav-group-header"
            onClick={() => toggleGroup('account')}
            aria-expanded={expandedGroups.account}
          >
            <span className="nav-group-icon">👤</span>
            <span className="nav-group-label">Account</span>
            <span className={`nav-group-arrow ${expandedGroups.account ? 'expanded' : ''}`}>▸</span>
          </button>
          {expandedGroups.account && (
            <ul className="nav-group-items">
              <li>
                <NavLink to="/profile" onClick={onClose}>
                  <span className="nav-item-icon">👤</span> Profile
                </NavLink>
              </li>
              <li>
                <NavLink to="/scouting-config" onClick={onClose}>
                  <span className="nav-item-icon">⚙️</span> Settings
                </NavLink>
              </li>
              {isAdmin && (
                <li>
                  <NavLink to="/admin" onClick={onClose}>
                    <span className="nav-item-icon">🔐</span> Admin
                  </NavLink>
                </li>
              )}
              <li className="nav-item-theme">
                <ThemeToggle compact />
              </li>
            </ul>
          )}
        </div>
      </nav>

      {/* User Info Footer */}
      {user && (
        <div className="sidebar-footer">
          <div className="user-info-compact">
            <div className="user-avatar">
              {(userProfile?.displayName || user.email)?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="user-details">
              <span className="user-name">{userProfile?.displayName || 'User'}</span>
              {userProfile?.teamNumber && (
                <span className="user-team">Team {userProfile.teamNumber}</span>
              )}
            </div>
          </div>
          <button className="btn-logout-compact" onClick={handleLogout} title="Sign Out">
            <span style={{ marginRight: '4px' }}>🚪</span>
            <span style={{ fontSize: '0.75rem' }}>Sign Out</span>
          </button>
        </div>
      )}
    </aside>
  );
}

