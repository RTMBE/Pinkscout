/**
 * =============================================================================
 * APP.JS - Main Application Logic & Firestore CRUD Operations
 * =============================================================================
 *
 * WHAT IS THIS FILE?
 * This is the main application logic file. It contains functions for:
 * - CRUD operations (Create, Read, Update, Delete) for scouting data
 * - Firebase diagnostics to test your connection
 * - Shared utility functions used across the app
 *
 * WHAT IS CRUD?
 * CRUD is an acronym for the four basic database operations:
 * - Create: Add new data (saveScoutingData)
 * - Read: Retrieve data (getAllScoutingData, getTeamScoutingData)
 * - Update: Modify existing data (updateScoutingData)
 * - Delete: Remove data (deleteScoutingData)
 *
 * WHAT IS FIRESTORE?
 * Firestore is a NoSQL document database. Data is organized as:
 * - Collections: Groups of documents (like folders)
 * - Documents: Individual records (like files)
 * - Fields: Key-value pairs within documents
 *
 * Example structure:
 *   scouting (collection)
 *   ├── abc123 (document)
 *   │   ├── teamNumber: "254"
 *   │   ├── matchNumber: "1"
 *   │   └── autoPoints: 15
 *   └── def456 (document)
 *       ├── teamNumber: "1678"
 *       └── ...
 *
 * =============================================================================
 */


// =============================================================================
// IMPORTS
// =============================================================================
//
// We import the database reference from our firebase.js file,
// and Firestore functions from the Firebase CDN.
//
// =============================================================================

// Import our initialized Firestore database and auth
import { db, auth } from './firebase.js';

// Import Firestore functions from our firebase.js file
// We re-export them there for convenience
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
  limit as firestoreLimit,
  serverTimestamp
} from './firebase.js';


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
 *
 * WHERE CLAUSE EXPLAINED:
 * where('teamNumber', '==', teamNumber) filters documents where
 * the 'teamNumber' field equals the provided value.
 *
 * Other comparison operators:
 * - '==' : equals
 * - '!=' : not equals
 * - '<'  : less than
 * - '<=' : less than or equal
 * - '>'  : greater than
 * - '>=' : greater than or equal
 *
 * @param {string} teamNumber - The FRC team number to search for
 * @returns {Promise<Array>} - Array of scouting records for that team
 */
