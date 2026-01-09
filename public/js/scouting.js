/**
 * =============================================================================
 * SCOUTING.JS - Scouting Form Handler
 * =============================================================================
 *
 * WHAT IS THIS FILE?
 * This file handles all the scouting form functionality:
 * - Counter buttons (+/- for scoring counts)
 * - Form data collection
 * - Form submission to Firestore
 * - Form reset
 *
 * HOW THE FORM WORKS:
 * 1. User fills out the scouting form
 * 2. Counter buttons increment/decrement numeric values
 * 3. On submit, all data is collected into an object
 * 4. Data is saved to Firestore via app.js
 * 5. User gets feedback (success/error message)
 * 6. Form resets for the next entry
 *
 * =============================================================================
 */


// =============================================================================
// IMPORTS
// =============================================================================

// Import the save function from app.js
// This function handles the actual Firestore write operation
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { saveScoutingData, signOutUser } from './app.js';

// =============================================================================
// AUTH STATE
// =============================================================================
const userInfo = document.getElementById('userInfo');
const userEmail = document.getElementById('userEmail');
const logoutBtn = document.getElementById('logoutBtn');

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  if (userInfo) userInfo.style.display = 'block';
  if (userEmail) userEmail.textContent = user.email;

  // Auto-fill scouter name if available
  const scouterNameInput = document.getElementById('scouterName');
  if (scouterNameInput && !scouterNameInput.value) {
    // Try to get display name or use email prefix
    scouterNameInput.value = user.displayName || user.email.split('@')[0];
  }
});

if (logoutBtn) logoutBtn.addEventListener('click', signOutUser);


// =============================================================================
// COUNTER BUTTON HANDLERS
// =============================================================================
//
// Counter buttons are the +/- buttons next to numeric inputs.
// They make it easy to increment/decrement values without typing.
//
// HTML STRUCTURE:
// <div class="counter-group">
//   <button class="counter-btn minus" data-target="autoSpeaker">-</button>
//   <input type="number" id="autoSpeaker" value="0">
//   <button class="counter-btn plus" data-target="autoSpeaker">+</button>
// </div>
//
// =============================================================================

/**
 * INITIALIZE COUNTER BUTTONS
 * --------------------------
 * Sets up click handlers for all +/- counter buttons on the page.
 *
 * HOW IT WORKS:
 * 1. Find all elements with class 'counter-btn'
 * 2. Add a click event listener to each
 * 3. When clicked, find the target input using data-target attribute
 * 4. Increment or decrement the value based on button class
 *
 * QUERYSELECTORALL EXPLAINED:
 * document.querySelectorAll('.counter-btn') returns a list of all elements
 * that have the class 'counter-btn'. We then loop through each one.
 *
 * DATA ATTRIBUTES EXPLAINED:
 * data-target="autoSpeaker" in HTML becomes button.dataset.target in JS.
 * This tells us which input field this button controls.
 */
function initCounterButtons() {
  // Find all counter buttons and add click handlers
  document.querySelectorAll('.counter-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      // Prevent form submission when clicking the button
      e.preventDefault();

      // Get the ID of the input this button controls
      const targetId = button.dataset.target;

      // Find the input element
      const input = document.getElementById(targetId);

      // Get current value (default to 0 if empty or NaN)
      let value = parseInt(input.value) || 0;

      // Check if this is a plus or minus button
      if (button.classList.contains('plus')) {
        // Increment the value
        value++;
      } else if (button.classList.contains('minus') && value > 0) {
        // Decrement the value (but don't go below 0)
        value--;
      }

      // Update the input with the new value
      input.value = value;
    });
  });
}


// =============================================================================
// FORM DATA COLLECTION
// =============================================================================
//
// This section handles collecting all the form data into a JavaScript object
// that can be saved to Firestore.
//
// =============================================================================

