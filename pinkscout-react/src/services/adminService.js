/**
 * =============================================================================
 * ADMINSERVICE.JS - Admin Panel Firestore Operations
 * =============================================================================
 * 
 * WHAT IS THIS FILE?
 * Handles admin-specific operations:
 * - Question management (CRUD)
 * - Admin list management
 * - Data statistics
 * - API status checks
 * 
 * FIRESTORE COLLECTIONS:
 * - questions/{docId} - Scouting form questions
 * - settings/admins - Admin email list
 * 
 * =============================================================================
 */

import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { db, API_KEYS } from './firebase';

// =============================================================================
// QUESTION MANAGEMENT
// =============================================================================

/**
 * Get all scouting questions, ordered by their display order
 * 
 * @returns {Array} - Array of question objects with IDs
 */
export async function getAllQuestions() {
  try {
    const q = query(collection(db, 'questions'), orderBy('order', 'asc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error fetching questions:', error);
    throw error;
  }
}

/**
 * Add a new scouting question
 * 
 * @param {Object} question - Question object { text, category, type, order }
 * @returns {string} - The document ID of the new question
 */
export async function addQuestion(question) {
  try {
    const docRef = await addDoc(collection(db, 'questions'), question);
    console.log('✅ Question added:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error adding question:', error);
    throw error;
  }
}

/**
 * Update an existing question
 * 
 * @param {string} docId - The document ID to update
 * @param {Object} data - The data to update
 */
export async function updateQuestion(docId, data) {
  try {
    await updateDoc(doc(db, 'questions', docId), data);
    console.log('✅ Question updated:', docId);
  } catch (error) {
    console.error('Error updating question:', error);
    throw error;
  }
}

/**
 * Delete a question
 * 
 * @param {string} docId - The document ID to delete
 */
export async function deleteQuestion(docId) {
  try {
    await deleteDoc(doc(db, 'questions', docId));
    console.log('✅ Question deleted:', docId);
  } catch (error) {
    console.error('Error deleting question:', error);
    throw error;
  }
}

// =============================================================================
// ADMIN LIST MANAGEMENT
// =============================================================================

/**
 * Get the list of admin emails
 * 
 * @returns {Array} - Array of admin email strings
 */
export async function getAdminList() {
  try {
    const adminsDoc = await getDoc(doc(db, 'settings', 'admins'));
    if (adminsDoc.exists()) {
      return adminsDoc.data().emails || [];
    }
    return [];
  } catch (error) {
    console.error('Error fetching admin list:', error);
    throw error;
  }
}

/**
 * Add an email to the admin list
 * 
 * @param {string} email - Email to add as admin
 */
export async function addAdmin(email) {
  try {
    await setDoc(doc(db, 'settings', 'admins'), {
      emails: arrayUnion(email.toLowerCase())
    }, { merge: true });
    console.log('✅ Admin added:', email);
  } catch (error) {
    console.error('Error adding admin:', error);
    throw error;
  }
}

/**
 * Remove an email from the admin list
 * 
 * @param {string} email - Email to remove from admins
 */
export async function removeAdmin(email) {
  try {
    await setDoc(doc(db, 'settings', 'admins'), {
      emails: arrayRemove(email)
    }, { merge: true });
    console.log('✅ Admin removed:', email);
  } catch (error) {
    console.error('Error removing admin:', error);
    throw error;
  }
}

// =============================================================================
// API STATUS
// =============================================================================

/**
 * Check the status of external APIs
 * 
 * @returns {Object} - Status of each API { tba, statbotics }
 */
export async function getAPIStatus() {
  const status = { tba: false, statbotics: false };
  
  // Check TBA
  try {
    const tbaRes = await fetch('https://www.thebluealliance.com/api/v3/status', {
      headers: { 'X-TBA-Auth-Key': API_KEYS.TBA }
    });
    status.tba = tbaRes.ok;
  } catch { status.tba = false; }
  
  // Check Statbotics
  try {
    const sbRes = await fetch('https://api.statbotics.io/v3/team/1551');
    status.statbotics = sbRes.ok;
  } catch { status.statbotics = false; }
  
  return status;
}

