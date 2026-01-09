/**
 * =============================================================================
 * FIREBASE.JS - Firebase Configuration, API Keys, and Initialization
 * =============================================================================
 *
 * WHAT IS THIS FILE?
 * This is the central configuration file for Firebase and external APIs.
 * It initializes Firebase services and stores API keys for:
 * - The Blue Alliance (TBA) - FRC event and match data
 * - Statbotics - EPA ratings and team statistics
 * - FRC Nexus - Additional FRC data
 *
 * SERVICES USED IN THIS APP:
 * 1. Firebase Auth - User authentication (login/signup)
 * 2. Firestore - Database for storing scouting data
 * 3. The Blue Alliance API - Event schedules, team lists, match results
 * 4. Statbotics API - EPA ratings and rankings
 * 5. FRC Nexus API - Additional team data
 *
 * FIRESTORE SCHEMA:
 * -----------------
 * users/{uid}
 *   - email: string
 *   - displayName: string
 *   - role: "scouter" | "admin"
 *   - createdAt: timestamp
 *
 * scouting/{docId}
 *   - teamNumber: string
 *   - matchNumber: string
 *   - eventKey: string
 *   - scouterName: string
 *   - autoPoints: number
 *   - teleopPoints: number
 *   - notes: string
 *   - createdAt: timestamp
 *
 * questions/{docId}
 *   - text: string
 *   - category: "Auto" | "Teleop" | "Endgame" | "Notes"
 *   - type: "number" | "text" | "toggle"
 *   - order: number
 *
 * settings/admins
 *   - emails: string[] (array of admin email addresses)
 *
 * settings/apiKeys (optional - for dynamic key storage)
 *   - tba: string
 *   - statbotics: string (not required - public API)
 *   - nexus: string
 *
 * =============================================================================
 */


// =============================================================================
// IMPORTS - Loading Firebase Modules
// =============================================================================
//
// ES6 MODULES EXPLAINED:
// - 'import' brings in code from other files/libraries
// - We're loading Firebase from Google's CDN (Content Delivery Network)
// - The version number (10.7.1) ensures we get a specific, tested version
//
// WHY CDN?
// - No need to install packages locally
// - Fast loading from Google's servers
// - Works directly in the browser
//
// =============================================================================

// Core Firebase app - required for all Firebase services
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';