/**
 * COLLECT FORM DATA
 * -----------------
 * Gathers all form field values into a single object.
 *
 * TWO WAYS TO GET FORM DATA:
 * 1. FormData API: formData.get('fieldName') - works for inputs with name attribute
 * 2. Direct access: document.getElementById('id').value - works for any element
 *
 * We use both methods depending on the input type:
 * - FormData for text inputs, selects, and radio buttons
 * - Direct access for checkboxes and counter inputs
 *
 * PARSEINT EXPLAINED:
 * parseInt() converts a string to an integer.
 * "5" (string) → 5 (number)
 * The || 0 provides a default if parsing fails.
 *
 * @returns {Object} - All form data as a JavaScript object
 */
function collectFormData() {
  // Get the form element
  const form = document.getElementById('scoutingForm');

  // Create a FormData object from the form
  // This automatically collects all named inputs
  const formData = new FormData(form);

  // Build the scouting data object
  // Each property corresponds to a form field
  const scoutingData = {
    // =========================================
    // MATCH INFORMATION
    // Basic info about the match being scouted
    // =========================================
    scouterName: formData.get('scouterName'),
    matchNumber: parseInt(formData.get('matchNumber')),
    teamNumber: parseInt(formData.get('teamNumber')),
    allianceColor: formData.get('allianceColor'),
    startPosition: formData.get('startPosition'),

    // =========================================
    // AUTONOMOUS PERIOD
    // First 15 seconds of the match (robot runs on its own)
    // =========================================
    autoMobility: document.getElementById('autoMobility').checked,
    autoSpeaker: parseInt(document.getElementById('autoSpeaker').value) || 0,
    autoAmp: parseInt(document.getElementById('autoAmp').value) || 0,
    autoMissed: parseInt(document.getElementById('autoMissed').value) || 0,

    // =========================================
    // TELEOP PERIOD
    // Driver-controlled portion of the match
    // =========================================
    teleopSpeaker: parseInt(document.getElementById('teleopSpeaker').value) || 0,
    teleopAmp: parseInt(document.getElementById('teleopAmp').value) || 0,
    teleopMissed: parseInt(document.getElementById('teleopMissed').value) || 0,
    amplifiedScored: parseInt(document.getElementById('amplifiedScored').value) || 0,
    playedDefense: document.getElementById('playedDefense').checked,
    wasDefended: document.getElementById('wasDefended').checked,

    // =========================================
    // ENDGAME
    // Last 20 seconds - climbing and trap scoring
    // =========================================
    climbStatus: formData.get('climbStatus'),
    trapScored: document.getElementById('trapScored').checked,
    spotlit: document.getElementById('spotlit').checked,

    // =========================================
    // RATINGS
    // Subjective assessments (1-5 scale)
    // =========================================
    driverSkill: parseInt(formData.get('driverSkill')) || 3,
    defenseRating: parseInt(formData.get('defenseRating')) || 3,

    // =========================================
    // NOTES & FLAGS
    // Additional observations
    // =========================================
    notes: formData.get('notes'),
    robotDied: document.getElementById('robotDied').checked,
    hadCard: document.getElementById('hadCard').checked
  };

  return scoutingData;
}


// =============================================================================
// FORM SUBMISSION
// =============================================================================
//
// Handles the form submit event, saves data, and provides user feedback.
//
// =============================================================================

/**
 * HANDLE FORM SUBMIT
 * ------------------
 * Called when the user clicks the submit button.
 *
 * ASYNC/AWAIT EXPLAINED:
 * - 'async' marks this as an asynchronous function
 * - 'await' pauses execution until the save operation completes
 * - This prevents the UI from freezing during the save
 *
 * TRY/CATCH/FINALLY EXPLAINED:
 * - 'try' block: Code that might fail
 * - 'catch' block: Handles errors if they occur
 * - 'finally' block: Always runs, regardless of success/failure
 *
 * @param {Event} e - The form submit event
 */
