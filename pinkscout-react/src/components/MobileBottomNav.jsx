/**
 * =============================================================================
 * MOBILE BOTTOM NAVIGATION - Sticky bottom nav for phones
 * =============================================================================
 * 
 * Provides quick access to key features on mobile devices.
 * Only visible on screens < 768px.
 * 
 * =============================================================================
 */

import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function MobileBottomNav() {
  const { userProfile } = useAuth();

  return (
    <nav className="mobile-bottom-nav">
      <NavLink to="/scouting" className="bottom-nav-item">
        <span className="bottom-nav-icon">📝</span>
        <span className="bottom-nav-label">Scout</span>
      </NavLink>
      
      <NavLink to="/pit-scouting" className="bottom-nav-item">
        <span className="bottom-nav-icon">🔧</span>
        <span className="bottom-nav-label">Pit</span>
      </NavLink>

      <NavLink to="/analytics" className="bottom-nav-item">
        <span className="bottom-nav-icon">📈</span>
        <span className="bottom-nav-label">Analytics</span>
      </NavLink>

      {userProfile?.teamNumber && (
        <NavLink to="/recommended-alliance" className="bottom-nav-item">
          <span className="bottom-nav-icon">🤝</span>
          <span className="bottom-nav-label">Alliance</span>
        </NavLink>
      )}

      <NavLink to="/profile" className="bottom-nav-item">
        <span className="bottom-nav-icon">👤</span>
        <span className="bottom-nav-label">Profile</span>
      </NavLink>
    </nav>
  );
}

