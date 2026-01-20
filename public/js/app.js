/**
 * =============================================================================
 * APP.JS - Main Application Logic & Firestore CRUD Operations
 * =============================================================================
 *
 * WHAT IS THIS FILE?
 * This is the main application logic file. It contains:
 *
 * 1. AUTHENTICATION HELPERS
 *    - loginUser(email, password) - Sign in existing user
 *    - signUpUser(email, password, username, signupCode) - Create new user
 *    - checkAdminRights(user) - Check if user has admin access
 *    - signOutUser() - Sign out current user
 *
 * 2. SCOUTING DATA CRUD
 *    - saveScoutingData(data) - Create new scouting entry
 *    - getAllScoutingData() - Read all scouting entries
 *    - getTeamScoutingData(teamNumber) - Read entries for a specific team
 *    - updateScoutingData(docId, data) - Update existing entry
 *    - deleteScoutingData(docId) - Delete entry
 *
 * 3. QUESTION MANAGEMENT (Admin)
 *    - getAllQuestions() - Get all scouting questions
 *    - addQuestion(question) - Add new question
 *    - updateQuestion(docId, data) - Update question
 *    - deleteQuestion(docId) - Delete question
 *
 * 4. API STATUS
 *    - getAPIKeyStatus() - Check status of external API connections
 *
 * 5. TEAM STATS
 *    - getTeamAverages() - Get computed averages for all teams
 *    - getStatboticsData(teamNumber) - Fetch data from Statbotics API
 *
 * 6. DIAGNOSTICS
 *    - runDiagnostics() - Test Firebase connection
 *
 * FIRESTORE SCHEMA:
 * -----------------
 * users/{uid} - User profiles
 * scouting/{docId} - Scouting entries
 * questions/{docId} - Scouting form questions
 * settings/admins - Admin email list
 * settings/apiKeys - API key configuration
 *
 * =============================================================================
 */


// =============================================================================
// IMPORTS
// =============================================================================

import { db, auth } from './firebase.js';

import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  limit,
  startAfter,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';


// =============================================================================
// CREATE - Save New Scouting Data
// =============================================================================

/**
 * SAVE SCOUTING DATA
 * ------------------
 * Saves a new scouting record to Firestore.
 *
 * HOW IT WORKS:
 * 1. Takes the form data as an object
 * 2. Adds a timestamp for when it was created
 * 3. Saves to the 'scouting' collection in Firestore
 * 4. Returns the auto-generated document ID
 *
 * SPREAD OPERATOR (...) EXPLAINED:
 * The ... operator "spreads" an object's properties into a new object.
 * Example: { ...scoutingData, createdAt: "..." }
 * This copies all properties from scoutingData AND adds createdAt.
 *
 * @param {Object} scoutingData - The scouting form data to save
 * @returns {Promise<string>} - The document ID of the saved record
 *
 * USAGE:
 *   const docId = await saveScoutingData({
 *     teamNumber: "254",
 *     matchNumber: "1",
 *     autoPoints: 15
 *   });
 */
async function saveScoutingData(scoutingData) {
  try {
    // Add timestamp to track when this record was created
    const dataWithTimestamp = {
      ...scoutingData,                        // Copy all existing data
      createdAt: new Date().toISOString()     // Add creation timestamp
    };

    // addDoc() creates a new document with an auto-generated ID
    // collection(db, 'scouting') references the 'scouting' collection
    const docRef = await addDoc(collection(db, 'scouting'), dataWithTimestamp);

    console.log('✅ Scouting data saved successfully with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Error saving scouting data:', error);
    throw error;  // Re-throw so calling code can handle it
  }
}


// =============================================================================
// READ - Retrieve Scouting Data
// =============================================================================

/**
 * GET ALL SCOUTING DATA
 * ---------------------
 * Retrieves all scouting records from Firestore, sorted by date (newest first).
 *
 * HOW QUERIES WORK:
 * 1. Get a reference to the collection
 * 2. Create a query with sorting/filtering
 * 3. Execute the query with getDocs()
 * 4. Loop through results and build an array
 *
 * @returns {Promise<Array>} - Array of scouting records with their IDs
 *
 * USAGE:
 *   const allRecords = await getAllScoutingData();
 *   allRecords.forEach(record => console.log(record.teamNumber));
 */
async function getAllScoutingData() {
  try {
    // Get reference to the 'scouting' collection
    const scoutingRef = collection(db, 'scouting');

    // Create a query that orders by createdAt, newest first
    // 'desc' = descending (newest first), 'asc' = ascending (oldest first)
    const q = query(scoutingRef, orderBy('createdAt', 'desc'));

    // Execute the query and get all matching documents
    const querySnapshot = await getDocs(q);

    // Build an array of records from the query results
    const records = [];
    querySnapshot.forEach((doc) => {
      // Each record includes the document ID and all its data
      records.push({
        id: doc.id,           // The auto-generated document ID
        ...doc.data()         // All the fields in the document
      });
    });

    console.log('✅ Retrieved', records.length, 'scouting records');
    return records;
  } catch (error) {
    console.error('❌ Error retrieving scouting data:', error);
    throw error;
  }
}