async function getTeamScoutingData(teamNumber) {
  try {
    const scoutingRef = collection(db, 'scouting');

    // Query for documents where teamNumber matches
    const q = query(scoutingRef, where('teamNumber', '==', teamNumber));
    const querySnapshot = await getDocs(q);

    const records = [];
    querySnapshot.forEach((doc) => {
      records.push({ id: doc.id, ...doc.data() });
    });

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
 * Tests the Firebase connection with a 4-step checklist:
 * 1. Firebase initialized
 * 2. Firestore read works
 * 3. Firestore write/delete works
 * 4. Auth available
 *
 * @returns {Promise<Object>} - Results of each diagnostic test
 */
async function runDiagnostics() {
  console.log('🔍 Starting Firebase diagnostics...');
  const results = {
    timestamp: new Date().toISOString(),
    tests: []
  };

  // Test 1: Firebase Initialized
  try {
    console.log('📝 Test 1: Checking Firebase initialization...');
    if (db) {
      results.tests.push({ name: 'Firebase Initialized', status: 'PASS' });
      console.log('✅ Firebase initialized');
    } else {
      throw new Error('Firebase not initialized');
    }
  } catch (error) {
    results.tests.push({ name: 'Firebase Initialized', status: 'FAIL', error: error.message });
    console.error('❌ Firebase init failed:', error);
  }

  // Test 2: Firestore Read
  let testDocId = null;
  try {
    console.log('📖 Test 2: Testing Firestore read...');
    const testData = { _diagnostic: true, timestamp: new Date().toISOString() };
    const docRef = await addDoc(collection(db, '_diagnostics'), testData);
    testDocId = docRef.id;
    const readDoc = await getDoc(doc(db, '_diagnostics', docRef.id));
    if (readDoc.exists()) {
      results.tests.push({ name: 'Firestore Read', status: 'PASS' });
      console.log('✅ Firestore read works');
    } else {
      throw new Error('Document not found');
    }
  } catch (error) {
    results.tests.push({ name: 'Firestore Read', status: 'FAIL', error: error.message });
    console.error('❌ Firestore read failed:', error);
  }

  // Test 3: Firestore Write/Delete
  try {
    console.log('🗑️ Test 3: Testing Firestore write/delete...');
    if (testDocId) {
      await deleteDoc(doc(db, '_diagnostics', testDocId));
      results.tests.push({ name: 'Firestore Write/Delete', status: 'PASS' });
      console.log('✅ Firestore write/delete works');
    } else {
      throw new Error('No test doc to delete');
    }
  } catch (error) {
    results.tests.push({ name: 'Firestore Write/Delete', status: 'FAIL', error: error.message });
    console.error('❌ Firestore write/delete failed:', error);
  }

  // Test 4: Auth Available
  try {
    console.log('🔐 Test 4: Checking Auth availability...');
    if (auth) {
      const user = auth.currentUser;
      results.tests.push({
        name: 'Auth Available',
        status: 'PASS',
        user: user ? user.email : 'No user signed in'
      });
      console.log('✅ Auth available, user:', user ? user.email : 'none');
    } else {
      throw new Error('Auth not available');
    }
  } catch (error) {
    results.tests.push({ name: 'Auth Available', status: 'FAIL', error: error.message });
    console.error('❌ Auth check failed:', error);
  }

  // Summary
  const passed = results.tests.filter(t => t.status === 'PASS').length;
  results.summary = `${passed}/4 tests passed`;
  console.log('🔍 Diagnostics complete:', results.summary);
  return results;
}

/**
 * READ RECENT SCOUTING
 * --------------------
 * Returns the most recent scouting entries, with optional limit.
 *
 * @param {number} limitCount - Maximum number of entries to return (default: 10)
 * @returns {Promise<Array>} - Array of recent scouting records
 */
async function readRecentScouting(limitCount = 10) {
  try {
    console.log('📖 Reading recent scouting entries (limit:', limitCount, ')');
    const scoutingRef = collection(db, 'scouting');
    // Order by createdAt descending (newest first) and limit results
    const q = query(scoutingRef, orderBy('createdAt', 'desc'), firestoreLimit(limitCount));
    const querySnapshot = await getDocs(q);

    const records = [];
    querySnapshot.forEach((docSnap) => {
      records.push({ id: docSnap.id, ...docSnap.data() });
    });

    console.log('✅ Retrieved', records.length, 'recent scouting records');
    return records;
  } catch (error) {
    console.error('❌ Error reading recent scouting:', error);
    throw error;
  }
}


// =============================================================================
// TEAM STATS ENGINE (CRITICAL FEATURE)
// =============================================================================
//
// This section handles aggregating scouting data into team statistics.
//
// HOW IT WORKS:
// 1. When a scouting entry is submitted, we recalculate that team's stats
// 2. We query all scouting entries for the team
// 3. We compute averages and find the max score
// 4. We store the aggregated stats in the 'teams' collection
//
// DATA STRUCTURE:
//   teams/{teamNumber}
//     matchesPlayed: number
//     avgAuto: number
//     avgTeleop: number
//     avgTotal: number
//     maxScore: number
//     lastUpdated: timestamp
//
// =============================================================================

/**
 * RECALCULATE TEAM STATS
 * ----------------------
 * Recalculates and updates the aggregated statistics for a team.
 * This should be called after every new scouting entry is added.
 *
 * AGGREGATION LOGIC:
 * - matchesPlayed: Count of all scouting entries for this team
 * - avgAuto: Sum of autoPoints / matchesPlayed
 * - avgTeleop: Sum of teleopPoints / matchesPlayed
 * - avgTotal: Sum of totalPoints / matchesPlayed
 * - maxScore: Maximum totalPoints across all matches
 *
 * @param {number|string} teamNumber - The FRC team number
 * @returns {Promise<Object>} - The calculated team stats
 *
 * @example
 * // After saving a scouting entry:
 * await saveScoutingData(formData);
 * await recalculateTeamStats(formData.teamNumber);
 */
async function recalculateTeamStats(teamNumber) {
  try {
    console.log('📊 Recalculating stats for team', teamNumber);

    // Step 1: Get all scouting entries for this team
    const scoutingRef = collection(db, 'scouting');
    const q = query(scoutingRef, where('teamNumber', '==', Number(teamNumber)));
    const snapshot = await getDocs(q);

    // If no entries exist, remove team from stats
    if (snapshot.empty) {
      console.log('⚠️ No scouting data found for team', teamNumber);
      return null;
    }

    // Step 2: Calculate aggregated statistics
    let totalAuto = 0;
    let totalTeleop = 0;
    let totalPoints = 0;
    let maxScore = 0;
    let matchCount = 0;

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();

      // Calculate auto score from component fields (2024 FRC scoring)
      const autoSpeaker = Number(data.autoSpeaker) || 0;
      const autoAmp = Number(data.autoAmp) || 0;
      const auto = autoSpeaker * 5 + autoAmp * 2;

      // Calculate teleop score from component fields
      const teleopSpeaker = Number(data.teleopSpeaker) || 0;
      const teleopAmp = Number(data.teleopAmp) || 0;
      const amplifiedScored = Number(data.amplifiedScored) || 0;
      const teleop = teleopSpeaker * 2 + teleopAmp + amplifiedScored * 5;

      const total = auto + teleop;

      // Add to running totals
      totalAuto += auto;
      totalTeleop += teleop;
      totalPoints += total;
      matchCount++;

      // Track max score
      if (total > maxScore) {
        maxScore = total;
      }
    });

    // Step 3: Compute averages (round to 2 decimal places)
    const stats = {
      teamNumber: Number(teamNumber),
      matchesPlayed: matchCount,
      avgAuto: Math.round((totalAuto / matchCount) * 100) / 100,
      avgTeleop: Math.round((totalTeleop / matchCount) * 100) / 100,
      avgTotal: Math.round((totalPoints / matchCount) * 100) / 100,
      maxScore: maxScore,
      lastUpdated: serverTimestamp()
    };

    console.log('📊 Calculated stats:', stats);

    // Step 4: Save stats to teams collection
    // We use setDoc with the team number as the document ID
    // This allows easy lookup and prevents duplicates
    const teamDocRef = doc(db, 'teams', String(teamNumber));
    await setDoc(teamDocRef, stats);

    console.log('✅ Team stats updated for team', teamNumber);
    return stats;

  } catch (error) {
    console.error('❌ Error recalculating team stats:', error);
    throw error;
  }
}