async function handleFormSubmit(e) {
  // Prevent the default form submission (which would reload the page)
  e.preventDefault();

  // Get references to UI elements we'll update
  const statusDiv = document.getElementById('submitStatus');
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const successOverlay = document.getElementById('successOverlay');

  try {
    // =========================================
    // STEP 1: Show loading state
    // =========================================
    submitBtn.disabled = true;                    // Prevent double-submit
    submitBtn.textContent = 'Submitting...';      // Update button text
    if (statusDiv) {
      statusDiv.className = 'submit-status loading'; // Blue loading style
      statusDiv.textContent = 'Saving scouting data...';
    }

    // =========================================
    // STEP 2: Collect and save data
    // =========================================
    const scoutingData = collectFormData();       // Gather all form values

    // Validate required fields
    if (!scoutingData.teamNumber || !scoutingData.matchNumber) {
      throw new Error('Team number and match number are required');
    }

    const docId = await saveScoutingData(scoutingData);  // Save to Firestore

    // =========================================
    // STEP 3: Show success message
    // =========================================
    console.log('✅ Scouting data saved:', docId);

    // Show success overlay if it exists
    if (successOverlay) {
      successOverlay.style.display = 'flex';
      successOverlay.innerHTML = `
        <div class="success-content">
          <div class="success-icon">✅</div>
          <h2>Scouting Data Saved!</h2>
          <p>Team ${scoutingData.teamNumber} - Match ${scoutingData.matchNumber}</p>
          <button class="btn btn-primary" onclick="document.getElementById('successOverlay').style.display='none'; window.resetForm();">
            Scout Another Match
          </button>
        </div>
      `;
    } else if (statusDiv) {
      statusDiv.className = 'submit-status success'; // Green success style
      statusDiv.textContent = `✅ Saved! Team ${scoutingData.teamNumber} - Match ${scoutingData.matchNumber}`;

      // Reset form after delay
      setTimeout(() => {
        resetForm();
        statusDiv.textContent = '';
        statusDiv.className = 'submit-status';
      }, 3000);
    }

  } catch (error) {
    // =========================================
    // ERROR HANDLING
    // =========================================
    if (statusDiv) {
      statusDiv.className = 'submit-status error';  // Red error style
      statusDiv.textContent = `❌ Error: ${error.message}`;
    }
    console.error('Form submission error:', error);

  } finally {
    // =========================================
    // CLEANUP (always runs)
    // =========================================
    submitBtn.disabled = false;                   // Re-enable button
    submitBtn.textContent = 'Submit Scouting Data'; // Reset button text
  }
}


// =============================================================================
// FORM RESET
// =============================================================================

/**
 * RESET FORM
 * ----------
 * Clears all form fields and resets to default values.
 *
 * WINDOW.RESETFORM EXPLAINED:
 * By assigning to window.resetForm, we make this function globally accessible.
 * This allows it to be called from HTML onclick attributes:
 * <button onclick="resetForm()">Reset</button>
 */
window.resetForm = function() {
  // Get the form element
  const form = document.getElementById('scoutingForm');

  // Use the built-in reset() method to clear all fields
  form.reset();

  // Reset all counter inputs to 0
  // (form.reset() doesn't always handle these correctly)
  document.querySelectorAll('.counter-group input').forEach(input => {
    input.value = 0;
  });

  // Clear any status message
  const statusDiv = document.getElementById('submitStatus');
  if (statusDiv) {
    statusDiv.textContent = '';
    statusDiv.className = 'submit-status';
  }

  console.log('📋 Form reset');
};


// =============================================================================
// INITIALIZATION
// =============================================================================
//
// This code runs when the page loads and sets up all the event handlers.
//
// =============================================================================

/**
 * DOMCONTENTLOADED EVENT
 * ----------------------
 * This event fires when the HTML document has been completely parsed.
 * It's the right time to set up event handlers because all elements exist.
 *
 * WHY NOT JUST RUN THE CODE IMMEDIATELY?
 * If we try to access elements before they exist, we get errors.
 * DOMContentLoaded ensures the HTML is ready before we try to use it.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Set up the counter buttons (+/- buttons)
  initCounterButtons();

  // Set up form submission handler
  const form = document.getElementById('scoutingForm');
  if (form) {
    form.addEventListener('submit', handleFormSubmit);
  }

  console.log('📝 Scouting form initialized');
});