/**
 * GET TEAM SCOUTING DATA
 * ----------------------
 * Retrieves all scouting records for a specific team.
 * Queries BOTH string and number versions of teamNumber since
 * scouting entries may store it as either type.
 *
 * @param {string|number} teamNumber - The FRC team number to search for
 * @returns {Promise<Array>} - Array of scouting records for that team
 */
async function getTeamScoutingData(teamNumber) {
  try {
    const scoutingRef = collection(db, 'scouting');
    const records = [];

    // Query with teamNumber as STRING
    const teamStr = String(teamNumber);
    const q1 = query(scoutingRef, where('teamNumber', '==', teamStr));
    const snapshot1 = await getDocs(q1);
    snapshot1.forEach((doc) => {
      records.push({ id: doc.id, ...doc.data() });
    });

    // Query with teamNumber as NUMBER (avoid duplicates)
    const teamNum = parseInt(teamNumber, 10);
    if (!isNaN(teamNum)) {
      const q2 = query(scoutingRef, where('teamNumber', '==', teamNum));
      const snapshot2 = await getDocs(q2);
      snapshot2.forEach((doc) => {
        if (!records.find(r => r.id === doc.id)) {
          records.push({ id: doc.id, ...doc.data() });
        }
      });
    }

    console.log('✅ Retrieved', records.length, 'records for team', teamNumber);
    return records;
  } catch (error) {
    console.error('❌ Error retrieving team data:', error);
    throw error;
  }
}


// =============================================================================
// UPDATE - Modify Existing Data
// =============================================================================

/**
 * UPDATE SCOUTING DATA
 * --------------------
 * Updates an existing scouting record in Firestore.
 *
 * HOW IT WORKS:
 * 1. Get a reference to the specific document by ID
 * 2. Use updateDoc() to modify only the specified fields
 * 3. Other fields in the document remain unchanged
 *
 * @param {string} docId - The document ID to update
 * @param {Object} updateData - Object containing fields to update
 *
 * USAGE:
 *   await updateScoutingData('abc123', { autoPoints: 20 });
 */
async function updateScoutingData(docId, updateData) {
  try {
    // doc(db, 'collection', 'documentId') creates a reference to a specific document
    const docRef = doc(db, 'scouting', docId);

    // updateDoc() only modifies the fields you specify
    await updateDoc(docRef, {
      ...updateData,
      updatedAt: new Date().toISOString()  // Track when it was last updated
    });

    console.log('✅ Scouting record updated:', docId);
  } catch (error) {
    console.error('❌ Error updating scouting data:', error);
    throw error;
  }
}


// =============================================================================
// DELETE - Remove Data
// =============================================================================

/**
 * DELETE SCOUTING DATA
 * --------------------
 * Permanently deletes a scouting record from Firestore.
 *
 * ⚠️ WARNING: This is permanent! There's no undo.
 *
 * @param {string} docId - The document ID to delete
 *
 * USAGE:
 *   await deleteScoutingData('abc123');
 */
async function deleteScoutingData(docId) {
  try {
    // Delete the document with the specified ID
    await deleteDoc(doc(db, 'scouting', docId));
    console.log('✅ Scouting record deleted:', docId);
  } catch (error) {
    console.error('❌ Error deleting scouting data:', error);
    throw error;
  }
}


// =============================================================================
// DIAGNOSTICS - Test Firebase Connection
// =============================================================================

/**
 * RUN FIREBASE DIAGNOSTICS
 * ------------------------
 * Tests the Firebase connection by performing a series of operations.
 * Useful for debugging when things aren't working.
 *
 * WHAT IT TESTS:
 * 1. Can we write to Firestore? (Create)
 * 2. Can we read from Firestore? (Read)
 * 3. Can we delete from Firestore? (Delete)
 *
 * @returns {Promise<Object>} - Results of each diagnostic test
 */