/**
 * READ TOP TEAMS (LEADERBOARD)
 * ----------------------------
 * Returns the top N teams ranked by average total points.
 * This powers the leaderboard feature on Dashboard and Teams pages.
 *
 * RANKING LOGIC:
 * - Primary sort: avgTotal (descending) - higher average is better
 * - Tiebreaker: maxScore (descending) - higher best match is better
 *
 * CACHING:
 * For performance, callers should cache results in sessionStorage
 * and refresh periodically (e.g., every 5 minutes).
 *
 * @param {number} limitCount - Number of teams to return (default: 10)
 * @returns {Promise<Array>} - Array of team stats, sorted by ranking
 *
 * @example
 * const topTeams = await readTopTeams(10);
 * topTeams.forEach((team, index) => {
 *   console.log(`#${index + 1}: Team ${team.teamNumber} - ${team.avgTotal} avg`);
 * });
 */
async function readTopTeams(limitCount = 10) {
  try {
    console.log('🏆 Reading top', limitCount, 'teams');

    // First try to get from teams collection
    const teamsRef = collection(db, 'teams');
    let teams = [];

    try {
      // Try ordered query (requires index)
      const q = query(teamsRef, orderBy('avgTotal', 'desc'), firestoreLimit(limitCount));
      const snapshot = await getDocs(q);
      snapshot.forEach((docSnap) => {
        teams.push({ id: docSnap.id, ...docSnap.data() });
      });
    } catch (indexError) {
      // If index doesn't exist, fetch all and sort client-side
      console.log('⚠️ Index not available, fetching all teams...');
      const snapshot = await getDocs(teamsRef);
      snapshot.forEach((docSnap) => {
        teams.push({ id: docSnap.id, ...docSnap.data() });
      });
    }

    // If no teams in collection, calculate from scouting data
    if (teams.length === 0) {
      console.log('📊 No team stats found, calculating from scouting data...');
      teams = await calculateLeaderboardFromScouting();
    }

    // Sort by avgTotal descending, then by maxScore for tiebreaker
    teams.sort((a, b) => {
      if ((b.avgTotal || 0) !== (a.avgTotal || 0)) {
        return (b.avgTotal || 0) - (a.avgTotal || 0);
      }
      return (b.maxScore || 0) - (a.maxScore || 0);
    });

    // Limit results
    teams = teams.slice(0, limitCount);

    console.log('✅ Retrieved', teams.length, 'top teams');
    return teams;

  } catch (error) {
    console.error('❌ Error reading top teams:', error);
    // Return empty array instead of throwing to prevent UI errors
    return [];
  }
}