// Firestore database - for storing and retrieving scouting data
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Firebase Authentication - for user login/signup
// Note: We rename 'signOut' to 'firebaseSignOut' to avoid naming conflicts
import {
  getAuth,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';


// =============================================================================
// FIREBASE CONFIGURATION
// =============================================================================
//
// ⚠️ IMPORTANT: Replace these placeholder values with your actual Firebase config!
//
// Each value explained:
// - apiKey: Identifies your app to Firebase (not a secret, but don't abuse it)
// - authDomain: Domain for authentication popups
// - projectId: Unique identifier for your Firebase project
// - storageBucket: Cloud storage location (for file uploads)
// - messagingSenderId: For push notifications (not used in this app)
// - appId: Unique identifier for this specific app
//
// =============================================================================

const firebaseConfig = {
  apiKey: "AIzaSyCqUoIrwQdBFlaF0P9NfTRN7pVfji5p3-M",
  authDomain: "pinkscout-470d1.firebaseapp.com",
  projectId: "pinkscout-470d1",
  storageBucket: "pinkscout-470d1.firebasestorage.app",
  messagingSenderId: "386591970958",
  appId: "1:386591970958:web:a7a9483684c3418cea1bdf",
  measurementId: "G-HM5D0Z7L6N"
};


// =============================================================================
// EXTERNAL API KEYS CONFIGURATION
// =============================================================================
//
// These are the API keys for external FRC data services.
//
// HOW TO GET THESE KEYS:
// ----------------------
// 1. THE BLUE ALLIANCE (TBA):
//    - Go to: https://www.thebluealliance.com/account
//    - Sign in with Google
//    - Click "Read API Keys" → "Add New Key"
//    - Copy the key and paste it below
//
// 2. STATBOTICS:
//    - No API key required! It's a public API.
//    - Endpoint: https://api.statbotics.io/v3/
//
// 3. FRC NEXUS:
//    - Contact FRC Nexus for an API key
//    - Endpoint varies by use case
//
// SECURITY NOTE:
// These keys are visible in client-side code. For production apps with
// sensitive keys, consider using Firebase Functions as a proxy.
//
// =============================================================================

const API_KEYS = {
  // The Blue Alliance API Key
  // Used for: event lists, team lists, match schedules, match results
  TBA: 'bGxLkGYmh9cBfFpmYIe2M09qv2wiV86KzjxiUi26VivhkyguchrZkWkNFEDXPrYU',

  // Statbotics - No key needed (public API)
  // Used for: EPA ratings, team rankings, historical stats
  STATBOTICS: null,

  // FRC Nexus API Key
  // Used for: Additional team data, scouting integrations
  NEXUS: 'RWxNTz7HLOYxRPwWdwVND193vyk'
};

// API Base URLs
const API_URLS = {
  TBA: 'https://www.thebluealliance.com/api/v3',
  STATBOTICS: 'https://api.statbotics.io/v3',
  NEXUS: 'https://frc.nexus/api/v1'
};

// Primary admin email (always has access)
const PRIMARY_ADMIN_EMAIL = 'rtmbe20@gmail.com';


// =============================================================================
// INITIALIZE FIREBASE SERVICES
// =============================================================================
//
// Order matters! We must initialize the app first, then individual services.
//
// =============================================================================

// Step 1: Initialize the Firebase app with our config
const app = initializeApp(firebaseConfig);

// Step 2: Initialize Firestore (database)
const db = getFirestore(app);

// Step 3: Initialize Authentication
const auth = getAuth(app);

// Log initialization
console.log('🔥 Firebase initialized successfully');
console.log('📦 Firestore database ready');
console.log('🔐 Firebase Auth ready');
console.log('🔑 API Keys configured:', {
  TBA: API_KEYS.TBA ? '✓ Set' : '✗ Missing',
  Statbotics: 'Public API',
  Nexus: API_KEYS.NEXUS ? '✓ Set' : '✗ Missing'
});


// =============================================================================
// AUTHENTICATION HELPER FUNCTIONS
// =============================================================================
//
// These functions wrap Firebase Auth methods to make them easier to use
// throughout the application.
//
// =============================================================================

/**
 * SIGN OUT FUNCTION
 * -----------------
 * Signs out the current user and redirects to login page.
 *
 * ASYNC/AWAIT EXPLAINED:
 * - 'async' marks this function as asynchronous (it does something that takes time)
 * - 'await' pauses execution until the Firebase operation completes
 * - This prevents the redirect from happening before signout is complete
 *
 * TRY/CATCH EXPLAINED:
 * - 'try' block contains code that might fail
 * - 'catch' block handles any errors that occur
 * - This prevents the app from crashing on errors
 */
async function signOut() {
  try {
    // Wait for Firebase to complete the sign out
    await firebaseSignOut(auth);
    console.log('✅ User signed out successfully');

    // Redirect to login page after successful signout
    window.location.href = 'login.html';
  } catch (error) {
    // Log the error for debugging
    console.error('❌ Error signing out:', error);

    // Re-throw so calling code can handle it
    throw error;
  }
}


/**
 * GET CURRENT USER
 * ----------------
 * Returns the currently logged-in user, or null if no one is logged in.
 *
 * USAGE:
 *   const user = getCurrentUser();
 *   if (user) {
 *     console.log('Logged in as:', user.email);
 *   }
 *
 * NOTE: This returns the user synchronously. If you need to wait for
 * auth state to be determined, use requireAuth() instead.
 */
function getCurrentUser() {
  return auth.currentUser;
}


/**
 * REQUIRE AUTHENTICATION
 * ----------------------
 * Checks if a user is logged in. If not, redirects to login page.
 *
 * PROMISES EXPLAINED:
 * - A Promise represents a value that will be available in the future
 * - 'resolve' is called when the operation succeeds
 * - We use this because auth state isn't immediately available on page load
 *
 * USAGE:
 *   // At the top of a protected page:
 *   const user = await requireAuth();
 *   // Code here only runs if user is logged in
 *
 * @param {boolean} redirectIfNotAuth - If true, redirect to login when not authenticated
 * @returns {Promise<Object|null>} The user object, or null if not authenticated
 */
function requireAuth(redirectIfNotAuth = true) {
  return new Promise((resolve) => {
    // onAuthStateChanged fires when auth state is determined
    onAuthStateChanged(auth, (user) => {
      if (user) {
        // User is logged in - resolve with user object
        resolve(user);
      } else if (redirectIfNotAuth) {
        // User is NOT logged in - redirect to login page
        window.location.href = 'login.html';
      } else {
        // User is NOT logged in, but don't redirect
        resolve(null);
      }
    });
  });
}


/**
 * SETUP AUTH STATE LISTENER
 * -------------------------
 * Sets up a listener that fires whenever auth state changes.
 * This is useful for updating the UI when a user logs in or out.
 *
 * CALLBACK FUNCTIONS EXPLAINED:
 * - A callback is a function passed as an argument to another function
 * - It gets "called back" when something happens
 * - This allows different pages to respond differently to auth changes
 *
 * USAGE:
 *   setupAuthListener(
 *     (user) => { console.log('Logged in:', user.email); },
 *     () => { console.log('Logged out'); }
 *   );
 *
 * @param {Function} onUserSignedIn - Called when user signs in
 * @param {Function} onUserSignedOut - Called when user signs out
 */
function setupAuthListener(onUserSignedIn, onUserSignedOut) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      // User is signed in
      console.log('👤 User is signed in:', user.email);
      if (onUserSignedIn) onUserSignedIn(user);
    } else {
      // User is signed out
      console.log('👤 No user signed in');
      if (onUserSignedOut) onUserSignedOut();
    }
  });
}


// =============================================================================
// EXPORTS
// =============================================================================
//
// ES6 EXPORTS EXPLAINED:
// - 'export' makes variables/functions available to other files
// - Other files can 'import' these using: import { db, auth } from './firebase.js'
// - Only exported items are accessible from outside this file
//
// WHAT WE EXPORT:
// - db: Firestore database reference (for data operations)
// - auth: Firebase Auth reference (for auth operations)
// - app: Firebase app instance (rarely needed directly)
// - API_KEYS: External API keys object
// - API_URLS: External API base URLs
// - PRIMARY_ADMIN_EMAIL: The primary admin email address
// - signOut: Function to sign out the current user
// - getCurrentUser: Function to get the current user
// - requireAuth: Function to require authentication on a page
// - setupAuthListener: Function to listen for auth state changes
//
// =============================================================================

export {
  db,
  auth,
  app,
  API_KEYS,
  API_URLS,
  PRIMARY_ADMIN_EMAIL,
  signOut,
  getCurrentUser,
  requireAuth,
  setupAuthListener
};
