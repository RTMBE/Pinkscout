/**
 * =============================================================================
 * MOBILE BOTTOM NAVIGATION - Clean, minimalist bottom nav for mobile
 * =============================================================================
 * 
 * Features:
 * - 4 main tabs: Scout, Analytics, Team Search, My Matches
 * - Simple icons and labels
 * - Active state indicator
 * - Only shows on mobile (< 768px)
 * - High contrast for competition use
 */

import { NavLink, useLocation } from 'react-router-dom';
import './MobileBottomNav.css';

const NAV_ITEMS = [
  { path: '/scouting', icon: '📋', label: 'Scout' },
  { path: '/analytics', icon: '📊', label: 'Analytics' },
  { path: '/teams', icon: '🔍', label: 'Teams' },
  { path: '/my-matches', icon: '📅', label: 'Matches' },
];

export default function MobileBottomNav() {
  const location = useLocation();
  
  // Hide on login/signup pages
  const hiddenPaths = ['/login', '/signup', '/'];
  if (hiddenPaths.includes(location.pathname)) {
    return null;
  }

  return (
    <nav className="mobile-bottom-nav" role="navigation" aria-label="Main navigation">
      {NAV_ITEMS.map(({ path, icon, label }) => (
        <NavLink
          key={path}
          to={path}
          className={({ isActive }) => 
            `mobile-nav-item ${isActive ? 'active' : ''}`
          }
        >
          <span className="mobile-nav-icon">{icon}</span>
          <span className="mobile-nav-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

