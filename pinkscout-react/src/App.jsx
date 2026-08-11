/**
 * =============================================================================
 * APP.JSX - Main Application Component with Routing
 * =============================================================================
 *
 * WHAT IS THIS FILE?
 * The main application component that:
 * 1. Sets up React Router routes
 * 2. Implements protected routes (auth required)
 * 3. Implements admin-only routes (server-backed platform role)
 * 4. Renders the layout (sidebar + content)
 *
 * ROUTE STRUCTURE:
 * /             → Home (protected)
 * /teams        → Team Search (protected)
 * /events       → Event Page (protected)
 * /scouting     → Scouting Form (protected)
 * /admin        → Admin Panel (protected + platform-admin role)
 * /analytics    → Analytics (protected)
 * /rules        → Rules Reference (public)
 * /login        → Login Page (public, no sidebar)
 * /profile      → Scouter Profile (protected)
 *
 * =============================================================================
 */

import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { lazy, Suspense, useState, useEffect } from 'react';

// TeamRedirect component - redirects /team/:teamNumber to /teams?team=:teamNumber
function TeamRedirect() {
  const { teamNumber } = useParams();
  return <Navigate to={`/teams?team=${teamNumber}`} replace />;
}

// Import layout components
import Sidebar from './components/Sidebar';
import OfflineIndicator from './components/OfflineIndicator';
import MobileBottomNav from './components/MobileBottomNav';

// =============================================================================
// LAZY LOAD PAGE COMPONENTS
// =============================================================================
// Code splitting: pages are only loaded when navigated to
// This improves initial load time

const Home = lazy(() => import('./pages/Home'));
const Teams = lazy(() => import('./pages/Teams'));
const Events = lazy(() => import('./pages/Events'));
const Scouting = lazy(() => import('./pages/Scouting'));
const PitScouting = lazy(() => import('./pages/PitScouting'));
const Strategy = lazy(() => import('./pages/Strategy'));
const Admin = lazy(() => import('./pages/Admin'));
const Analytics = lazy(() => import('./pages/Analytics'));
const RulesReference = lazy(() => import('./pages/RulesReference'));
const Login = lazy(() => import('./pages/Login'));
const Profile = lazy(() => import('./pages/Profile'));
const MyMatches = lazy(() => import('./pages/MyMatches'));
const RecommendedAlliance = lazy(() => import('./pages/RecommendedAlliance'));
const ScoutingConfig = lazy(() => import('./pages/ScoutingConfig'));
const Compare = lazy(() => import('./pages/Compare'));

// =============================================================================
// LOADING FALLBACK COMPONENT
// =============================================================================

function LoadingSpinner() {
  return (
    <div className="loading-container">
      <div className="loading-spinner"></div>
      <p>Loading...</p>
    </div>
  );
}

// =============================================================================
// PROTECTED ROUTE COMPONENT
// =============================================================================
/**
 * Wrapper that redirects to login if user is not authenticated
 */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  
  // Show loading while checking auth
  if (loading) {
    return <LoadingSpinner />;
  }
  
  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
}

// =============================================================================
// ADMIN ROUTE COMPONENT
// =============================================================================
/**
 * Wrapper that only allows access when the membership RPC identifies a
 * platform administrator. The database RLS is still authoritative.
 */
function AdminRoute({ children }) {
  const { user, loading, roleContext } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!roleContext?.isMasterAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}

// =============================================================================
// LAYOUT COMPONENT
// =============================================================================
/**
 * Main layout with sidebar (used for all pages except login)
 * Includes mobile sidebar toggle functionality
 */
function Layout({ children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Close mobile menu when clicking overlay
  const handleOverlayClick = () => {
    setMobileMenuOpen(false);
  };

  // Toggle mobile menu
  const toggleMobileMenu = () => {
    setMobileMenuOpen(prev => !prev);
  };

  return (
    <div className="app-container">
      {/* Mobile hamburger button - only visible on mobile */}
      <button
        className="mobile-menu-btn"
        onClick={toggleMobileMenu}
        aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={mobileMenuOpen}
      >
        {mobileMenuOpen ? '✕' : '☰'}
      </button>

      {/* Overlay for mobile - closes sidebar when clicked */}
      {/* Always in DOM for smooth fade-out animation */}
      <div
        className={`mobile-sidebar-overlay ${mobileMenuOpen ? 'active' : ''}`}
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      <Sidebar isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      <main className="main-content">
        {children}
      </main>
      <MobileBottomNav />
    </div>
  );
}

// =============================================================================
// MAIN APP COMPONENT
// =============================================================================

export default function App() {
  const location = useLocation();
  
  // Check if current route is login (no sidebar needed)
  const isLoginPage = location.pathname === '/login';

  return (
    <>
      {/* Offline indicator - shows at top when offline or syncing */}
      <OfflineIndicator />

      <Suspense fallback={<LoadingSpinner />}>
        {isLoginPage ? (
          // Login page: no sidebar
          <Routes>
            <Route path="/login" element={<Login />} />
          </Routes>
        ) : (
          // All other pages: with sidebar layout
          <Layout>
          <Routes>
            {/* Home - Landing page */}
            <Route path="/" element={
              <ProtectedRoute><Home /></ProtectedRoute>
            } />

            {/* Teams - Team search and stats */}
            <Route path="/teams" element={
              <ProtectedRoute><Teams /></ProtectedRoute>
            } />

            {/* Team Data Page - Direct link to team (redirects to Teams with query param) */}
            <Route path="/team/:teamNumber" element={
              <ProtectedRoute><TeamRedirect /></ProtectedRoute>
            } />

            {/* Events - Event schedules and matches */}
            <Route path="/events" element={
              <ProtectedRoute><Events /></ProtectedRoute>
            } />
            
            {/* Scouting - Data entry form */}
            <Route path="/scouting" element={
              <ProtectedRoute><Scouting /></ProtectedRoute>
            } />

            {/* Pit Scouting - Pre-event robot configuration */}
            <Route path="/pit-scouting" element={
              <ProtectedRoute><PitScouting /></ProtectedRoute>
            } />

            {/* Strategy Board - Drawing and planning */}
            <Route path="/strategy" element={
              <ProtectedRoute><Strategy /></ProtectedRoute>
            } />

            {/* Analytics - Charts and comparisons */}
            <Route path="/analytics" element={
              <ProtectedRoute><Analytics /></ProtectedRoute>
            } />

            {/* Compare - Multi-team comparison with charts */}
            <Route path="/compare" element={
              <ProtectedRoute><Compare /></ProtectedRoute>
            } />

            {/* Rules Reference - Public FRC 2026 game rules */}
            <Route path="/rules" element={<RulesReference />} />
            
            {/* Profile - User profile */}
            <Route path="/profile" element={
              <ProtectedRoute><Profile /></ProtectedRoute>
            } />

            {/* My Matches - User's team matches */}
            <Route path="/my-matches" element={
              <ProtectedRoute><MyMatches /></ProtectedRoute>
            } />

            {/* Recommended Alliance - Alliance partner recommendations */}
            <Route path="/recommended-alliance" element={
              <ProtectedRoute><RecommendedAlliance /></ProtectedRoute>
            } />

            {/* Scouting Config - Team lead configuration for scouting fields */}
            <Route path="/scouting-config" element={
              <ProtectedRoute><ScoutingConfig /></ProtectedRoute>
            } />

            {/* Admin - Admin panel (admin only) */}
            <Route path="/admin" element={
              <AdminRoute><Admin /></AdminRoute>
            } />

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      )}
      </Suspense>
    </>
  );
}
