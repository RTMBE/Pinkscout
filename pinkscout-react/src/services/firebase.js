/**
 * =============================================================================
 * FIREBASE.JS - Firebase Configuration & Initialization (React Version)
 * =============================================================================
 * 
 * WHAT IS THIS FILE?
 * Central Firebase configuration for the React app. Initializes:
 * - Firebase App
 * - Firestore Database
 * - Firebase Authentication
 * 
 * FIRESTORE SCHEMA (unchanged from vanilla JS version):
 * -----------------------------------------------------
 * users/{uid}
 *   - email: string
 *   - displayName: string
 *   - role: "scouter" | "admin"
 *   - createdAt: timestamp
 * 
 * scouting/{docId}
 *   - teamNumber: number
 *   - matchNumber: number
 *   - eventKey: string
 *   - scouterName: string
 *   - autoSpeaker, autoAmp, teleopSpeaker, teleopAmp, etc.
 *   - createdAt: timestamp
 * 
 * questions/{docId}
 *   - text: string
 *   - category: "Auto" | "Teleop" | "Endgame" | "Notes"
 *   - type: "number" | "text" | "toggle"
 *   - order: number
 * 
 * settings/admins
 *   - emails: string[] (admin email addresses)
 * 
 * =============================================================================
 */

import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// =============================================================================
// FIREBASE CONFIGURATION
// =============================================================================
// These values come from Firebase Console > Project Settings > Your apps
// They are safe to expose in client-side code (Firebase Security Rules protect data)

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

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Firestore (database)
const db = getFirestore(app);

// Initialize Firebase Authentication
const auth = getAuth(app);

// =============================================================================
// API KEYS FOR EXTERNAL SERVICES
// =============================================================================
// These are used to fetch data from FRC data providers

export const API_KEYS = {
  // The Blue Alliance API Key - for event/team/match data
  TBA: 'bGxLkGYmh9cBfFpmYIe2M09qv2wiV86KzjxiUi26VivhkyguchrZkWkNFEDXPrYU',
  
  // Statbotics - Public API, no key needed
  STATBOTICS: null,
  
  // FRC Nexus API Key
  NEXUS: 'RWxNTz7HLOYxRPwWdwVND193vyk'
};

// =============================================================================
// API BASE URLS
// =============================================================================

export const API_URLS = {
  TBA: 'https://www.thebluealliance.com/api/v3',
  STATBOTICS: 'https://api.statbotics.io/v3',
  NEXUS: 'https://frc.nexus/api/v1'
};

// =============================================================================
// ADMIN CONFIGURATION
// =============================================================================

// Primary admin email - always has admin access
export const PRIMARY_ADMIN_EMAIL = 'rtmbe20@gmail.com';

// =============================================================================
// EXPORTS
// =============================================================================

export { db, auth, app };