/**
 * CALCULATE LEADERBOARD FROM SCOUTING
 * ------------------------------------
 * Fallback function to calculate team stats from raw scouting data
 * when the teams collection is empty.
 */
async function calculateLeaderboardFromScouting() {
  const scoutingRef = collection(db, 'scouting');
  const snapshot = await getDocs(scoutingRef);

  const teamStats = {};

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const teamNum = String(data.teamNumber);

    if (!teamNum) return;

    // Calculate scores
    const autoSpeaker = Number(data.autoSpeaker) || 0;
    const autoAmp = Number(data.autoAmp) || 0;
    const auto = autoSpeaker * 5 + autoAmp * 2;

    const teleopSpeaker = Number(data.teleopSpeaker) || 0;
    const teleopAmp = Number(data.teleopAmp) || 0;
    const amplifiedScored = Number(data.amplifiedScored) || 0;
    const teleop = teleopSpeaker * 2 + teleopAmp + amplifiedScored * 5;

    const total = auto + teleop;

    // Aggregate stats
    if (!teamStats[teamNum]) {
      teamStats[teamNum] = {
        teamNumber: Number(teamNum),
        totalAuto: 0,
        totalTeleop: 0,
        totalPoints: 0,
        maxScore: 0,
        matchesPlayed: 0
      };
    }

    teamStats[teamNum].totalAuto += auto;
    teamStats[teamNum].totalTeleop += teleop;
    teamStats[teamNum].totalPoints += total;
    teamStats[teamNum].matchesPlayed++;
    if (total > teamStats[teamNum].maxScore) {
      teamStats[teamNum].maxScore = total;
    }
  });

  // Convert to array with averages
  return Object.values(teamStats).map(team => ({
    teamNumber: team.teamNumber,
    avgAuto: team.matchesPlayed > 0 ? Math.round((team.totalAuto / team.matchesPlayed) * 100) / 100 : 0,
    avgTeleop: team.matchesPlayed > 0 ? Math.round((team.totalTeleop / team.matchesPlayed) * 100) / 100 : 0,
    avgTotal: team.matchesPlayed > 0 ? Math.round((team.totalPoints / team.matchesPlayed) * 100) / 100 : 0,
    maxScore: team.maxScore,
    matchesPlayed: team.matchesPlayed
  }));
}


