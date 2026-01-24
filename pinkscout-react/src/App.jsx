/**
 * =============================================================================
 * APP.JSX - Main Application Component with Routing
 * =============================================================================
 *
 * WHAT IS THIS FILE?
 * The main application component that:
 * 1. Sets up React Router routes
 * 2. Implements protected routes (auth required)
 * 3. Implements admin-only routes (email-based access)
 * 4. Renders the layout (sidebar + content)
 *
 * ROUTE STRUCTURE:
 * /             → Home (protected)
 * /teams        → Team Search (protected)
 * /events       → Event Page (protected)
 * /scouting     → Scouting Form (protected)
 * /admin        → Admin Panel (protected + email whitelist)
 * /analytics    → Analytics (protected)
 * /login        → Login Page (public, no sidebar)
 * /profile      → Scouter Profile (protected)
 *
 * =============================================================================
 */

import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { lazy, Suspense, useState, useEffect } from 'react';

// Import layout components
import Sidebar from './components/Sidebar';

// =============================================================================
// LAZY LOAD PAGE COMPONENTS
// =============================================================================
// Code splitting: pages are only loaded when navigated to
// This improves initial load time

const Home = lazy(() => import('./pages/Home'));
const Teams = lazy(() => import('./pages/Teams'));
const Events = lazy(() => import('./pages/Events'));
const Scouting = lazy(() => import('./pages/Scouting'));
const Admin = lazy(() => import('./pages/Admin'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Login = lazy(() => import('./pages/Login'));
const Profile = lazy(() => import('./pages/Profile'));
const MyMatches = lazy(() => import('./pages/MyMatches'));

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
 * Wrapper that only allows access if user is an admin
 * Note: The Admin page itself handles email-based access control
 */
function AdminRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Let the Admin page handle its own access control based on email
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
      {mobileMenuOpen && (
        <div
          className="mobile-sidebar-overlay"
          onClick={handleOverlayClick}
          aria-hidden="true"
        />
      )}

      <Sidebar isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      <main className="main-content">
        {children}
      </main>
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
            
            {/* Events - Event schedules and matches */}
            <Route path="/events" element={
              <ProtectedRoute><Events /></ProtectedRoute>
            } />
            
            {/* Scouting - Data entry form */}
            <Route path="/scouting" element={
              <ProtectedRoute><Scouting /></ProtectedRoute>
            } />
            
            {/* Analytics - Charts and comparisons */}
            <Route path="/analytics" element={
              <ProtectedRoute><Analytics /></ProtectedRoute>
            } />
            
            {/* Profile - User profile */}
            <Route path="/profile" element={
              <ProtectedRoute><Profile /></ProtectedRoute>
            } />

            {/* My Matches - User's team matches */}
            <Route path="/my-matches" element={
              <ProtectedRoute><MyMatches /></ProtectedRoute>
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
  );
}

