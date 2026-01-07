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

// Import our initialized Firestore database
import { db } from './firebase.js';

// Import Firestore functions we need for database operations
// Each function has a specific purpose:
import {
  collection,    // Reference to a collection of documents
  addDoc,        // Add a new document (Create)
  getDocs,       // Get multiple documents (Read)
  doc,           // Reference to a single document
  getDoc,        // Get a single document (Read)
  updateDoc,     // Update a document (Update)
  deleteDoc,     // Delete a document (Delete)
  query,         // Create a query with filters/ordering
  orderBy,       // Sort results by a field
  where          // Filter results by a condition
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';


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
// EVENT MANAGEMENT
// =============================================================================
//
// Events are the core organizational unit for scouting data.
// Each scouting record belongs to a specific event.
//
// =============================================================================

/**
 * SAVE EVENT
 * ----------
 * Creates a new event in Firestore.
 *
 * @param {Object} eventData - Event data (name, location, dates, etc.)
 * @returns {Promise<string>} - The document ID of the created event
 */
async function saveEvent(eventData) {
  try {
    const dataWithTimestamp = {
      ...eventData,
      createdAt: new Date().toISOString()
    };
    const docRef = await addDoc(collection(db, 'events'), dataWithTimestamp);
    console.log('✅ Event saved with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Error saving event:', error);
    throw error;
  }
}


/**
 * GET ALL EVENTS
 * --------------
 * Retrieves all events, sorted by start date (newest first).
 *
 * @returns {Promise<Array>} - Array of event objects with their IDs
 */
async function getAllEvents() {
  try {
    const eventsRef = collection(db, 'events');
    const q = query(eventsRef, orderBy('startDate', 'desc'));
    const querySnapshot = await getDocs(q);

    const events = [];
    querySnapshot.forEach((doc) => {
      events.push({ id: doc.id, ...doc.data() });
    });

    console.log('✅ Retrieved', events.length, 'events');
    return events;
  } catch (error) {
    console.error('❌ Error retrieving events:', error);
    throw error;
  }
}


/**
 * GET EVENT BY ID
 * ---------------
 * Retrieves a single event by its document ID.
 *
 * @param {string} eventId - The event document ID
 * @returns {Promise<Object|null>} - The event object or null if not found
 */
async function getEventById(eventId) {
  try {
    const eventDoc = await getDoc(doc(db, 'events', eventId));
    if (eventDoc.exists()) {
      return { id: eventDoc.id, ...eventDoc.data() };
    }
    return null;
  } catch (error) {
    console.error('❌ Error retrieving event:', error);
    throw error;
  }
}


/**
 * GET SCOUTING DATA BY EVENT
 * --------------------------
 * Retrieves all scouting records for a specific event.
 *
 * @param {string} eventId - The event document ID
 * @returns {Promise<Array>} - Array of scouting records for that event
 */
async function getScoutingDataByEvent(eventId) {
  try {
    const scoutingRef = collection(db, 'scouting');
    const q = query(
      scoutingRef,
      where('eventId', '==', eventId),
      orderBy('createdAt', 'desc')
    );
    const querySnapshot = await getDocs(q);

    const records = [];
    querySnapshot.forEach((doc) => {
      records.push({ id: doc.id, ...doc.data() });
    });

    console.log('✅ Retrieved', records.length, 'records for event', eventId);
    return records;
  } catch (error) {
    console.error('❌ Error retrieving event scouting data:', error);
    throw error;
  }
}


/**
 * IMPORT EVENT FROM THE BLUE ALLIANCE
 * ------------------------------------
 * Fetches event data from The Blue Alliance API and saves it to Firestore.
 *
 * TBA API EXPLAINED:
 * The Blue Alliance (TBA) is the central data hub for FRC.
 * Their API provides event info, team data, match schedules, and results.
 *
 * @param {string} eventKey - The TBA event key (e.g., "2024caph")
 * @param {string} tbaApiKey - Your TBA API key
 * @returns {Promise<Object>} - The saved event data
 */
async function importEventFromTBA(eventKey, tbaApiKey) {
  try {
    console.log('📡 Fetching event from TBA:', eventKey);

    // Fetch event data from TBA API
    const response = await fetch(
      `https://www.thebluealliance.com/api/v3/event/${eventKey}`,
      {
        headers: {
          'X-TBA-Auth-Key': tbaApiKey
        }
      }
    );

    if (!response.ok) {
      throw new Error(`TBA API error: ${response.status}`);
    }

    const tbaEvent = await response.json();

    // Convert TBA event format to our format
    const eventData = {
      name: tbaEvent.name,
      eventKey: tbaEvent.key,
      location: `${tbaEvent.city}, ${tbaEvent.state_prov}, ${tbaEvent.country}`,
      venue: tbaEvent.location_name,
      startDate: tbaEvent.start_date,
      endDate: tbaEvent.end_date,
      eventType: tbaEvent.event_type_string,
      week: tbaEvent.week,
      year: tbaEvent.year,
      source: 'tba',  // Mark as imported from TBA
      tbaKey: eventKey
    };

    // Save to Firestore
    const eventId = await saveEvent(eventData);
    return { id: eventId, ...eventData };
  } catch (error) {
    console.error('❌ Error importing event from TBA:', error);
    throw error;
  }
}


/**
 * SEARCH EVENTS FROM TBA
 * ----------------------
 * Searches for events on TBA by year.
 *
 * @param {number} year - The year to search for events
 * @param {string} tbaApiKey - Your TBA API key
 * @returns {Promise<Array>} - Array of events from TBA
 */
async function searchTBAEvents(year, tbaApiKey) {
  try {
    console.log('📡 Searching TBA events for year:', year);

    const response = await fetch(
      `https://www.thebluealliance.com/api/v3/events/${year}`,
      {
        headers: {
          'X-TBA-Auth-Key': tbaApiKey
        }
      }
    );

    if (!response.ok) {
      throw new Error(`TBA API error: ${response.status}`);
    }

    const events = await response.json();
    console.log('✅ Found', events.length, 'events from TBA');
    return events;
  } catch (error) {
    console.error('❌ Error searching TBA events:', error);
    throw error;
  }
}


// =============================================================================
// EXTERNAL DATA INTEGRATION - TBA & STATBOTICS
// =============================================================================
//
// Functions for fetching external data from The Blue Alliance and Statbotics.
//
// =============================================================================

/**
 * GET TEAM INFO FROM TBA
 * ----------------------
 * Fetches basic team information from The Blue Alliance.
 *
 * @param {number} teamNumber - The FRC team number
 * @param {string} tbaApiKey - Your TBA API key
 * @returns {Promise<Object>} - Team information
 */
async function getTeamFromTBA(teamNumber, tbaApiKey) {
  try {
    const response = await fetch(
      `https://www.thebluealliance.com/api/v3/team/frc${teamNumber}`,
      { headers: { 'X-TBA-Auth-Key': tbaApiKey } }
    );

    if (!response.ok) {
      throw new Error(`TBA API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('❌ Error fetching team from TBA:', error);
    throw error;
  }
}


/**
 * GET EVENT TEAMS FROM TBA
 * ------------------------
 * Fetches list of teams attending an event.
 *
 * @param {string} eventKey - The TBA event key
 * @param {string} tbaApiKey - Your TBA API key
 * @returns {Promise<Array>} - Array of teams
 */
async function getEventTeamsFromTBA(eventKey, tbaApiKey) {
  try {
    const response = await fetch(
      `https://www.thebluealliance.com/api/v3/event/${eventKey}/teams`,
      { headers: { 'X-TBA-Auth-Key': tbaApiKey } }
    );

    if (!response.ok) {
      throw new Error(`TBA API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('❌ Error fetching event teams from TBA:', error);
    throw error;
  }
}


/**
 * GET MATCH SCHEDULE FROM TBA
 * ---------------------------
 * Fetches match schedule for an event.
 *
 * @param {string} eventKey - The TBA event key
 * @param {string} tbaApiKey - Your TBA API key
 * @returns {Promise<Array>} - Array of matches
 */
async function getEventMatchesFromTBA(eventKey, tbaApiKey) {
  try {
    const response = await fetch(
      `https://www.thebluealliance.com/api/v3/event/${eventKey}/matches`,
      { headers: { 'X-TBA-Auth-Key': tbaApiKey } }
    );

    if (!response.ok) {
      throw new Error(`TBA API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('❌ Error fetching matches from TBA:', error);
    throw error;
  }
}


/**
 * GET TEAM STATS FROM STATBOTICS
 * ------------------------------
 * Fetches team statistics from Statbotics API.
 * Statbotics provides EPA (Expected Points Added) and other advanced stats.
 *
 * WHAT IS EPA?
 * EPA (Expected Points Added) is a metric that measures how many points
 * a team contributes to their alliance compared to an average team.
 *
 * @param {number} teamNumber - The FRC team number
 * @param {number} year - The year to fetch stats for
 * @returns {Promise<Object>} - Team statistics
 */
async function getTeamStatsFromStatbotics(teamNumber, year) {
  try {
    const response = await fetch(
      `https://api.statbotics.io/v3/team_year/${teamNumber}/${year}`
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Team not found for this year
      }
      throw new Error(`Statbotics API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('❌ Error fetching from Statbotics:', error);
    throw error;
  }
}


/**
 * GET EVENT RANKINGS FROM STATBOTICS
 * ----------------------------------
 * Fetches event team rankings from Statbotics.
 *
 * @param {string} eventKey - The event key (e.g., "2024casj")
 * @returns {Promise<Array>} - Team rankings for the event
 */
async function getEventRankingsFromStatbotics(eventKey) {
  try {
    const response = await fetch(
      `https://api.statbotics.io/v3/team_events?event=${eventKey}`
    );

    if (!response.ok) {
      throw new Error(`Statbotics API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('❌ Error fetching event rankings from Statbotics:', error);
    throw error;
  }
}


// =============================================================================
// CURRENT EVENT MANAGEMENT (Local Storage)
// =============================================================================
//
// We store the currently selected event in localStorage so it persists
// across page reloads and browser sessions.
//
// =============================================================================

const CURRENT_EVENT_KEY = 'pinkscout_current_event';

/**
 * SET CURRENT EVENT
 * -----------------
 * Stores the currently selected event in localStorage.
 *
 * @param {Object} event - The event object (must include id)
 */
function setCurrentEvent(event) {
  if (event && event.id) {
    localStorage.setItem(CURRENT_EVENT_KEY, JSON.stringify(event));
    console.log('✅ Current event set:', event.name);
  }
}


/**
 * GET CURRENT EVENT
 * -----------------
 * Retrieves the currently selected event from localStorage.
 *
 * @returns {Object|null} - The current event or null if none selected
 */
function getCurrentEvent() {
  const stored = localStorage.getItem(CURRENT_EVENT_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.warn('⚠️ Error parsing stored event:', e);
      return null;
    }
  }
  return null;
}


/**
 * CLEAR CURRENT EVENT
 * -------------------
 * Removes the currently selected event from localStorage.
 */
function clearCurrentEvent() {
  localStorage.removeItem(CURRENT_EVENT_KEY);
  console.log('✅ Current event cleared');
}


// =============================================================================
// EXPORTS
// =============================================================================
//
// These functions are available to other JavaScript files that import this module.
// They can also be used in inline <script> tags with type="module".
//
// =============================================================================

export {
  // CRUD Operations for Scouting Data
  saveScoutingData,
  getAllScoutingData,
  getTeamScoutingData,
  updateScoutingData,
  deleteScoutingData,

  // Event Management
  saveEvent,
  getAllEvents,
  getEventById,
  getScoutingDataByEvent,
  importEventFromTBA,
  searchTBAEvents,

  // External API Integration (TBA & Statbotics)
  getTeamFromTBA,
  getEventTeamsFromTBA,
  getEventMatchesFromTBA,
  getTeamStatsFromStatbotics,
  getEventRankingsFromStatbotics,

  // Current Event (localStorage)
  setCurrentEvent,
  getCurrentEvent,
  clearCurrentEvent,

  // Diagnostics
  runDiagnostics
};
