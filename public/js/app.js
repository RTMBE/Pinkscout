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
// EXPORTS
// =============================================================================
//
// These functions are available to other JavaScript files that import this module.
// They can also be used in inline <script> tags with type="module".
//
// =============================================================================

export {
  // CRUD Operations
  saveScoutingData,
  getAllScoutingData,
  getTeamScoutingData,
  updateScoutingData,
  deleteScoutingData,

  // Diagnostics
  runDiagnostics
};