async function runDiagnostics() {
  console.log('🔍 Starting Firebase diagnostics...');
  const results = {
    timestamp: new Date().toISOString(),
    tests: []
  };

  // Test 1: Write to Firestore
  try {
    console.log('📝 Test 1: Writing to Firestore...');
    const testData = {
      _diagnostic: true,
      message: 'Diagnostic test',
      timestamp: new Date().toISOString()
    };
    const docRef = await addDoc(collection(db, '_diagnostics'), testData);
    results.tests.push({
      name: 'Write to Firestore',
      status: 'PASS',
      docId: docRef.id
    });
    console.log('✅ Write test passed');

    // Test 2: Read from Firestore
    try {
      console.log('📖 Test 2: Reading from Firestore...');
      const readDoc = await getDoc(doc(db, '_diagnostics', docRef.id));
      if (readDoc.exists()) {
        results.tests.push({
          name: 'Read from Firestore',
          status: 'PASS',
          data: readDoc.data()
        });
        console.log('✅ Read test passed');
      } else {
        throw new Error('Document not found');
      }
    } catch (error) {
      results.tests.push({
        name: 'Read from Firestore',
        status: 'FAIL',
        error: error.message
      });
      console.error('❌ Read test failed:', error);
    }

    // Test 3: Delete from Firestore (cleanup)
    try {
      console.log('🗑️ Test 3: Deleting from Firestore...');
      await deleteDoc(doc(db, '_diagnostics', docRef.id));
      results.tests.push({
        name: 'Delete from Firestore',
        status: 'PASS'
      });
      console.log('✅ Delete test passed');
    } catch (error) {
      results.tests.push({
        name: 'Delete from Firestore',
        status: 'FAIL',
        error: error.message
      });
      console.error('❌ Delete test failed:', error);
    }

  } catch (error) {
    results.tests.push({
      name: 'Write to Firestore',
      status: 'FAIL',
      error: error.message
    });
    console.error('❌ Write test failed:', error);
  }

  // Summary
  const passed = results.tests.filter(t => t.status === 'PASS').length;
  const total = results.tests.length;
  results.summary = `${passed}/${total} tests passed`;

  console.log('🔍 Diagnostics complete:', results.summary);
  return results;
}


// =============================================================================
// AUTHENTICATION HELPERS
// =============================================================================

/**
 * LOGIN USER
 * ----------
 * Signs in an existing user with email and password.
 *
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @returns {Promise<Object>} - The user credential object
 */
async function loginUser(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log('✅ User logged in:', userCredential.user.email);
    return userCredential;
  } catch (error) {
    console.error('❌ Login error:', error);
    throw error;
  }
}

/**
 * SIGN UP USER
 * ------------
 * Creates a new user account with validation.
 *
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @param {string} username - User's display name
 * @param {string} signupCode - Team signup code (must be "1551")
 * @returns {Promise<Object>} - The user credential object
 */
async function signUpUser(email, password, username, signupCode) {
  // Validate signup code
  if (signupCode !== '1551') {
    throw new Error('Invalid signup code');
  }

  try {
    // Create the user
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Update display name
    await updateProfile(user, { displayName: username });

    // Create user profile in Firestore
    await setDoc(doc(db, 'users', user.uid), {
      email: user.email,
      displayName: username,
      role: 'scouter',
      createdAt: serverTimestamp()
    });

    console.log('✅ User created:', user.email);
    return userCredential;
  } catch (error) {
    console.error('❌ Signup error:', error);
    throw error;
  }
}

/**
 * CHECK ADMIN RIGHTS
 * ------------------
 * Checks if the current user has admin access.
 *
 * Admin access is granted if:
 * 1. User email is "rtmbe20@gmail.com" (hardcoded admin)
 * 2. User email is in settings/admins.emails[] array
 *
 * @param {Object} user - Firebase user object
 * @returns {Promise<boolean>} - True if user is admin
 */
async function checkAdminRights(user) {
  if (!user || !user.email) return false;

  const email = user.email.toLowerCase();

  // Hardcoded primary admin
  if (email === 'rtmbe20@gmail.com') {
    console.log('✅ Primary admin access granted');
    return true;
  }

  try {
    // Check Firestore for additional admins
    const adminsDoc = await getDoc(doc(db, 'settings', 'admins'));
    if (adminsDoc.exists()) {
      const data = adminsDoc.data();
      const adminEmails = (data.emails || []).map(e => e.toLowerCase());

      if (adminEmails.includes(email)) {
        console.log('✅ Admin access granted via Firestore');
        return true;
      }
    }
  } catch (error) {
    console.error('Error checking admin rights:', error);
  }

  console.log('❌ User is not an admin');
  return false;
}

/**
 * SIGN OUT USER
 * -------------
 * Signs out the current user.
 */
async function signOutUser() {
  try {
    await firebaseSignOut(auth);
    console.log('✅ User signed out');
    window.location.href = 'login.html';
  } catch (error) {
    console.error('❌ Sign out error:', error);
    throw error;
  }
}


// =============================================================================
// QUESTION MANAGEMENT (Admin)
// =============================================================================

/**
 * GET ALL QUESTIONS
 * -----------------
 * Retrieves all scouting form questions.
 *
 * @returns {Promise<Array>} - Array of question objects
 */
async function getAllQuestions() {
  try {
    const questionsRef = collection(db, 'questions');
    const q = query(questionsRef, orderBy('order', 'asc'));
    const snapshot = await getDocs(q);

    const questions = [];
    snapshot.forEach(doc => {
      questions.push({ id: doc.id, ...doc.data() });
    });

    console.log('✅ Retrieved', questions.length, 'questions');
    return questions;
  } catch (error) {
    console.error('❌ Error getting questions:', error);
    return [];
  }
}

