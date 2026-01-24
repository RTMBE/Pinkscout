/**
 * =============================================================================
 * MAIN.JSX - React Application Entry Point
 * =============================================================================
 *
 * WHAT IS THIS FILE?
 * This is the entry point for the React application. It:
 * 1. Creates the React root element
 * 2. Wraps the app with necessary providers (Auth, Router, Helmet)
 * 3. Mounts the App component to the DOM
 *
 * PROVIDER HIERARCHY:
 * - HelmetProvider: For SEO meta tags
 * - BrowserRouter: For client-side routing
 * - AuthProvider: For Supabase authentication state
 * - App: The main application component
 *
 * =============================================================================
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'

// Import the main App component
import App from './App.jsx'

// Import the Auth context provider for Supabase authentication
import { AuthProvider } from './contexts/AuthContext.jsx'

// Import global styles (ported from existing style.css)
import './index.css'

/**
 * REACT 18 ROOT API
 * -----------------
 * createRoot is the new way to render React apps in React 18+.
 * It enables concurrent features and automatic batching.
 */
ReactDOM.createRoot(document.getElementById('root')).render(
  // StrictMode helps catch bugs during development
  <React.StrictMode>
    {/* HelmetProvider enables dynamic meta tags for SEO */}
    <HelmetProvider>
      {/* BrowserRouter enables client-side routing */}
      <BrowserRouter>
        {/* AuthProvider manages Supabase auth state globally */}
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>
)

