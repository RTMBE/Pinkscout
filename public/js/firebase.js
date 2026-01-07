/**
 * =============================================================================
 * FIREBASE.JS - Firebase Configuration and Initialization
 * =============================================================================
 *
 * WHAT IS THIS FILE?
 * This is the central Firebase configuration file. It initializes Firebase
 * services and exports them for use throughout the application.
 *
 * WHAT IS FIREBASE?
 * Firebase is a Backend-as-a-Service (BaaS) platform by Google that provides:
 * - Authentication (user login/signup)
 * - Firestore (NoSQL database)
 * - Hosting (deploy your website)
 * - And many more services
 *
 * WHY USE FIREBASE?
 * - No need to build your own server
 * - Real-time data synchronization
 * - Built-in security rules
 * - Free tier is generous for small projects
 *
 * SERVICES USED IN THIS APP:
 * 1. Firebase Auth - User authentication (login/signup)
 * 2. Firestore - Database for storing scouting data
 *
 * HOW TO GET YOUR FIREBASE CONFIG:
 * 1. Go to https://console.firebase.google.com/
 * 2. Create a new project (or select existing)
 * 3. Click the gear icon → Project settings
 * 4. Scroll down to "Your apps" → Click web icon (</>)
 * 5. Register your app and copy the config object
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
  appId: "1:386591970958:web:a7a9483684c3418cea1bdf"
};


// =============================================================================
// INITIALIZE FIREBASE SERVICES
// =============================================================================
//
// Order matters! We must initialize the app first, then individual services.
//
// =============================================================================

// Step 1: Initialize the Firebase app with our config
// This creates the connection to Firebase
const app = initializeApp(firebaseConfig);

// Step 2: Initialize Firestore (database)
// 'db' is the database reference we'll use for all data operations
const db = getFirestore(app);

// Step 3: Initialize Authentication
// 'auth' is the auth reference we'll use for login/logout operations
const auth = getAuth(app);

// Log to console so we know Firebase loaded correctly
// Open browser DevTools (F12) → Console to see these messages
console.log('🔥 Firebase initialized successfully');
console.log('📦 Firestore database ready');
console.log('🔐 Firebase Auth ready');


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
// ADMIN ACCESS CONTROL
// =============================================================================
//
// Only specific email addresses are allowed to access admin features.
// This is a simple whitelist approach - more complex apps might use
// custom claims or database roles.
//
// =============================================================================

/**
 * ADMIN EMAIL LIST
 * ----------------
 * These Gmail accounts have admin access to the app.
 * Add or remove emails here to control admin access.
 */
const ADMIN_EMAILS = [
  'rtmbe20@gmail.com',
  'ontrandem18@gmail.com'
];


/**
 * CHECK IF USER IS ADMIN
 * ----------------------
 * Checks if the given email address is in the admin whitelist.
 *
 * @param {string} email - The email address to check
 * @returns {boolean} True if the email is an admin, false otherwise
 *
 * USAGE:
 *   if (isAdmin(user.email)) {
 *     // Show admin features
 *   }
 */
function isAdmin(email) {
  if (!email) return false;
  // Convert to lowercase for case-insensitive comparison
  return ADMIN_EMAILS.includes(email.toLowerCase());
}


/**
 * REQUIRE ADMIN ACCESS
 * --------------------
 * Checks if the current user is an admin. If not, redirects to dashboard.
 * Use this at the top of admin-only pages.
 *
 * @param {string} redirectUrl - Where to redirect non-admins (default: dashboard.html)
 * @returns {Promise<Object|null>} The user object if admin, null otherwise
 *
 * USAGE:
 *   // At the top of an admin page:
 *   const user = await requireAdmin();
 *   // Code here only runs if user is an admin
 */
function requireAdmin(redirectUrl = 'dashboard.html') {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (!user) {
        // Not logged in - redirect to login
        window.location.href = 'login.html';
        resolve(null);
      } else if (!isAdmin(user.email)) {
        // Logged in but not an admin - redirect to dashboard
        console.warn('⛔ Access denied: User is not an admin');
        window.location.href = redirectUrl;
        resolve(null);
      } else {
        // User is an admin - allow access
        console.log('✅ Admin access granted for:', user.email);
        resolve(user);
      }
    });
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
// - signOut: Function to sign out the current user
// - getCurrentUser: Function to get the current user
// - requireAuth: Function to require authentication on a page
// - setupAuthListener: Function to listen for auth state changes
// - isAdmin: Function to check if an email is an admin
// - requireAdmin: Function to require admin access on a page
// - ADMIN_EMAILS: List of admin email addresses
//
// =============================================================================

export {
  db,
  auth,
  app,
  signOut,
  getCurrentUser,
  requireAuth,
  setupAuthListener,
  isAdmin,
  requireAdmin,
  ADMIN_EMAILS
};