/**
 * ADD QUESTION
 * ------------
 * Adds a new scouting form question.
 *
 * @param {Object} question - Question data
 *   - text: string (question text)
 *   - category: "Auto" | "Teleop" | "Endgame" | "Notes"
 *   - type: "number" | "text" | "toggle"
 *   - order: number
 * @returns {Promise<string>} - Document ID
 */
async function addQuestion(question) {
  try {
    const docRef = await addDoc(collection(db, 'questions'), {
      ...question,
      createdAt: serverTimestamp()
    });
    console.log('✅ Question added:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Error adding question:', error);
    throw error;
  }
}

/**
 * UPDATE QUESTION
 * ---------------
 * Updates an existing question.
 *
 * @param {string} docId - Question document ID
 * @param {Object} data - Fields to update
 */
async function updateQuestion(docId, data) {
  try {
    await updateDoc(doc(db, 'questions', docId), {
      ...data,
      updatedAt: serverTimestamp()
    });
    console.log('✅ Question updated:', docId);
  } catch (error) {
    console.error('❌ Error updating question:', error);
    throw error;
  }
}

/**
 * DELETE QUESTION
 * ---------------
 * Deletes a question.
 *
 * @param {string} docId - Question document ID
 */
async function deleteQuestion(docId) {
  try {
    await deleteDoc(doc(db, 'questions', docId));
    console.log('✅ Question deleted:', docId);
  } catch (error) {
    console.error('❌ Error deleting question:', error);
    throw error;
  }
}


// =============================================================================
// API STATUS
// =============================================================================

/**
 * GET API KEY STATUS
 * ------------------
 * Checks the status of external API connections.
 * Tests connectivity to Statbotics, The Blue Alliance, and FRC Nexus.
 *
 * @returns {Promise<Object>} - Status of each API
 */
