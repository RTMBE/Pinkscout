/**
 * =============================================================================
 * SCOUTING.JSX - Match Scouting Form
 * =============================================================================
 *
 * PURPOSE:
 * This is the main scouting form page where users record match data during
 * FRC (FIRST Robotics Competition) events. Scouts use this form to track
 * what robots do during matches.
 *
 * HOW IT WORKS:
 * 1. User selects an event (competition) from a searchable dropdown
 * 2. User enters the team number they're scouting and match number
 * 3. User records what happens during the match:
 *    - Auto Period (first 20 seconds - robot runs autonomously)
 *    - Teleop Period (2:20 - drivers control the robot)
 *    - Endgame (final 30 seconds - climbing for bonus points)
 * 4. User submits the form, data is saved to the database
 *
 * KEY CONCEPTS FOR NON-REACT DEVELOPERS:
 *
 * - useState(): Creates a "state variable" that React tracks. When it changes,
 *   the page automatically re-renders to show the new value.
 *   Example: const [count, setCount] = useState(0);
 *            count = current value, setCount = function to update it
 *
 * - useEffect(): Runs code when the component loads or when specified values change.
 *   Think of it like "do this thing when X happens"
 *   Example: useEffect(() => { loadData(); }, [year]);
 *            This runs loadData() whenever 'year' changes
 *
 * - useRef(): Creates a reference to a DOM element (like an input field)
 *   so you can interact with it directly (e.g., focus it)
 *
 * - useMemo(): Caches a calculated value so it doesn't recalculate every render.
 *   Only recalculates when its dependencies change.
 *
 * - JSX: The HTML-like syntax in the return statement. It's how React
 *   describes what the UI should look like.
 *
 * - Props: Data passed from parent to child components (like function arguments)
 *
 * - Event Handlers: Functions that run when user interacts (onClick, onChange, etc.)
 *
 * FORM FIELDS (2026 REBUILT™ Game):
 * - Team Number, Match Number, Event Key, Starting Position
 * - Alliance Color (Red/Blue)
 * - Auto: Fuel scored, cycles, tower climb, team won auto
 * - Teleop: Fuel scored (active Hub), cycle tracking
 * - Endgame: Tower climb level (L1=15pts, L2=20pts, L3=30pts)
 * - Robot Role: Shooter, Cycler, or Defense
 * - Notes
 *
 * =============================================================================
 */

// =============================================================================
// IMPORTS - External libraries and internal modules this file needs
// =============================================================================

// React hooks for state management and side effects
// useState: Track changing data (like form inputs)
// useEffect: Run code when component loads or data changes
// useRef: Reference DOM elements directly
// useMemo: Cache expensive calculations
import { useState, useEffect, useRef, useMemo } from 'react';

// React Router hook for programmatic navigation (redirecting to other pages)
import { useNavigate } from 'react-router-dom';

// Helmet manages the <head> section (page title, meta tags for SEO)
import { Helmet } from 'react-helmet-async';

// Our custom service for saving scouting data to the database
import { saveScoutingData } from '../services/scoutingService';

// Blue Alliance API functions to get event lists and match schedules
import { getEventList, getTeamEvents, getEventMatches } from '../services/blueAllianceAPI';

// Custom hook to access the logged-in user's info and permissions
import { useAuth } from '../contexts/AuthContext';

// =============================================================================
// CONSTANTS - Values that never change
// =============================================================================

// LocalStorage keys for persisting event selection between page visits
// LocalStorage is browser storage that survives page refreshes
const STORAGE_KEY_YEAR = 'pinkscout_scouting_year';
const STORAGE_KEY_EVENT = 'pinkscout_scouting_event';

// =============================================================================
// MAIN COMPONENT FUNCTION
// =============================================================================
// In React, a component is a function that returns JSX (the UI description).
// This function runs every time the component needs to re-render.
// "export default" means this is the main thing other files import from here.

