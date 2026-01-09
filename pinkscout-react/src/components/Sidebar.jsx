/**
 * =============================================================================
 * SIDEBAR.JSX - Navigation Sidebar Component
 * =============================================================================
 * 
 * WHAT IS THIS COMPONENT?
 * The main navigation sidebar displayed on all pages except Login.
 * 
 * FEATURES:
 * - App branding (PinkScout logo)
 * - Navigation links using React Router
 * - Active page highlighting
 * - User info display
 * - Logout button
 * 
 * PROPS: None (uses useAuth hook and useLocation for state)
 * 
 * =============================================================================
 */

import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Sidebar Navigation Component
 * 
 * Displays navigation links and user information.
 * Uses NavLink from React Router for automatic active class.
 */
export default function Sidebar() {
  // Get auth state from context
  const { user, logout } = useAuth();

  // Handle logout click
  const handleLogout = async () => {
    try {
      await logout();
      // Navigation to login is handled by protected route logic
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <aside className="sidebar">
      {/* ================================================================
          SIDEBAR HEADER - App Branding
          ================================================================ */}
      <div className="sidebar-header">
        <h2>🤖 PinkScout</h2>
        <span>FRC Scouting App</span>
      </div>

      {/* ================================================================
          NAVIGATION LINKS
          ================================================================
          NavLink automatically adds 'active' class to current route.
          This matches the behavior of the original HTML pages.
          ================================================================ */}
      <nav className="sidebar-nav">
        <ul>
          <li>
            <NavLink to="/" end>
              🏠 Home
            </NavLink>
          </li>
          <li>
            <NavLink to="/dashboard">
              📊 Dashboard
            </NavLink>
          </li>
          <li>
            <NavLink to="/scouting">
              📝 Scout
            </NavLink>
          </li>
          <li>
            <NavLink to="/teams">
              🤖 Teams
            </NavLink>
          </li>
          <li>
            <NavLink to="/events">
              🏆 Events
            </NavLink>
          </li>
          <li>
            <NavLink to="/analytics">
              📈 Analytics
            </NavLink>
          </li>
          <li>
            <NavLink to="/profile">
              👤 Profile
            </NavLink>
          </li>
          <li>
            <NavLink to="/admin">
              ⚙️ Admin
            </NavLink>
          </li>
        </ul>
      </nav>

      {/* ================================================================
          USER INFO SECTION
          ================================================================
          Only displayed when user is logged in.
          Shows email and logout button.
          ================================================================ */}
      {user && (
        <div className="user-info">
          <div className="user-email">{user.email}</div>
          <button className="btn-logout" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      )}
    </aside>
  );
}