async function getAPIKeyStatus() {
  const status = {
    statbotics: { name: 'Statbotics', status: 'unknown', message: '' },
    tba: { name: 'The Blue Alliance', status: 'unknown', message: '' },
    frcNexus: { name: 'FRC Nexus', status: 'unknown', message: '' }
  };

  // Test Statbotics (no API key required)
  try {
    const response = await fetch('https://api.statbotics.io/v3/team/254', {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    if (response.ok) {
      status.statbotics.status = 'connected';
      status.statbotics.message = 'API is accessible';
    } else {
      status.statbotics.status = 'failed';
      status.statbotics.message = `HTTP ${response.status}`;
    }
  } catch (error) {
    status.statbotics.status = 'failed';
    status.statbotics.message = error.message;
  }

  // Check if TBA API key is configured
  try {
    const settingsDoc = await getDoc(doc(db, 'settings', 'apiKeys'));
    if (settingsDoc.exists()) {
      const keys = settingsDoc.data();

      if (keys.tbaKey) {
        // Test TBA with the key
        const response = await fetch('https://www.thebluealliance.com/api/v3/status', {
          headers: { 'X-TBA-Auth-Key': keys.tbaKey }
        });
        if (response.ok) {
          status.tba.status = 'connected';
          status.tba.message = 'API key valid';
        } else {
          status.tba.status = 'failed';
          status.tba.message = 'Invalid API key';
        }
      } else {
        status.tba.status = 'failed';
        status.tba.message = 'No API key provided';
      }

      if (keys.nexusKey) {
        status.frcNexus.status = 'connected';
        status.frcNexus.message = 'API key configured';
      } else {
        status.frcNexus.status = 'failed';
        status.frcNexus.message = 'No API key provided';
      }
    } else {
      status.tba.status = 'failed';
      status.tba.message = 'No API keys configured';
      status.frcNexus.status = 'failed';
      status.frcNexus.message = 'No API keys configured';
    }
  } catch (error) {
    console.error('Error checking API keys:', error);
  }

  return status;
}


// =============================================================================
// EPA SCALING & CLASSIFICATION
// =============================================================================
//
// WHAT IS EPA?
// EPA (Expected Points Added) is a metric from Statbotics that measures
// how many points a team contributes to their alliance per match.
//
// RAW EPA VALUES:
// Statbotics returns raw EPA values that can range from negative to 1000+.
// These are NOT normalized and vary by season. For example:
// - 2024 season: EPA values typically range from ~5 to ~80
// - Raw "total EPA" can be much higher (cumulative)
//
// SCALING FORMULA:
// We scale the normalized EPA (norm_epa) to a more readable range.
// The norm_epa is already percentile-based (0-100) but we present it
// on a scale more intuitive to users.
//
// CLASSIFICATION THRESHOLDS (7 tiers):
// - Elite: Top 5% (percentile >= 95)
// - Great: Top 10% (percentile >= 90, < 95)
// - Good: Top 20% (percentile >= 80, < 90)
// - Above Average: 60-80th percentile
// - Average: 40-60th percentile
// - Below Average: 20-40th percentile
// - Developing: Bottom 20% (percentile < 20)
//
// =============================================================================

/**
 * SCALE STATBOTICS EPA
 * --------------------
 * Returns the actual EPA points value from Statbotics data.
 *
 * EPA (Expected Points Added) represents a team's expected contribution
 * to their alliance score per match. This is the actual meaningful value.
 *
 * @param {Object|number} statboticsData - The Statbotics data object or percentile
 * @returns {number} - EPA points value
 */
function scaleStatboticsEPA(statboticsData) {
  if (!statboticsData) return 0;

  // If it's a number (percentile), return it as-is for backwards compatibility
  if (typeof statboticsData === 'number') {
    return statboticsData;
  }

  // Get actual EPA total points (expected contribution per match)
  if (statboticsData.epa?.total_points?.mean) {
    return statboticsData.epa.total_points.mean;
  }

  // Fallback to older API format
  if (typeof statboticsData.epa_end === 'number') {
    return statboticsData.epa_end;
  }

  return 0;
}

/**
 * CLASSIFY EPA
 * ------------
 * Classifies a team based on their EPA percentile.
 *
 * CLASSIFICATION LOGIC (7 tiers):
 * - Elite: >= 95th percentile (top 5%)
 * - Great: >= 90th percentile (top 10%)
 * - Good: >= 80th percentile (top 20%)
 * - Above Average: >= 60th percentile (60-80%)
 * - Average: >= 40th percentile (40-60%)
 * - Below Average: >= 20th percentile (20-40%)
 * - Developing: < 20th percentile (bottom 20%)
 *
 * If you have a list of all team EPAs, you can calculate actual percentiles.
 * Otherwise, we use the norm_epa from Statbotics which is already a percentile.
 *
 * @param {number} epaPercentile - Team's EPA percentile (0-100)
 * @param {Array} allTeamEPAs - Optional: Array of all team EPAs for relative ranking
 * @returns {Object} - { classification: string, color: string, emoji: string }
 */
function classifyEPA(epaPercentile, allTeamEPAs = null) {
  // If allTeamEPAs provided, calculate actual percentile
  let percentile = epaPercentile;

  if (allTeamEPAs && allTeamEPAs.length > 0 && typeof epaPercentile === 'number') {
    // Calculate what percentile this EPA falls into
    const sorted = [...allTeamEPAs].sort((a, b) => a - b);
    const rank = sorted.findIndex(epa => epa >= epaPercentile);
    percentile = ((rank === -1 ? sorted.length : rank) / sorted.length) * 100;
  }

  // Classification thresholds (7 tiers)
  if (percentile >= 95) {
    return {
      classification: 'Elite',
      color: '#FFD700',  // Gold
      emoji: '🏆',
      description: 'Top 5% of teams'
    };
  } else if (percentile >= 90) {
    return {
      classification: 'Great',
      color: '#FF6B00',  // Orange
      emoji: '🔥',
      description: 'Top 10% of teams'
    };
  } else if (percentile >= 80) {
    return {
      classification: 'Good',
      color: '#4CAF50',  // Green
      emoji: '⭐',
      description: 'Top 20% of teams'
    };
  } else if (percentile >= 60) {
    return {
      classification: 'Above Average',
      color: '#8BC34A',  // Light Green
      emoji: '✅',
      description: '60-80th percentile'
    };
  } else if (percentile >= 40) {
    return {
      classification: 'Average',
      color: '#2196F3',  // Blue
      emoji: '🔵',
      description: '40-60th percentile'
    };
  } else if (percentile >= 20) {
    return {
      classification: 'Below Average',
      color: '#9E9E9E',  // Gray
      emoji: '📊',
      description: '20-40th percentile'
    };
  } else {
    return {
      classification: 'Developing',
      color: '#607D8B',  // Blue Gray
      emoji: '📈',
      description: 'Bottom 20% - Room to grow'
    };
  }
}

/**
 * GET EPA PERCENTILE FROM STATBOTICS DATA
 * ----------------------------------------
 * Extracts the EPA percentile from Statbotics response.
 *
 * @param {Object} statboticsData - Raw Statbotics API response
 * @returns {number} - EPA percentile (0-100)
 */
function getEPAPercentile(statboticsData) {
  if (!statboticsData) return 0;

  // Statbotics provides norm_epa which is already a percentile
  // norm_epa.mean is the overall percentile
  // Higher norm_epa = better team

  if (statboticsData.norm_epa && typeof statboticsData.norm_epa.mean === 'number') {
    return statboticsData.norm_epa.mean;
  }

  // Fallback: calculate from EPA percentile if available
  if (statboticsData.epa_percentile) {
    return statboticsData.epa_percentile;
  }

  // Default if no data
  return 50;
}


// =============================================================================
// THE BLUE ALLIANCE API
// =============================================================================
//
// TBA API Documentation: https://www.thebluealliance.com/apidocs/v3
//
// ENDPOINTS USED:
// - /events/{year} - List all events for a year
// - /event/{event_key} - Event details
// - /event/{event_key}/teams - Teams at event
// - /event/{event_key}/matches - Matches at event
// - /team/{team_key} - Team details
//
// =============================================================================

import { API_KEYS, API_URLS } from './firebase.js';

/**
 * GET BLUE ALLIANCE EVENT LIST
 * ----------------------------
 * Fetches all events for a given year from The Blue Alliance.
 *
 * @param {number} year - The year to fetch events for (default: current year)
 * @returns {Promise<Array>} - Array of event objects
 */
async function getBlueAllianceEventList(year = new Date().getFullYear()) {
  try {
    console.log(`🔵 Fetching TBA events for ${year}...`);

    const response = await fetch(`${API_URLS.TBA}/events/${year}`, {
      headers: {
        'X-TBA-Auth-Key': API_KEYS.TBA,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`TBA API Error: HTTP ${response.status}`);
    }

    const events = await response.json();

    // Sort by start date
    events.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

    console.log(`✅ Retrieved ${events.length} events for ${year}`);
    return events;
  } catch (error) {
    console.error('❌ Error fetching TBA events:', error);
    return [];
  }
}

/**
 * GET BLUE ALLIANCE EVENT DETAILS
 * -------------------------------
 * Fetches detailed information about a specific event.
 *
 * @param {string} eventKey - The TBA event key (e.g., "2024casj")
 * @returns {Promise<Object>} - Event details with teams and matches
 */
async function getBlueAllianceEventDetails(eventKey) {
  try {
    console.log(`🔵 Fetching TBA event details for ${eventKey}...`);

    // Fetch event info, teams, and matches in parallel
    const [eventResponse, teamsResponse, matchesResponse] = await Promise.all([
      fetch(`${API_URLS.TBA}/event/${eventKey}`, {
        headers: { 'X-TBA-Auth-Key': API_KEYS.TBA }
      }),
      fetch(`${API_URLS.TBA}/event/${eventKey}/teams`, {
        headers: { 'X-TBA-Auth-Key': API_KEYS.TBA }
      }),
      fetch(`${API_URLS.TBA}/event/${eventKey}/matches`, {
        headers: { 'X-TBA-Auth-Key': API_KEYS.TBA }
      })
    ]);

    if (!eventResponse.ok) {
      throw new Error(`Event not found: ${eventKey}`);
    }

    const event = await eventResponse.json();
    const teams = teamsResponse.ok ? await teamsResponse.json() : [];
    const matches = matchesResponse.ok ? await matchesResponse.json() : [];

    // Sort matches by match number
    matches.sort((a, b) => {
      // Sort by comp_level first (qm, qf, sf, f)
      const levelOrder = { qm: 0, qf: 1, sf: 2, f: 3 };
      const levelDiff = (levelOrder[a.comp_level] || 0) - (levelOrder[b.comp_level] || 0);
      if (levelDiff !== 0) return levelDiff;

      // Then by match number
      return (a.match_number || 0) - (b.match_number || 0);
    });

    console.log(`✅ Event ${eventKey}: ${teams.length} teams, ${matches.length} matches`);

    return {
      event,
      teams,
      matches,
      // Helper: check if event is finished
      isFinished: matches.some(m => m.actual_time !== null)
    };
  } catch (error) {
    console.error('❌ Error fetching TBA event details:', error);
    return null;
  }
}

/**
 * GET BLUE ALLIANCE TEAM INFO
 * ---------------------------
 * Fetches information about a specific team.
 *
 * @param {string|number} teamNumber - FRC team number
 * @returns {Promise<Object|null>} - Team info or null
 */
async function getBlueAllianceTeamInfo(teamNumber) {
  try {
    const response = await fetch(`${API_URLS.TBA}/team/frc${teamNumber}`, {
      headers: {
        'X-TBA-Auth-Key': API_KEYS.TBA,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('❌ Error fetching TBA team info:', error);
    return null;
  }
}

/**
 * GET EVENT TEAM STATBOTICS DATA
 * ------------------------------
 * Fetches Statbotics data for all teams at an event.
 * Used for building leaderboards.
 *
 * @param {Array} teamNumbers - Array of team numbers
 * @returns {Promise<Array>} - Array of team stats with EPA
 */
async function getEventTeamStats(teamNumbers, eventKey = null) {
  try {
    console.log(`📊 Fetching Statbotics data for ${teamNumbers.length} teams...`);

    let teamStats = [];

    // If we have an event key, use the team_events endpoint (FASTEST - single request!)
    if (eventKey) {
      try {
        const eventUrl = `https://api.statbotics.io/v3/team_events?event=${eventKey}&limit=100`;
        const response = await fetch(eventUrl, {
          headers: { 'Accept': 'application/json' }
        });

        if (response.ok) {
          const teamEvents = await response.json();

          teamStats = teamEvents.map(data => {
            const breakdown = data.epa?.breakdown || {};
            const unitlessEpa = data.epa?.unitless || 0;
            // Calculate percentile from unitless EPA (roughly 1500 = 50th percentile)
            const percentile = Math.min(100, Math.max(0, ((unitlessEpa - 1200) / 600) * 100));

            return {
              teamNumber: data.team,
              name: data.team_name || `Team ${data.team}`,
              // EPA breakdown values
              epaTotal: breakdown.total_points || 0,
              epaTeleop: breakdown.teleop_points || 0,
              epaAuto: breakdown.auto_points || 0,
              epaEndgame: breakdown.endgame_points || 0,
              // For backwards compatibility
              epaRaw: breakdown.teleop_points || 0,  // Default to teleop
              epaPercentile: percentile,
              epaUnitless: unitlessEpa,
              classification: classifyEPA(percentile),
              // Record
              wins: data.record?.total?.wins || 0,
              losses: data.record?.total?.losses || 0,
              rank: data.record?.qual?.rank || 0
            };
          });

          console.log(`✅ Event endpoint: got ${teamStats.length} teams in 1 request`);
        }
      } catch (e) {
        console.log('Event endpoint failed, trying fallback...', e);
      }
    }

    // Fallback: fetch missing teams in parallel batches
    if (teamStats.length === 0) {
      const year = new Date().getFullYear();
      const batchSize = 25;

      for (let i = 0; i < teamNumbers.length; i += batchSize) {
        const batch = teamNumbers.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(async num => {
            try {
              const resp = await fetch(`https://api.statbotics.io/v3/team_year/${num}/${year}`);
              if (resp.ok) return await resp.json();
              return null;
            } catch { return null; }
          })
        );

        batchResults.filter(Boolean).forEach(data => {
          const breakdown = data.epa?.breakdown || {};
          const unitlessEpa = data.epa?.unitless || 0;
          const percentile = Math.min(100, Math.max(0, ((unitlessEpa - 1200) / 600) * 100));

          teamStats.push({
            teamNumber: data.team,
            name: data.team_name || `Team ${data.team}`,
            epaTotal: breakdown.total_points || 0,
            epaTeleop: breakdown.teleop_points || 0,
            epaAuto: breakdown.auto_points || 0,
            epaEndgame: breakdown.endgame_points || 0,
            epaRaw: breakdown.teleop_points || 0,
            epaPercentile: percentile,
            epaUnitless: unitlessEpa,
            classification: classifyEPA(percentile),
            wins: data.record?.total?.wins || 0,
            losses: data.record?.total?.losses || 0,
            rank: 0
          });
        });
      }
    }

    // Sort by teleop EPA descending (default)
    teamStats.sort((a, b) => b.epaTeleop - a.epaTeleop);

    console.log(`✅ Processed stats for ${teamStats.length} teams`);
    return teamStats;
  } catch (error) {
    console.error('❌ Error fetching event team stats:', error);
    return [];
  }
}


// =============================================================================
// TEAM STATISTICS
// =============================================================================

/**
 * GET TEAM AVERAGES
 * -----------------
 * Computes averages for all teams from scouting data.
 *
 * @returns {Promise<Array>} - Array of team stats
 */
async function getTeamAverages() {
  try {
    const allData = await getAllScoutingData();

    // Group by team
    const teamMap = {};
    allData.forEach(entry => {
      const team = entry.teamNumber;
      if (!teamMap[team]) {
        teamMap[team] = { entries: [], totalAuto: 0, totalTeleop: 0, totalPoints: 0 };
      }
      teamMap[team].entries.push(entry);
      teamMap[team].totalAuto += entry.autoPoints || 0;
      teamMap[team].totalTeleop += entry.teleopPoints || 0;
      teamMap[team].totalPoints += (entry.autoPoints || 0) + (entry.teleopPoints || 0);
    });

    // Calculate averages
    const teamAverages = Object.keys(teamMap).map(team => {
      const data = teamMap[team];
      const count = data.entries.length;
      return {
        teamNumber: team,
        matchCount: count,
        avgAuto: (data.totalAuto / count).toFixed(1),
        avgTeleop: (data.totalTeleop / count).toFixed(1),
        avgTotal: (data.totalPoints / count).toFixed(1)
      };
    });

    // Sort by average total descending
    teamAverages.sort((a, b) => parseFloat(b.avgTotal) - parseFloat(a.avgTotal));

    console.log('✅ Calculated averages for', teamAverages.length, 'teams');
    return teamAverages;
  } catch (error) {
    console.error('❌ Error calculating team averages:', error);
    return [];
  }
}

/**
 * GET STATBOTICS DATA
 * -------------------
 * Fetches team data from Statbotics API for current year.
 * Combines team info with current season stats.
 *
 * @param {string|number} teamNumber - FRC team number
 * @param {number} year - Optional year (defaults to current year)
 * @returns {Promise<Object|null>} - Team data or null if not found
 */
async function getStatboticsData(teamNumber, year = new Date().getFullYear()) {
  try {
    // Fetch both team info AND current year stats
    const [teamResponse, yearResponse] = await Promise.all([
      fetch(`https://api.statbotics.io/v3/team/${teamNumber}`),
      fetch(`https://api.statbotics.io/v3/team_year/${teamNumber}/${year}`)
    ]);

    if (!teamResponse.ok) {
      if (teamResponse.status === 404) {
        console.log('Team not found in Statbotics:', teamNumber);
        return null;
      }
      throw new Error(`HTTP ${teamResponse.status}`);
    }

    const teamData = await teamResponse.json();

    // Merge with current year data if available
    if (yearResponse.ok) {
      const yearData = await yearResponse.json();
      // Use current year record and EPA instead of all-time
      teamData.record = yearData.record || teamData.record;
      teamData.epa = yearData.epa || teamData.epa;
      teamData.norm_epa = yearData.norm_epa || teamData.norm_epa;
      teamData.currentYear = year;
      console.log('✅ Statbotics data retrieved for team', teamNumber, '(year:', year + ')');
    } else {
      console.log('✅ Statbotics data retrieved for team', teamNumber, '(no current year data)');
    }

    return teamData;
  } catch (error) {
    console.error('❌ Error fetching Statbotics data:', error);
    return null;
  }
}

/**
 * GET PAGINATED SCOUTING ENTRIES
 * ------------------------------
 * Retrieves scouting entries with pagination for performance.
 *
 * @param {number} pageSize - Number of entries per page
 * @param {Object} lastDoc - Last document from previous page (for pagination)
 * @returns {Promise<Object>} - { entries: Array, lastDoc: Object, hasMore: boolean }
 */
async function getPaginatedScoutingEntries(pageSize = 20, lastDoc = null) {
  try {
    const scoutingRef = collection(db, 'scouting');
    let q;

    if (lastDoc) {
      q = query(scoutingRef, orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(pageSize));
    } else {
      q = query(scoutingRef, orderBy('createdAt', 'desc'), limit(pageSize));
    }

    const snapshot = await getDocs(q);
    const entries = [];
    let newLastDoc = null;

    snapshot.forEach(doc => {
      entries.push({ id: doc.id, ...doc.data() });
      newLastDoc = doc;
    });

    return {
      entries,
      lastDoc: newLastDoc,
      hasMore: entries.length === pageSize
    };
  } catch (error) {
    console.error('❌ Error getting paginated entries:', error);
    return { entries: [], lastDoc: null, hasMore: false };
  }
}


// =============================================================================
// APP INITIALIZATION
// =============================================================================

function initApp() {
  console.log('🚀 FRC Scouting App initialized');
  console.log('📋 App.js loaded with all functions');
}

document.addEventListener('DOMContentLoaded', initApp);


// =============================================================================
// GET TEAM STATS (Combined Statbotics + Local)
// =============================================================================

/**
 * GET TEAM STATS
 * Combines Statbotics EPA data with local scouting data
 *
 * @param {number} teamNumber - Team number to get stats for
 * @returns {Promise<Object>} Combined team statistics
 */
async function getTeamStats(teamNumber) {
  try {
    // Get Statbotics data
    const statboticsData = await getStatboticsData(teamNumber);

    // Get local scouting data
    const localData = await getTeamAverages(teamNumber);

    // Combine the data
    return {
      teamNumber: teamNumber,
      epa: statboticsData?.epa_end || null,
      epa_percentile: statboticsData?.epa_percentile || null,
      avgAuto: localData?.avgAuto || 0,
      avgTeleop: localData?.avgTeleop || 0,
      matchCount: localData?.matchCount || 0,
      statbotics: statboticsData,
      local: localData
    };
  } catch (error) {
    console.error('Error getting team stats:', error);
    return null;
  }
}


// =============================================================================
// EXPORTS
// =============================================================================

export {
  // Authentication
  loginUser,
  signUpUser,
  checkAdminRights,
  signOutUser,

  // Scouting CRUD
  saveScoutingData,
  getAllScoutingData,
  getTeamScoutingData,
  updateScoutingData,
  deleteScoutingData,
  getPaginatedScoutingEntries,

  // Question Management
  getAllQuestions,
  addQuestion,
  updateQuestion,
  deleteQuestion,

  // API & Stats
  getAPIKeyStatus,
  getTeamAverages,
  getStatboticsData,
  getTeamStats,

  // EPA Scaling & Classification
  scaleStatboticsEPA,
  classifyEPA,
  getEPAPercentile,

  // The Blue Alliance API
  getBlueAllianceEventList,
  getBlueAllianceEventDetails,
  getBlueAllianceTeamInfo,
  getEventTeamStats,

  // Diagnostics
  runDiagnostics
};