export default function Scouting() {
  // ---------------------------------------------------------------------------
  // HOOKS - These must be called at the top level of the component
  // ---------------------------------------------------------------------------

  // useNavigate() returns a function to redirect to other pages programmatically
  // Example: navigate('/home') would redirect to the home page
  const navigate = useNavigate();

  // useAuth() is our custom hook that provides:
  // - user: The logged-in user's authentication info (id, email, etc.)
  // - userProfile: The user's profile data from our database (teamNumber, role, etc.)
  // - roleContext: Permission info (scoutingId, teamLeadUid) for data isolation
  const { user, userProfile, roleContext } = useAuth();

  // ===========================================================================
  // STATE VARIABLES - Data that can change and triggers re-renders
  // ===========================================================================
  // Each useState() call creates:
  // 1. A variable to hold the current value
  // 2. A setter function to update it (React re-renders when you call this)

  // ---------------------------------------------------------------------------
  // Event Selection State - For picking which competition event to scout
  // ---------------------------------------------------------------------------

  // Get the current year (e.g., 2026) for the year dropdown default
  const currentYear = new Date().getFullYear();

  // Selected year - initialized from localStorage if available, otherwise current year
  // The function inside useState() is called "lazy initialization" - it only runs once
  const [selectedYear, setSelectedYear] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_YEAR);
    return saved ? parseInt(saved) : currentYear;
  });

  // Array of all events for the selected year (fetched from Blue Alliance API)
  const [events, setEvents] = useState([]);

  // The currently selected event's key (e.g., "2026miket")
  const [selectedEvent, setSelectedEvent] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_EVENT) || '';
  });

  // Whether we're currently loading events from the API
  const [loadingEvents, setLoadingEvents] = useState(false);

  // ---------------------------------------------------------------------------
  // Searchable Event Dropdown State
  // ---------------------------------------------------------------------------

  // What the user has typed in the event search box
  const [eventSearchQuery, setEventSearchQuery] = useState('');

  // Whether to show the dropdown list of events
  const [showEventDropdown, setShowEventDropdown] = useState(false);

  // useRef() creates a reference to a DOM element
  // We can use these to focus inputs or detect clicks outside the dropdown
  const eventSearchRef = useRef(null);  // Reference to the search input
  const dropdownRef = useRef(null);      // Reference to the dropdown container

  // ---------------------------------------------------------------------------
  // TBA Match Schedule State - For auto-filling team numbers
  // ---------------------------------------------------------------------------
  const [eventMatches, setEventMatches] = useState([]);       // All matches for selected event
  const [loadingMatches, setLoadingMatches] = useState(false); // Loading state for matches
  const [alliancePosition, setAlliancePosition] = useState(1); // Position 1, 2, or 3 within alliance

  // ===========================================================================
  // FORM DATA STATE - All the match scouting data fields
  // ===========================================================================
  // This is one big object containing all form fields.
  // When any field changes, we update the whole object with the new value.

  const [formData, setFormData] = useState({
    // --- Match Info ---
    teamNumber: '',           // The FRC team number being scouted (e.g., 1551)
    matchNumber: '',          // Which match number (e.g., Quals 1, 2, 3...)
    allianceColor: 'red',     // Which alliance: 'red' or 'blue'
    startingPosition: '',     // Where robot started: 'left', 'center', or 'right'

    // --- Auto Period (2026 REBUILT™) - First 20 seconds, robot runs on its own ---
    autoFuelScored: 0,        // Fuel (balls) scored in active Hub (1 point each)
    autoCyclesCompleted: 0,   // Complete cycles during auto
    autoTowerClimb: 'none',   // Tower climb in auto: 'none' or 'level1' (10 pts, max 2 robots)

    // --- Teleop Period (2026 REBUILT™) - 2:20 with drivers controlling robots ---
    teleopFuelActive: 0,      // Fuel scored when your Hub is active (1 pt each)
    teleopFuelInactive: 0,    // Fuel scored when Hub inactive (0 pts, tracked for strategy)
    teleopBallsCycled: 0,     // Balls cycled (moving balls to your alliance's side)

    // --- Endgame - Final 30 seconds, Tower Climb for big points ---
    endgameTowerLevel: 'none', // Climb level: 'none', 'level1'(15pts), 'level2'(20pts), 'level3'(30pts)
    endgameFuelScored: 0,      // Fuel scored during endgame (all Hubs active)

    // --- Performance Notes ---
    hubControlFirst: false,   // Checkbox: Did this team's alliance win auto?
    robotRole: '',            // Primary role: 'shooter', 'cycler', or 'defense'
    notes: ''                 // Free-text notes about the robot's performance
  });

  // ---------------------------------------------------------------------------
  // Form Submission State
  // ---------------------------------------------------------------------------
  const [submitting, setSubmitting] = useState(false);  // Is form currently submitting?
  const [error, setError] = useState('');               // Error message to display
  const [success, setSuccess] = useState(false);        // Show success message?

  // ===========================================================================
  // EFFECTS - Code that runs when the component loads or when data changes
  // ===========================================================================
  // useEffect takes two arguments:
  // 1. A function to run
  // 2. An array of "dependencies" - the effect re-runs when these change

  // ---------------------------------------------------------------------------
  // Load events whenever the selected year changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    loadEvents();  // Call our async function to fetch events
  }, [selectedYear]);  // Dependency array: re-run when selectedYear changes

  // ---------------------------------------------------------------------------
  // loadEvents() - Fetch list of FRC events from The Blue Alliance API
  // ---------------------------------------------------------------------------
  // This is an "async" function, meaning it can wait for data from the internet.
  // "await" pauses execution until the promise resolves (data comes back).

  const loadEvents = async () => {
    // Show loading indicator while fetching
    setLoadingEvents(true);

    try {
      // Fetch all events for the selected year from The Blue Alliance API
      const eventList = await getEventList(selectedYear);
      setEvents(eventList);

      // If the previously saved event doesn't exist in this year's list, clear it
      // .find() searches the array and returns the first match, or undefined
      if (selectedEvent && !eventList.find(e => e.key === selectedEvent)) {
        setSelectedEvent('');
        localStorage.removeItem(STORAGE_KEY_EVENT);
      }

      // --- Smart Auto-Selection Logic ---
      // If no event is saved AND user has a team number, try to auto-select
      // their team's current or upcoming event for convenience
      const savedEvent = localStorage.getItem(STORAGE_KEY_EVENT);
      if (!savedEvent && userProfile?.teamNumber && eventList.length > 0) {
        try {
          // Get all events that the user's team is registered for
          const teamEvents = await getTeamEvents(userProfile.teamNumber, selectedYear);

          if (teamEvents.length > 0) {
            const now = new Date();

            // Priority 1: Find an event that's happening RIGHT NOW
            let relevantEvent = teamEvents.find(e => {
              const start = new Date(e.start_date);
              const end = new Date(e.end_date);
              end.setDate(end.getDate() + 1); // Include the entire end date
              return now >= start && now <= end;
            });

            // Priority 2: If no current event, find the NEXT upcoming event
            if (!relevantEvent) {
              relevantEvent = teamEvents.find(e => new Date(e.start_date) >= now);
            }

            // Priority 3: If no upcoming event, use the MOST RECENT past event
            if (!relevantEvent) {
              relevantEvent = teamEvents[teamEvents.length - 1];
            }

            // Auto-select the relevant event (if it exists in the event list)
            if (relevantEvent && eventList.find(e => e.key === relevantEvent.key)) {
              setSelectedEvent(relevantEvent.key);
              setEventSearchQuery(relevantEvent.name);
              localStorage.setItem(STORAGE_KEY_EVENT, relevantEvent.key);
            }
          }
        } catch (teamEventsErr) {
          // If we can't load team events, just log a warning and continue
          console.warn('Could not load team events for auto-selection:', teamEventsErr);
        }
      }
    } catch (err) {
      // If anything goes wrong, log the error and show empty events list
      console.error('Error loading events:', err);
      setEvents([]);
    } finally {
      // "finally" always runs, whether there was an error or not
      // Hide the loading indicator
      setLoadingEvents(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Load match schedule when event is selected
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const loadMatches = async () => {
      if (!selectedEvent) {
        setEventMatches([]);
        return;
      }
      setLoadingMatches(true);
      try {
        const matches = await getEventMatches(selectedEvent);
        setEventMatches(matches);
      } catch (err) {
        console.warn('Could not load matches for auto-fill:', err);
        setEventMatches([]);
      } finally {
        setLoadingMatches(false);
      }
    };
    loadMatches();
  }, [selectedEvent]);

  // ---------------------------------------------------------------------------
  // Auto-fill team number from match schedule
  // ---------------------------------------------------------------------------
  const autoFillTeamNumber = useMemo(() => {
    // Find the match that matches our criteria
    if (!eventMatches.length || !formData.matchNumber) return null;

    const matchNum = parseInt(formData.matchNumber);
    if (isNaN(matchNum)) return null;

    // Look for qualification matches (qm) first, as they're most common
    const match = eventMatches.find(m =>
      m.comp_level === 'qm' && m.match_number === matchNum
    );

    if (!match) return null;

    // TBA stores alliances as: match.alliances.red.team_keys = ["frc1551", "frc254", "frc118"]
    const allianceKey = formData.allianceColor; // 'red' or 'blue'
    const teamKeys = match.alliances?.[allianceKey]?.team_keys || [];

    // alliancePosition is 1, 2, or 3 (user-selected)
    const teamKey = teamKeys[alliancePosition - 1]; // Convert to 0-indexed

    if (!teamKey) return null;

    // Extract team number from "frc1551" format
    return teamKey.replace('frc', '');
  }, [eventMatches, formData.matchNumber, formData.allianceColor, alliancePosition]);

  // Effect to auto-fill team number when it changes
  useEffect(() => {
    if (autoFillTeamNumber && !formData.teamNumber) {
      setFormData(prev => ({ ...prev, teamNumber: autoFillTeamNumber }));
    }
  }, [autoFillTeamNumber]);

  // ===========================================================================
  // EVENT HANDLERS - Functions that respond to user interactions
  // ===========================================================================

  // ---------------------------------------------------------------------------
  // handleYearChange() - When user selects a different year
  // ---------------------------------------------------------------------------
  const handleYearChange = (year) => {
    setSelectedYear(year);                                    // Update state
    localStorage.setItem(STORAGE_KEY_YEAR, year.toString()); // Persist to storage
    // Clear event selection since events are different for each year
    setSelectedEvent('');
    setEventSearchQuery('');
    localStorage.removeItem(STORAGE_KEY_EVENT);
  };

  // ---------------------------------------------------------------------------
  // handleEventChange() - When user selects an event from the dropdown
  // ---------------------------------------------------------------------------
  const handleEventChange = (eventKey) => {
    setSelectedEvent(eventKey);          // Update the selected event key
    setShowEventDropdown(false);         // Close the dropdown

    if (eventKey) {
      // Save to localStorage so it persists between page visits
      localStorage.setItem(STORAGE_KEY_EVENT, eventKey);
      // Find the full event object to get its name for display
      const event = events.find(e => e.key === eventKey);
      if (event) {
        setEventSearchQuery(event.name);
      }
    } else {
      // If eventKey is empty (cleared), reset everything
      setEventSearchQuery('');
      localStorage.removeItem(STORAGE_KEY_EVENT);
    }
  };

  // ---------------------------------------------------------------------------
  // Computed Values - Derived from state, recalculated when state changes
  // ---------------------------------------------------------------------------

  // Get the display name of the currently selected event
  // The ?. is "optional chaining" - returns undefined if the find() returns nothing
  const selectedEventName = events.find(e => e.key === selectedEvent)?.name || '';

  // ---------------------------------------------------------------------------
  // filteredEvents - Memoized filtered list based on search query
  // ---------------------------------------------------------------------------
  // useMemo() caches the result so we don't re-filter on every render,
  // only when events or eventSearchQuery actually change
  const filteredEvents = useMemo(() => {
    // If search is empty, return all events
    if (!eventSearchQuery.trim()) return events;

    // Convert search to lowercase for case-insensitive matching
    const query = eventSearchQuery.toLowerCase();

    // Filter events by checking name, key, city, or state
    // .filter() creates a new array with only items that pass the test
    // .includes() checks if a string contains the search query
    return events.filter(event =>
      event.name.toLowerCase().includes(query) ||
      event.key.toLowerCase().includes(query) ||
      (event.city && event.city.toLowerCase().includes(query)) ||
      (event.state_prov && event.state_prov.toLowerCase().includes(query))
    );
  }, [events, eventSearchQuery]); // Dependencies: recalculate when these change

  // ---------------------------------------------------------------------------
  // Effect: Close dropdown when clicking outside of it
  // ---------------------------------------------------------------------------
  // This is a common pattern for dropdown menus
  useEffect(() => {
    // Function to check if click was outside the dropdown
    const handleClickOutside = (e) => {
      // Check if click target is outside BOTH the dropdown AND the search input
      // .contains() checks if an element is inside another element
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          eventSearchRef.current && !eventSearchRef.current.contains(e.target)) {
        setShowEventDropdown(false);  // Close the dropdown
      }
    };

    // Add the click listener to the entire document
    document.addEventListener('mousedown', handleClickOutside);

    // Cleanup function: runs when component unmounts or effect re-runs
    // This prevents memory leaks by removing the listener
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);  // Empty dependency array = only run once when component mounts

  // ---------------------------------------------------------------------------
  // Effect: Initialize search query from saved event on load
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // If we have a selected event and events are loaded, show the event name
    if (selectedEvent && events.length > 0) {
      const event = events.find(e => e.key === selectedEvent);
      if (event) {
        setEventSearchQuery(event.name);
      }
    }
  }, [selectedEvent, events]);  // Re-run when selectedEvent or events change

  // ===========================================================================
  // FORM INPUT HANDLERS - Functions called when user interacts with form fields
  // ===========================================================================

  // ---------------------------------------------------------------------------
  // handleChange() - Generic handler for text inputs, checkboxes, selects, etc.
  // ---------------------------------------------------------------------------
  // "e" is the event object - it contains info about what happened
  // e.target is the element that triggered the event (the input field)

  const handleChange = (e) => {
    // Destructure properties from the input element
    const { name, value, type, checked } = e.target;

    // Update formData with the new value
    // We use a function inside setState to get the previous state
    setFormData(prev => ({
      ...prev,  // Spread operator: copy all existing fields
      // Set the changed field to its new value:
      // - For checkboxes: use the checked boolean (true/false)
      // - For numbers: parse to integer
      // - For everything else: use the raw value
      [name]: type === 'checkbox' ? checked :
              type === 'number' ? parseInt(value) || 0 : value
    }));
  };

  // ---------------------------------------------------------------------------
  // handleIncrement() - For +/- counter buttons (like scoring counters)
  // ---------------------------------------------------------------------------
  // field: which form field to update (e.g., 'autoFuelScored')
  // delta: how much to change it (+1 or -1)

  const handleIncrement = (field, delta) => {
    setFormData(prev => ({
      ...prev,
      // Math.max(0, ...) ensures the value never goes below 0
      [field]: Math.max(0, (prev[field] || 0) + delta)
    }));
  };

  // ---------------------------------------------------------------------------
  // handleSubmit() - Called when user submits the form
  // ---------------------------------------------------------------------------
  // "async" because we need to wait for the database save operation

  const handleSubmit = async (e) => {
    // Prevent the browser's default form submission (which would reload the page)
    e.preventDefault();

    // Clear any previous error and show loading state
    setError('');
    setSubmitting(true);

    try {
      // --- Validation: Check required fields before saving ---
      if (!formData.teamNumber) {
        throw new Error('Team number is required');
      }
      if (!selectedEvent) {
        throw new Error('Please select an event');
      }

      // Check that user has permission to submit scouting data
      // They need either scoutingId (old system) or teamLeadUid (new team system)
      if (!roleContext?.scoutingId && !roleContext?.teamLeadUid) {
        throw new Error('Your account is not linked to a team. Please update your profile or join a team.');
      }

      // --- Build the data object to save ---
      // Combine form data with additional metadata
      const dataToSave = {
        ...formData,                                                       // All form fields
        teamNumber: parseInt(formData.teamNumber),                        // Ensure it's a number
        matchNumber: parseInt(formData.matchNumber) || 0,                 // Default to 0 if empty
        eventKey: selectedEvent,                                          // Which event
        eventYear: selectedYear,                                          // Which year
        scouterName: userProfile?.displayName || user?.displayName || user?.email,  // Who scouted
        scouterUid: user?.id                                              // Scouter's user ID (Supabase uses user.id)
      };

      // Include scoutingId if available (legacy system for data isolation)
      if (roleContext.scoutingId) {
        dataToSave.scoutingId = roleContext.scoutingId;
      }

      // Include teamLeadUid if available (new team system for data isolation)
      if (roleContext.teamLeadUid) {
        dataToSave.teamLeadUid = roleContext.teamLeadUid;
      }

      // --- Save to database ---
      // This calls our scoutingService which inserts into Supabase
      await saveScoutingData(dataToSave);

      // Show success message
      setSuccess(true);

      // --- Reset form after 2 seconds ---
      // setTimeout() runs a function after a delay (in milliseconds)
      // We keep the event selection so user can quickly scout next match
      setTimeout(() => {
        setFormData({
          teamNumber: '',
          matchNumber: '',
          allianceColor: 'red',
          startingPosition: '',
          autoFuelScored: 0,
          autoCyclesCompleted: 0,
          autoTowerClimb: 'none',
          teleopFuelActive: 0,
          teleopFuelInactive: 0,
          teleopBallsCycled: 0,
          endgameTowerLevel: 'none',
          endgameFuelScored: 0,
          hubControlFirst: false,
          robotRole: '',
          notes: ''
        });
        setSuccess(false);  // Hide success message
      }, 2000);  // 2000ms = 2 seconds

    } catch (err) {
      // If anything went wrong, show the error message
      console.error('Error saving scouting data:', err);
      setError(err.message || 'Failed to save data. Please try again.');
    } finally {
      // "finally" always runs whether success or error
      // Hide the loading state
      setSubmitting(false);
    }
  };

  // ===========================================================================
  // RENDER - The UI that gets displayed
  // ===========================================================================
  // Everything below is JSX - a syntax that looks like HTML but is actually JavaScript.
  // React converts this to actual DOM elements.
  //
  // KEY JSX CONCEPTS:
  // - {variable} = Insert a JavaScript value into the HTML
  // - {condition && <element>} = Only render if condition is true (conditional rendering)
  // - {condition ? <a> : <b>} = Ternary: render <a> if true, <b> if false
  // - className = React's version of HTML "class" (since "class" is reserved in JS)
  // - style={{...}} = Inline styles as a JavaScript object (note double braces)
  // - onClick={() => ...} = Event handler as an arrow function
  // - <> and </> = Fragment: groups elements without adding an extra DOM node

  return (
    <>
      {/* ------------------------------------------------------------------- */}
      {/* Helmet - Manages the page's <head> section (title, meta tags) */}
      {/* ------------------------------------------------------------------- */}
      <Helmet>
        <title>Scout Match - PinkScout</title>
        <meta name="description" content="Record match scouting data" />
      </Helmet>

      {/* ------------------------------------------------------------------- */}
      {/* Page Header - Title at top of page */}
      {/* ------------------------------------------------------------------- */}
      <header className="page-header">
        <h1>📝 Scout a Match</h1>
        <p>Record match data for a team</p>
      </header>

      {/* ------------------------------------------------------------------- */}
      {/* Conditional Alerts - Only shown when success or error is set */}
      {/* ------------------------------------------------------------------- */}

      {/* Success Message - shown after successful save */}
      {/* The && is "short-circuit evaluation": if success is false, nothing renders */}
      {success && (
        <div className="alert alert-success">
          ✅ Scouting data saved successfully!
        </div>
      )}

      {/* Error Message - shown when there's a validation or save error */}
      {error && (
        <div className="alert alert-error">
          ❌ {error}
        </div>
      )}

      {/* ------------------------------------------------------------------- */}
      {/* SCOUTING FORM - Main form element */}
      {/* ------------------------------------------------------------------- */}
      {/* onSubmit calls handleSubmit when form is submitted */}
      <form onSubmit={handleSubmit} className="scouting-form">

        {/* =============================================================== */}
        {/* SECTION 1: Event Selection */}
        {/* =============================================================== */}
        <div className="content-card form-section">
          <h3>🏆 Event Selection</h3>
          <div className="form-grid">
            {/* --- Year Dropdown --- */}
            <div className="form-group">
              <label htmlFor="year">Year</label>
              <select
                id="year"
                value={selectedYear}
                onChange={(e) => handleYearChange(parseInt(e.target.value))}
              >
                {[...Array(5)].map((_, i) => {
                  const year = currentYear - i;
                  return <option key={year} value={year}>{year}</option>;
                })}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2', position: 'relative' }}>
              <label htmlFor="eventSearch">Event * (type to search)</label>
              <div style={{ position: 'relative' }}>
                <input
                  ref={eventSearchRef}
                  type="text"
                  id="eventSearch"
                  value={eventSearchQuery}
                  onChange={(e) => {
                    setEventSearchQuery(e.target.value);
                    setShowEventDropdown(true);
                    // Clear selection if user is typing something different
                    if (selectedEvent) {
                      const currentEvent = events.find(ev => ev.key === selectedEvent);
                      if (currentEvent && e.target.value !== currentEvent.name) {
                        setSelectedEvent('');
                        localStorage.removeItem(STORAGE_KEY_EVENT);
                      }
                    }
                  }}
                  onFocus={() => setShowEventDropdown(true)}
                  placeholder={loadingEvents ? 'Loading events...' : 'Search for an event...'}
                  disabled={loadingEvents}
                  autoComplete="off"
                  style={{
                    paddingRight: selectedEvent ? '2.5rem' : '1rem',
                    borderColor: selectedEvent ? 'var(--primary-color)' : undefined
                  }}
                />
                {selectedEvent && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedEvent('');
                      setEventSearchQuery('');
                      localStorage.removeItem(STORAGE_KEY_EVENT);
                      eventSearchRef.current?.focus();
                    }}
                    style={{
                      position: 'absolute',
                      right: '0.5rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '1.2rem',
                      color: 'var(--text-muted)',
                      padding: '0.25rem'
                    }}
                    title="Clear selection"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Searchable Dropdown */}
              {showEventDropdown && !loadingEvents && (
                <div
                  ref={dropdownRef}
                  className="event-dropdown"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    maxHeight: '250px',
                    overflowY: 'auto',
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '0.5rem',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 100,
                    marginTop: '0.25rem'
                  }}
                >
                  {filteredEvents.length === 0 ? (
                    <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      {eventSearchQuery ? 'No events found' : 'No events available'}
                    </div>
                  ) : (
                    filteredEvents.slice(0, 50).map(event => (
                      <div
                        key={event.key}
                        onClick={() => handleEventChange(event.key)}
                        style={{
                          padding: '0.75rem 1rem',
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--border-color)',
                          background: selectedEvent === event.key ? 'var(--primary-color-light, rgba(233, 30, 99, 0.1))' : 'transparent',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hover-bg, rgba(0,0,0,0.05))'}
                        onMouseLeave={(e) => e.currentTarget.style.background = selectedEvent === event.key ? 'var(--primary-color-light, rgba(233, 30, 99, 0.1))' : 'transparent'}
                      >
                        <div style={{ fontWeight: 500 }}>{event.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {event.city && event.state_prov ? `${event.city}, ${event.state_prov} • ` : ''}
                          {event.start_date} • {event.key}
                        </div>
                      </div>
                    ))
                  )}
                  {filteredEvents.length > 50 && (
                    <div style={{ padding: '0.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      Showing 50 of {filteredEvents.length} results. Type more to narrow down.
                    </div>
                  )}
                </div>
              )}

              {selectedEvent && selectedEventName && (
                <div className="event-badge" style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--primary-color)' }}>
                  ✓ Selected: <strong>{selectedEventName}</strong> ({selectedEvent})
                </div>
              )}
            </div>
          </div>
        </div>

        {/* =============================================================== */}
        {/* SECTION 2: Match Information */}
        {/* =============================================================== */}
        {/* Basic info about which team/match is being scouted */}
        <div className="content-card form-section">
          <h3>Match Information</h3>
          <div className="form-grid">
            {/* --- Team Number Input --- */}
            {/* "required" makes the browser enforce this field is filled */}
            <div className="form-group">
              <label htmlFor="teamNumber">Team Number *</label>
              <input
                type="number"
                id="teamNumber"
                name="teamNumber"
                value={formData.teamNumber}
                onChange={handleChange}
                required
                placeholder="e.g., 1551"
                min="1"
                max="99999"
              />
            </div>

            {/* --- Match Number Input --- */}
            <div className="form-group">
              <label htmlFor="matchNumber">Match Number</label>
              <input
                type="number"
                id="matchNumber"
                name="matchNumber"
                value={formData.matchNumber}
                onChange={handleChange}
                placeholder="e.g., 1"
                min="1"
              />
            </div>

            {/* --- Alliance Color Toggle Buttons --- */}
            {/* Instead of a dropdown, we use styled buttons for quick selection */}
            {/* Template literal in className: adds 'active' class if this color is selected */}
            <div className="form-group">
              <label>Alliance Color</label>
              <div className="alliance-toggle">
                <button
                  type="button"
                  className={`alliance-btn red ${formData.allianceColor === 'red' ? 'active' : ''}`}
                  onClick={() => setFormData(prev => ({ ...prev, allianceColor: 'red' }))}
                >
                  Red
                </button>
                <button
                  type="button"
                  className={`alliance-btn blue ${formData.allianceColor === 'blue' ? 'active' : ''}`}
                  onClick={() => setFormData(prev => ({ ...prev, allianceColor: 'blue' }))}
                >
                  Blue
                </button>
              </div>
            </div>

            {/* --- Alliance Position (for TBA auto-fill) --- */}
            <div className="form-group">
              <label>
                Position in Alliance
                {autoFillTeamNumber && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--primary-color)', marginLeft: '0.5rem' }}>
                    → Team {autoFillTeamNumber}
                  </span>
                )}
              </label>
              <div className="alliance-toggle" style={{ maxWidth: '200px' }}>
                {[1, 2, 3].map(pos => (
                  <button
                    key={pos}
                    type="button"
                    className={`alliance-btn ${alliancePosition === pos ? 'active' : ''}`}
                    onClick={() => {
                      setAlliancePosition(pos);
                      // Clear team number when changing position to allow auto-fill
                      setFormData(prev => ({ ...prev, teamNumber: '' }));
                    }}
                    style={{
                      background: alliancePosition === pos
                        ? (formData.allianceColor === 'red' ? 'var(--error-color)' : 'var(--primary-color)')
                        : 'var(--bg-secondary)',
                      color: alliancePosition === pos ? 'white' : 'inherit',
                      flex: 1,
                      padding: '0.5rem'
                    }}
                  >
                    {pos}
                  </button>
                ))}
              </div>
              {loadingMatches && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                  Loading match schedule...
                </span>
              )}
              {!loadingMatches && eventMatches.length > 0 && (
                <span style={{ fontSize: '0.75rem', color: 'var(--success-color)', marginTop: '0.25rem', display: 'block' }}>
                  ✓ {eventMatches.length} matches loaded for auto-fill
                </span>
              )}
            </div>

            {/* --- Starting Position Dropdown --- */}
            {/* Where the robot starts on the field - used for autonomous analysis */}
            <div className="form-group">
              <label htmlFor="startingPosition">📍 Starting Position</label>
              <select
                id="startingPosition"
                name="startingPosition"
                value={formData.startingPosition}
                onChange={handleChange}
              >
                <option value="">Select position...</option>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
          </div>
        </div>

        {/* =============================================================== */}
        {/* SECTION 3: Auto Period (First 20 seconds - autonomous) */}
        {/* =============================================================== */}
        {/* Robots run pre-programmed routines without driver control */}
        <div className="content-card form-section">
          <h3>🤖 Auto Period <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>(20 sec)</span></h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Fuel scored in auto determines which Hub goes inactive first in Teleop
          </p>

          <div className="form-grid">
            {/* Auto Fuel Scored */}
            <div className="form-group counter-group">
              <label>⚽ Auto Fuel Scored (1 pt each)</label>
              <div className="counter">
                <button type="button" onClick={() => handleIncrement('autoFuelScored', -1)}>−</button>
                <span>{formData.autoFuelScored}</span>
                <button type="button" onClick={() => handleIncrement('autoFuelScored', 1)}>+</button>
              </div>
            </div>

            {/* Auto Cycles Completed */}
            <div className="form-group counter-group">
              <label>🔄 Auto Cycles Completed</label>
              <div className="counter">
                <button type="button" onClick={() => handleIncrement('autoCyclesCompleted', -1)}>−</button>
                <span>{formData.autoCyclesCompleted}</span>
                <button type="button" onClick={() => handleIncrement('autoCyclesCompleted', 1)}>+</button>
              </div>
            </div>

            {/* Tower Climb in Auto */}
            <div className="form-group">
              <label htmlFor="autoTowerClimb">🗼 Tower Climb (Auto)</label>
              <select
                id="autoTowerClimb"
                name="autoTowerClimb"
                value={formData.autoTowerClimb}
                onChange={handleChange}
              >
                <option value="none">None</option>
                <option value="level1">Level 1 - Off Carpet (10 pts, 2 max)</option>
              </select>
            </div>

            {/* Team Won Auto - Large prominent toggle */}
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                🏆 Team Won Auto?
              </label>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, hubControlFirst: !prev.hubControlFirst }))}
                style={{
                  width: '100%',
                  padding: '1.25rem 1.5rem',
                  fontSize: '1.25rem',
                  fontWeight: 'bold',
                  borderRadius: '12px',
                  border: '3px solid',
                  borderColor: formData.hubControlFirst ? '#43a047' : 'var(--border-color)',
                  background: formData.hubControlFirst
                    ? 'linear-gradient(135deg, #43a047, #66bb6a)'
                    : 'var(--bg-secondary)',
                  color: formData.hubControlFirst ? '#fff' : 'var(--text-color)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: formData.hubControlFirst ? '0 4px 12px rgba(67, 160, 71, 0.4)' : 'none'
                }}
              >
                {formData.hubControlFirst ? '✅ YES - Won Auto!' : '❌ NO - Did Not Win Auto'}
              </button>
            </div>
          </div>
        </div>

        {/* =============================================================== */}
        {/* SECTION 4: Teleop Period (2:20 - driver-controlled) */}
        {/* =============================================================== */}
        {/* Drivers control robots. "Alliance Shifts" change which Hub is active */}
        <div className="content-card form-section">
          <h3>🎮 Teleop Period <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>(2:20)</span></h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Alliance Shifts alternate which Hub is active. Only active Hub scores count!
          </p>

          <div className="form-grid">
            {/* --- Active Hub Scoring Counter --- */}
            {/* These are the +/- buttons pattern used throughout the form */}
            {/* handleIncrement('fieldName', delta) adds delta to the field value */}
            <div className="form-group counter-group">
              <label>⚽ Fuel in Active Hub (1 pt each)</label>
              <div className="counter">
                <button type="button" onClick={() => handleIncrement('teleopFuelActive', -1)}>−</button>
                <span>{formData.teleopFuelActive}</span>
                <button type="button" onClick={() => handleIncrement('teleopFuelActive', 1)}>+</button>
              </div>
            </div>

            {/* --- Inactive Hub Scoring (tracked but no points) --- */}
            <div className="form-group counter-group">
              <label>🚫 Fuel in Inactive Hub (0 pts)</label>
              <div className="counter">
                <button type="button" onClick={() => handleIncrement('teleopFuelInactive', -1)}>−</button>
                <span>{formData.teleopFuelInactive}</span>
                <button type="button" onClick={() => handleIncrement('teleopFuelInactive', 1)}>+</button>
              </div>
            </div>

            {/* --- Balls Cycled Counter --- */}
            <div className="form-group counter-group">
              <label>🔄 Balls Cycled (shooting to your side)</label>
              <div className="counter">
                <button type="button" onClick={() => handleIncrement('teleopBallsCycled', -1)}>−</button>
                <span>{formData.teleopBallsCycled}</span>
                <button type="button" onClick={() => handleIncrement('teleopBallsCycled', 1)}>+</button>
              </div>
            </div>
          </div>
        </div>

        {/* =============================================================== */}
        {/* SECTION 5: Endgame (Final 30 seconds) */}
        {/* =============================================================== */}
        {/* Tower climbing for big bonus points */}
        <div className="content-card form-section">
          <h3>🏁 Endgame <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>(Final 30 sec - All Hubs Active)</span></h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Tower climb for big points. All Hubs are active for fuel scoring.
          </p>

          <div className="form-grid">
            {/* --- Tower Climb Level Dropdown --- */}
            <div className="form-group">
              <label htmlFor="endgameTowerLevel">🗼 Tower Climb Level</label>
              <select
                id="endgameTowerLevel"
                name="endgameTowerLevel"
                value={formData.endgameTowerLevel}
                onChange={handleChange}
              >
                <option value="none">None (0 pts)</option>
                <option value="level1">Level 1 - Off Carpet (15 pts)</option>
                <option value="level2">Level 2 - Above Low Rung (20 pts)</option>
                <option value="level3">Level 3 - Above Mid Rung (30 pts)</option>
              </select>
            </div>

            {/* --- Endgame Fuel Counter --- */}
            <div className="form-group counter-group">
              <label>⚽ Fuel Scored (Endgame)</label>
              <div className="counter">
                <button type="button" onClick={() => handleIncrement('endgameFuelScored', -1)}>−</button>
                <span>{formData.endgameFuelScored}</span>
                <button type="button" onClick={() => handleIncrement('endgameFuelScored', 1)}>+</button>
              </div>
            </div>
          </div>
        </div>

        {/* =============================================================== */}
        {/* SECTION 6: Robot Role Selection */}
        {/* =============================================================== */}
        {/* Used for categorizing teams in Recommended Alliance feature */}
        <div className="content-card form-section">
          <h3>🎯 Robot Role</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Select the primary role this robot played during the match (required for predictions)
          </p>
          <div className="form-group">
            {/* --- Role Toggle Buttons --- */}
            {/* Each button has conditional styling based on whether it's selected */}
            {/* Using inline styles with ternary operators for dynamic styling */}
            <div className="role-toggle" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {/* Shooter Role Button */}
              <button
                type="button"
                className={`role-btn ${formData.robotRole === 'shooter' ? 'active' : ''}`}
                onClick={() => setFormData(prev => ({ ...prev, robotRole: 'shooter' }))}
                style={{
                  flex: '1',
                  minWidth: '100px',
                  padding: '0.75rem 1rem',
                  border: formData.robotRole === 'shooter' ? '2px solid #e91e63' : '2px solid var(--border-color)',
                  borderRadius: '0.5rem',
                  background: formData.robotRole === 'shooter' ? 'rgba(233, 30, 99, 0.1)' : 'var(--card-bg)',
                  color: formData.robotRole === 'shooter' ? '#e91e63' : 'var(--text-color)',
                  cursor: 'pointer',
                  fontWeight: formData.robotRole === 'shooter' ? '600' : '400',
                  transition: 'all 0.2s'
                }}
              >
                🎯 Shooter
              </button>

              {/* Cycler Role Button */}
              <button
                type="button"
                className={`role-btn ${formData.robotRole === 'cycler' ? 'active' : ''}`}
                onClick={() => setFormData(prev => ({ ...prev, robotRole: 'cycler' }))}
                style={{
                  flex: '1',
                  minWidth: '100px',
                  padding: '0.75rem 1rem',
                  border: formData.robotRole === 'cycler' ? '2px solid #4CAF50' : '2px solid var(--border-color)',
                  borderRadius: '0.5rem',
                  background: formData.robotRole === 'cycler' ? 'rgba(76, 175, 80, 0.1)' : 'var(--card-bg)',
                  color: formData.robotRole === 'cycler' ? '#4CAF50' : 'var(--text-color)',
                  cursor: 'pointer',
                  fontWeight: formData.robotRole === 'cycler' ? '600' : '400',
                  transition: 'all 0.2s'
                }}
              >
                🔄 Cycler
              </button>

              {/* Defense Role Button */}
              <button
                type="button"
                className={`role-btn ${formData.robotRole === 'defense' ? 'active' : ''}`}
                onClick={() => setFormData(prev => ({ ...prev, robotRole: 'defense' }))}
                style={{
                  flex: '1',
                  minWidth: '100px',
                  padding: '0.75rem 1rem',
                  border: formData.robotRole === 'defense' ? '2px solid #2196F3' : '2px solid var(--border-color)',
                  borderRadius: '0.5rem',
                  background: formData.robotRole === 'defense' ? 'rgba(33, 150, 243, 0.1)' : 'var(--card-bg)',
                  color: formData.robotRole === 'defense' ? '#2196F3' : 'var(--text-color)',
                  cursor: 'pointer',
                  fontWeight: formData.robotRole === 'defense' ? '600' : '400',
                  transition: 'all 0.2s'
                }}
              >
                🛡️ Defense
              </button>
            </div>
          </div>
        </div>

        {/* =============================================================== */}
        {/* SECTION 7: Notes */}
        {/* =============================================================== */}
        {/* Free-form text area for qualitative observations */}
        <div className="content-card form-section">
          <h3>📝 Notes</h3>
          <div className="form-group">
            {/* Textarea for multi-line text input */}
            {/* rows={4} sets the visible height (4 lines) */}
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Any observations about the team's performance..."
              rows={4}
            />
          </div>
        </div>

        {/* =============================================================== */}
        {/* SUBMIT BUTTON */}
        {/* =============================================================== */}
        {/* disabled={submitting} prevents double-submission */}
        {/* Button text changes to "Saving..." while submitting */}
        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary btn-large"
            disabled={submitting}
          >
            {/* Ternary: show different text based on submitting state */}
            {submitting ? 'Saving...' : '💾 Save Scouting Data'}
          </button>
        </div>
      </form>
    </>
  );
}

// =============================================================================
// END OF FILE
// =============================================================================

