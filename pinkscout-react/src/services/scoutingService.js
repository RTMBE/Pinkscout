/**
 * =============================================================================
 * SCOUTINGSERVICE.JS - Firestore Scouting Data CRUD Operations
 * =============================================================================
 * 
 * WHAT IS THIS FILE?
 * Handles all scouting data operations with Firestore:
 * - Create new scouting entries
 * - Read entries (all, by team, by event)
 * - Update entries
 * - Delete entries
 * 
 * FIRESTORE COLLECTION: scouting/{docId}
 * Schema:
 *   - teamNumber: number
 *   - matchNumber: number
 *   - eventKey: string
 *   - scouterName: string
 *   - allianceColor: "red" | "blue"
 *   - autoSpeaker, autoAmp, teleopSpeaker, teleopAmp, etc.
 *   - createdAt: ISO string timestamp
 * 
 * =============================================================================
 */

import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter
} from 'firebase/firestore';
import { db } from './firebase';

// Collection reference
const SCOUTING_COLLECTION = 'scouting';

// =============================================================================
// CREATE - Save new scouting entry
// =============================================================================

/**
 * Save a new scouting entry to Firestore
 * 
 * @param {Object} scoutingData - The scouting data to save
 * @returns {string} - The document ID of the saved entry
 */
export async function saveScoutingData(scoutingData) {
  try {
    const dataWithTimestamp = {
      ...scoutingData,
      createdAt: new Date().toISOString()
    };
    
    const docRef = await addDoc(collection(db, SCOUTING_COLLECTION), dataWithTimestamp);
    console.log('✅ Scouting data saved with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Error saving scouting data:', error);
    throw error;
  }
}

// =============================================================================
// READ - Get all scouting entries
// =============================================================================

/**
 * Get all scouting entries, ordered by creation date (newest first)
 * 
 * @returns {Array} - Array of scouting entries with IDs
 */
export async function getAllScoutingData() {
  try {
    const q = query(
      collection(db, SCOUTING_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('❌ Error fetching scouting data:', error);
    throw error;
  }
}

// =============================================================================
// READ - Get scouting entries for a specific team
// =============================================================================

/**
 * Get all scouting entries for a specific team
 *
 * @param {number|string} teamNumber - The team number to fetch data for
 * @param {Object} options - Optional filters { year, eventKey }
 * @returns {Array} - Array of scouting entries for the team
 */
export async function getTeamScoutingData(teamNumber, options = {}) {
  try {
    const teamNum = parseInt(teamNumber);
    const { year, eventKey } = options;

    // Build query based on filters
    let q;

    if (eventKey) {
      // Filter by specific event
      q = query(
        collection(db, SCOUTING_COLLECTION),
        where('teamNumber', '==', teamNum),
        where('eventKey', '==', eventKey),
        orderBy('createdAt', 'desc')
      );
    } else if (year) {
      // Filter by year - use eventYear field if available
      q = query(
        collection(db, SCOUTING_COLLECTION),
        where('teamNumber', '==', teamNum),
        where('eventYear', '==', year),
        orderBy('createdAt', 'desc')
      );
    } else {
      // No filter - get all data for team
      q = query(
        collection(db, SCOUTING_COLLECTION),
        where('teamNumber', '==', teamNum),
        orderBy('createdAt', 'desc')
      );
    }

    const snapshot = await getDocs(q);
    let results = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // If filtering by year but eventYear field might not exist on old data,
    // also filter client-side by eventKey prefix (e.g., "2025flor" starts with "2025")
    if (year && !eventKey) {
      results = results.filter(doc => {
        // Check eventYear field first
        if (doc.eventYear === year) return true;
        // Fall back to checking eventKey prefix
        if (doc.eventKey && doc.eventKey.startsWith(year.toString())) return true;
        return false;
      });
    }

    return results;
  } catch (error) {
    console.error('❌ Error fetching team scouting data:', error);
    throw error;
  }
}

// =============================================================================
// READ - Get scouting entries for an event
// =============================================================================

/**
 * Get all scouting entries for a specific event
 * 
 * @param {string} eventKey - The event key to fetch data for
 * @returns {Array} - Array of scouting entries for the event
 */
export async function getEventScoutingData(eventKey) {
  try {
    const q = query(
      collection(db, SCOUTING_COLLECTION),
      where('eventKey', '==', eventKey),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('❌ Error fetching event scouting data:', error);
    throw error;
  }
}

// =============================================================================
// UPDATE - Update an existing scouting entry
// =============================================================================

/**
 * Update an existing scouting entry
 * 
 * @param {string} docId - The document ID to update
 * @param {Object} data - The data to update
 */
export async function updateScoutingData(docId, data) {
  try {
    await updateDoc(doc(db, SCOUTING_COLLECTION, docId), data);
    console.log('✅ Scouting data updated:', docId);
  } catch (error) {
    console.error('❌ Error updating scouting data:', error);
    throw error;
  }
}

// =============================================================================
// DELETE - Delete a scouting entry
// =============================================================================

/**
 * Delete a scouting entry
 * 
 * @param {string} docId - The document ID to delete
 */
export async function deleteScoutingData(docId) {
  try {
    await deleteDoc(doc(db, SCOUTING_COLLECTION, docId));
    console.log('✅ Scouting data deleted:', docId);
  } catch (error) {
    console.error('❌ Error deleting scouting data:', error);
    throw error;
  }
}