/**
 * SEARCH TEAMS
 * ------------
 * Searches for teams by team number (supports partial matching).
 * Returns team stats for matching teams.
 *
 * HOW PARTIAL MATCHING WORKS:
 * - Firestore doesn't support LIKE queries natively
 * - For small datasets, we fetch all teams and filter client-side
 * - For exact matches, we query directly by document ID
 *
 * @param {string|number} searchQuery - The team number to search for
 * @returns {Promise<Array>} - Array of matching team stats
 *
 * @example
 * const results = await searchTeams('125');
 * // Returns teams: 125, 1250, 1251, 2125, etc.
 */
async function searchTeams(searchQuery) {
  try {
    const queryStr = String(searchQuery).trim();
    console.log('🔍 Searching teams for:', queryStr);

    if (!queryStr) {
      console.log('⚠️ Empty search query');
      return [];
    }

    // First, try to search in the teams collection (aggregated stats)
    const teamsRef = collection(db, 'teams');
    const teamsSnapshot = await getDocs(teamsRef);

    const results = [];
    const foundTeamNumbers = new Set();

    teamsSnapshot.forEach((docSnap) => {
      const teamNum = String(docSnap.id);
      // Partial match: team number contains the search query
      if (teamNum.includes(queryStr)) {
        results.push({ id: docSnap.id, ...docSnap.data() });
        foundTeamNumbers.add(teamNum);
      }
    });

    // If no results in teams collection, search scouting data directly
    if (results.length === 0) {
      console.log('🔍 No team stats found, searching scouting data...');
      const scoutingRef = collection(db, 'scouting');
      const scoutingSnapshot = await getDocs(scoutingRef);

      // Aggregate stats for matching teams
      const teamStats = {};

      scoutingSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const teamNum = String(data.teamNumber);

        // Partial match and not already found in teams collection
        if (teamNum.includes(queryStr) && !foundTeamNumbers.has(teamNum)) {
          // Calculate scores
          const autoScore = (Number(data.autoSpeaker) || 0) * 5 + (Number(data.autoAmp) || 0) * 2;
          const teleopScore = (Number(data.teleopSpeaker) || 0) * 2 + (Number(data.teleopAmp) || 0) + (Number(data.amplifiedScored) || 0) * 5;
          const total = autoScore + teleopScore;

          if (!teamStats[teamNum]) {
            teamStats[teamNum] = { totalAuto: 0, totalTeleop: 0, totalPoints: 0, maxScore: 0, matchesPlayed: 0 };
          }
          teamStats[teamNum].totalAuto += autoScore;
          teamStats[teamNum].totalTeleop += teleopScore;
          teamStats[teamNum].totalPoints += total;
          teamStats[teamNum].matchesPlayed++;
          if (total > teamStats[teamNum].maxScore) teamStats[teamNum].maxScore = total;
        }
      });

      // Convert to results array with calculated averages
      for (const [teamNum, stats] of Object.entries(teamStats)) {
        results.push({
          id: teamNum,
          teamNumber: parseInt(teamNum),
          avgAuto: stats.matchesPlayed > 0 ? stats.totalAuto / stats.matchesPlayed : 0,
          avgTeleop: stats.matchesPlayed > 0 ? stats.totalTeleop / stats.matchesPlayed : 0,
          avgTotal: stats.matchesPlayed > 0 ? stats.totalPoints / stats.matchesPlayed : 0,
          maxScore: stats.maxScore,
          matchesPlayed: stats.matchesPlayed
        });
        foundTeamNumbers.add(teamNum);
      }
    }

    // Sort by best match (exact match first, then by team number)
    results.sort((a, b) => {
      const aExact = String(a.teamNumber) === queryStr;
      const bExact = String(b.teamNumber) === queryStr;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
      return Number(a.teamNumber) - Number(b.teamNumber);
    });

    console.log('✅ Found', results.length, 'matching teams');
    return results;

  } catch (error) {
    console.error('❌ Error searching teams:', error);
    throw error;
  }
}


