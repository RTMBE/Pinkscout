/**
 * =============================================================================
 * SCOUTING.JSX - Match Scouting Form
 * =============================================================================
 * 
 * WHAT IS THIS PAGE?
 * The main scouting form for recording match data:
 * - Team and match info
 * - Auto period scoring
 * - Teleop period scoring
 * - Endgame actions
 * - Notes and observations
 * 
 * FORM FIELDS (2024 Crescendo):
 * - Team Number, Match Number, Event Key
 * - Alliance Color (Red/Blue)
 * - Auto: Speaker, Amp, Mobility
 * - Teleop: Speaker, Amp, Amplified
 * - Endgame: Climb, Trap, Harmony
 * - Notes
 * 
 * =============================================================================
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { saveScoutingData } from '../services/scoutingService';
import { getEventList } from '../services/blueAllianceAPI';
import { useAuth } from '../contexts/AuthContext';

// LocalStorage keys for persisting event selection
const STORAGE_KEY_YEAR = 'pinkscout_scouting_year';
const STORAGE_KEY_EVENT = 'pinkscout_scouting_event';

export default function Scouting() {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();

  // ==========================================================================
  // EVENT SELECTION STATE
  // ==========================================================================

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_YEAR);
    return saved ? parseInt(saved) : currentYear;
  });
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_EVENT) || '';
  });
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Searchable event state
  const [eventSearchQuery, setEventSearchQuery] = useState('');
  const [showEventDropdown, setShowEventDropdown] = useState(false);
  const eventSearchRef = useRef(null);
  const dropdownRef = useRef(null);

  // ==========================================================================
  // FORM STATE
  // ==========================================================================

  const [formData, setFormData] = useState({
    // Match Info
    teamNumber: '',
    matchNumber: '',
    allianceColor: 'red',

    // Auto Period
    autoSpeaker: 0,
    autoAmp: 0,
    autoMobility: false,

    // Teleop Period
    teleopSpeaker: 0,
    teleopAmp: 0,
    amplifiedScored: 0,

    // Endgame
    climbStatus: 'none',
    trapScored: false,
    harmony: false,

    // Notes
    notes: ''
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // ==========================================================================
  // LOAD EVENTS WHEN YEAR CHANGES
  // ==========================================================================

  useEffect(() => {
    loadEvents();
  }, [selectedYear]);

  const loadEvents = async () => {
    setLoadingEvents(true);
    try {
      const eventList = await getEventList(selectedYear);
      setEvents(eventList);

      // If saved event is not in the list, clear it
      if (selectedEvent && !eventList.find(e => e.key === selectedEvent)) {
        setSelectedEvent('');
        localStorage.removeItem(STORAGE_KEY_EVENT);
      }
    } catch (err) {
      console.error('Error loading events:', err);
      setEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  };

  // ==========================================================================
  // PERSIST SELECTIONS TO LOCALSTORAGE
  // ==========================================================================

  const handleYearChange = (year) => {
    setSelectedYear(year);
    localStorage.setItem(STORAGE_KEY_YEAR, year.toString());
    // Clear event when year changes
    setSelectedEvent('');
    setEventSearchQuery('');
    localStorage.removeItem(STORAGE_KEY_EVENT);
  };

  const handleEventChange = (eventKey) => {
    setSelectedEvent(eventKey);
    setShowEventDropdown(false);
    if (eventKey) {
      localStorage.setItem(STORAGE_KEY_EVENT, eventKey);
      // Set search query to event name for display
      const event = events.find(e => e.key === eventKey);
      if (event) {
        setEventSearchQuery(event.name);
      }
    } else {
      setEventSearchQuery('');
      localStorage.removeItem(STORAGE_KEY_EVENT);
    }
  };

  // Get event name for display
  const selectedEventName = events.find(e => e.key === selectedEvent)?.name || '';

  // Filter events based on search query
  const filteredEvents = useMemo(() => {
    if (!eventSearchQuery.trim()) return events;
    const query = eventSearchQuery.toLowerCase();
    return events.filter(event =>
      event.name.toLowerCase().includes(query) ||
      event.key.toLowerCase().includes(query) ||
      (event.city && event.city.toLowerCase().includes(query)) ||
      (event.state_prov && event.state_prov.toLowerCase().includes(query))
    );
  }, [events, eventSearchQuery]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          eventSearchRef.current && !eventSearchRef.current.contains(e.target)) {
        setShowEventDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initialize search query from saved event
  useEffect(() => {
    if (selectedEvent && events.length > 0) {
      const event = events.find(e => e.key === selectedEvent);
      if (event) {
        setEventSearchQuery(event.name);
      }
    }
  }, [selectedEvent, events]);

  // ==========================================================================
  // FORM HANDLERS
  // ==========================================================================
  
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : 
              type === 'number' ? parseInt(value) || 0 : value
    }));
  };

  const handleIncrement = (field, delta) => {
    setFormData(prev => ({
      ...prev,
      [field]: Math.max(0, (prev[field] || 0) + delta)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      // Validate required fields
      if (!formData.teamNumber) {
        throw new Error('Team number is required');
      }
      if (!selectedEvent) {
        throw new Error('Please select an event');
      }

      // Add scouter info and event key
      const dataToSave = {
        ...formData,
        teamNumber: parseInt(formData.teamNumber),
        matchNumber: parseInt(formData.matchNumber) || null,
        eventKey: selectedEvent,
        eventYear: selectedYear,
        scouterName: userProfile?.displayName || user?.displayName || user?.email,
        scouterUid: user?.uid
      };

      await saveScoutingData(dataToSave);
      setSuccess(true);

      // Reset form after short delay (keep event selection)
      setTimeout(() => {
        setFormData({
          teamNumber: '',
          matchNumber: '',
          allianceColor: 'red',
          autoSpeaker: 0,
          autoAmp: 0,
          autoMobility: false,
          teleopSpeaker: 0,
          teleopAmp: 0,
          amplifiedScored: 0,
          climbStatus: 'none',
          trapScored: false,
          harmony: false,
          notes: ''
        });
        setSuccess(false);
      }, 2000);

    } catch (err) {
      console.error('Error saving scouting data:', err);
      setError(err.message || 'Failed to save data. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  
  return (
    <>
      <Helmet>
        <title>Scout Match - PinkScout</title>
        <meta name="description" content="Record match scouting data" />
      </Helmet>

      {/* Page Header */}
      <header className="page-header">
        <h1>📝 Scout a Match</h1>
        <p>Record match data for a team</p>
      </header>

      {/* Success Message */}
      {success && (
        <div className="alert alert-success">
          ✅ Scouting data saved successfully!
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="alert alert-error">
          ❌ {error}
        </div>
      )}

      {/* Scouting Form */}
      <form onSubmit={handleSubmit} className="scouting-form">
        {/* Event Selection Section */}
        <div className="content-card form-section">
          <h3>🏆 Event Selection</h3>
          <div className="form-grid">
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

        {/* Match Info Section */}
        <div className="content-card form-section">
          <h3>Match Information</h3>
          <div className="form-grid">
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
          </div>
        </div>

        {/* Auto Period Section */}
        <div className="content-card form-section">
          <h3>🤖 Auto Period</h3>
          <div className="form-grid">
            <div className="form-group counter-group">
              <label>Speaker (5 pts each)</label>
              <div className="counter">
                <button type="button" onClick={() => handleIncrement('autoSpeaker', -1)}>−</button>
                <span>{formData.autoSpeaker}</span>
                <button type="button" onClick={() => handleIncrement('autoSpeaker', 1)}>+</button>
              </div>
            </div>
            <div className="form-group counter-group">
              <label>Amp (2 pts each)</label>
              <div className="counter">
                <button type="button" onClick={() => handleIncrement('autoAmp', -1)}>−</button>
                <span>{formData.autoAmp}</span>
                <button type="button" onClick={() => handleIncrement('autoAmp', 1)}>+</button>
              </div>
            </div>
            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  name="autoMobility"
                  checked={formData.autoMobility}
                  onChange={handleChange}
                />
                Left Starting Zone (2 pts)
              </label>
            </div>
          </div>
        </div>

        {/* Teleop Period Section */}
        <div className="content-card form-section">
          <h3>🎮 Teleop Period</h3>
          <div className="form-grid">
            <div className="form-group counter-group">
              <label>Speaker (2 pts each)</label>
              <div className="counter">
                <button type="button" onClick={() => handleIncrement('teleopSpeaker', -1)}>−</button>
                <span>{formData.teleopSpeaker}</span>
                <button type="button" onClick={() => handleIncrement('teleopSpeaker', 1)}>+</button>
              </div>
            </div>
            <div className="form-group counter-group">
              <label>Amp (1 pt each)</label>
              <div className="counter">
                <button type="button" onClick={() => handleIncrement('teleopAmp', -1)}>−</button>
                <span>{formData.teleopAmp}</span>
                <button type="button" onClick={() => handleIncrement('teleopAmp', 1)}>+</button>
              </div>
            </div>
            <div className="form-group counter-group">
              <label>Amplified Speaker (5 pts each)</label>
              <div className="counter">
                <button type="button" onClick={() => handleIncrement('amplifiedScored', -1)}>−</button>
                <span>{formData.amplifiedScored}</span>
                <button type="button" onClick={() => handleIncrement('amplifiedScored', 1)}>+</button>
              </div>
            </div>
          </div>
        </div>

        {/* Endgame Section */}
        <div className="content-card form-section">
          <h3>🏁 Endgame</h3>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="climbStatus">Climb Status</label>
              <select
                id="climbStatus"
                name="climbStatus"
                value={formData.climbStatus}
                onChange={handleChange}
              >
                <option value="none">None</option>
                <option value="parked">Parked (1 pt)</option>
                <option value="onstage">Onstage (3 pts)</option>
                <option value="spotlit">Spotlit (4 pts)</option>
              </select>
            </div>
            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  name="trapScored"
                  checked={formData.trapScored}
                  onChange={handleChange}
                />
                Trap Scored (5 pts)
              </label>
            </div>
            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  name="harmony"
                  checked={formData.harmony}
                  onChange={handleChange}
                />
                Harmony (2 pts)
              </label>
            </div>
          </div>
        </div>

        {/* Notes Section */}
        <div className="content-card form-section">
          <h3>📝 Notes</h3>
          <div className="form-group">
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Any observations about the team's performance..."
              rows={4}
            />
          </div>
        </div>

        {/* Submit Button */}
        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary btn-large"
            disabled={submitting}
          >
            {submitting ? 'Saving...' : '💾 Save Scouting Data'}
          </button>
        </div>
      </form>
    </>
  );
}