/**
 * GET TEAM STATS
 * --------------
 * Gets the aggregated statistics for a single team.
 *
 * @param {number|string} teamNumber - The FRC team number
 * @returns {Promise<Object|null>} - Team stats or null if not found
 */
async function getTeamStats(teamNumber) {
  try {
    console.log('📊 Getting stats for team', teamNumber);

    const teamDocRef = doc(db, 'teams', String(teamNumber));
    const docSnap = await getDoc(teamDocRef);

    if (docSnap.exists()) {
      console.log('✅ Found stats for team', teamNumber);
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      console.log('⚠️ No stats found for team', teamNumber);
      return null;
    }

  } catch (error) {
    console.error('❌ Error getting team stats:', error);
    throw error;
  }
}


// Aliases for required function names
const createScoutingEntry = saveScoutingData;
const updateScoutingEntry = updateScoutingData;
const deleteScoutingEntry = deleteScoutingData;


// =============================================================================
// QUESTION MANAGEMENT
// =============================================================================
//
// These functions allow admins to manage scouting form questions.
// Questions are stored in Firestore in a 'settings' collection.
//
// =============================================================================

/**
 * GET SCOUTING QUESTIONS
 * ----------------------
 * Retrieves the custom scouting questions from Firestore.
 *
 * @returns {Promise<Array>} Array of question objects
 */
async function getScoutingQuestions() {
  try {
    console.log('📋 Loading scouting questions...');
    const settingsRef = doc(db, 'settings', 'scoutingQuestions');
    const docSnap = await getDoc(settingsRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      console.log('✅ Loaded', data.questions?.length || 0, 'questions');
      return data.questions || [];
    } else {
      console.log('⚠️ No custom questions found, using defaults');
      return [];
    }

  } catch (error) {
    console.error('❌ Error loading questions:', error);
    throw error;
  }
}


/**
 * SAVE SCOUTING QUESTIONS
 * -----------------------
 * Saves the scouting questions to Firestore.
 *
 * @param {Array} questions - Array of question objects
 * @returns {Promise<void>}
 */
async function saveScoutingQuestions(questions) {
  try {
    console.log('💾 Saving scouting questions...');
    const settingsRef = doc(db, 'settings', 'scoutingQuestions');
    await setDoc(settingsRef, {
      questions: questions,
      updatedAt: serverTimestamp()
    });
    console.log('✅ Questions saved successfully');

  } catch (error) {
    console.error('❌ Error saving questions:', error);
    throw error;
  }
}


// =============================================================================
// APP INITIALIZATION
// =============================================================================

/**
 * Initialize the application when the page loads.
 * This runs automatically when the DOM is ready.
 */
function initApp() {
  console.log('🚀 FRC Scouting App initialized');
  console.log('📋 Ready for scouting data operations');
}

// DOMContentLoaded fires when the HTML is fully parsed
// This ensures our code runs after the page structure is ready
document.addEventListener('DOMContentLoaded', initApp);


// =============================================================================
// EXPORTS
// =============================================================================
//
// These functions are available to other JavaScript files that import this module.
// They can also be used in inline <script> tags with type="module".
//
// =============================================================================

export {
  // CRUD Operations (original names)
  saveScoutingData,
  getAllScoutingData,
  getTeamScoutingData,
  updateScoutingData,
  deleteScoutingData,

  // CRUD Operations (required names per spec)
  createScoutingEntry,
  readRecentScouting,
  updateScoutingEntry,
  deleteScoutingEntry,

  // Team Stats Engine
  recalculateTeamStats,  // Call after saving scouting data
  getTeamStats,          // Get stats for a single team

  // Leaderboard & Search
  readTopTeams,          // Get top N teams by average score
  searchTeams,           // Search teams by number

  // Question Management
  getScoutingQuestions,  // Get custom scouting questions
  saveScoutingQuestions, // Save custom scouting questions

  // Diagnostics
  runDiagnostics
};
