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
 * FORM FIELDS (2026 REBUILT™):
 * - Team Number, Match Number, Event Key
 * - Alliance Color (Red/Blue)
 * - Auto: Fuel scored, Tower climb
 * - Teleop: Fuel scored (active Hub), cycle tracking
 * - Endgame: Tower climb level (L1=15pts, L3=30pts)
 * - Notes
 *
 * SCORING (2026 REBUILT™):
 * - Fuel in active Hub: 1 pt each
 * - Tower Level 1 (off carpet): 15 pts
 * - Tower Level 3 (above mid rung): 30 pts
 * - Bonus RPs: Energized, Supercharged, Traversal
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
  const { user, userProfile, roleContext } = useAuth();

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

    // Auto Period (2026 REBUILT™) - 20 seconds
    autoFuelScored: 0,          // Fuel scored in active Hub (1 pt each)
    autoTowerClimb: 'none',     // Tower climb in auto (none, level1, level3)

    // Teleop Period (2026 REBUILT™) - 2:20 with Alliance Shifts
    teleopFuelActive: 0,        // Fuel scored when Hub active (1 pt each)
    teleopFuelInactive: 0,      // Fuel scored when Hub inactive (0 pts, but track for strategy)
    teleopCycleCount: 0,        // Number of complete cycles (collect + score)

    // Endgame - Tower Climb (final 30 seconds)
    endgameTowerLevel: 'none',  // none, level1 (15pts), level2 (RP only), level3 (30pts)

    // Performance Notes
    hubControlFirst: false,     // Did this alliance control Hub first in auto?
    defenseRating: 0,           // 0-5 rating for defense played
    robotRole: '',              // Robot role: shooter, cycler, or defense
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

      // Check for either scoutingId (legacy) OR teamLeadUid (new team system)
      if (!roleContext?.scoutingId && !roleContext?.teamLeadUid) {
        throw new Error('Your account is not linked to a team. Please update your profile or join a team.');
      }

      // Add scouter info, event key, and isolation IDs
      const dataToSave = {
        ...formData,
        teamNumber: parseInt(formData.teamNumber),
        matchNumber: parseInt(formData.matchNumber) || 0,
        eventKey: selectedEvent,
        eventYear: selectedYear,
        scouterName: userProfile?.displayName || user?.displayName || user?.email,
        scouterUid: user?.uid
      };

      // Include scoutingId if available (legacy system)
      if (roleContext.scoutingId) {
        dataToSave.scoutingId = roleContext.scoutingId;
      }

      // Include teamLeadUid if available (new team system)
      if (roleContext.teamLeadUid) {
        dataToSave.teamLeadUid = roleContext.teamLeadUid;
      }

      await saveScoutingData(dataToSave);
      setSuccess(true);

      // Reset form after short delay (keep event selection)
      setTimeout(() => {
        setFormData({
          teamNumber: '',
          matchNumber: '',
          allianceColor: 'red',
          autoFuelScored: 0,
          autoTowerClimb: 'none',
          teleopFuelActive: 0,
          teleopFuelInactive: 0,
          teleopCycleCount: 0,
          endgameTowerLevel: 'none',
          hubControlFirst: false,
          defenseRating: 0,
          robotRole: '',
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

        {/* Auto Period Section (20 seconds) */}
        <div className="content-card form-section">
          <h3>🤖 Auto Period <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>(20 sec)</span></h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Fuel scored in auto determines which Hub goes inactive first in Teleop
          </p>

          <div className="form-grid">
            {/* Fuel Scored */}
            <div className="form-group counter-group">
              <label>⚽ Fuel Scored (1 pt each)</label>
              <div className="counter">
                <button type="button" onClick={() => handleIncrement('autoFuelScored', -1)}>−</button>
                <span>{formData.autoFuelScored}</span>
                <button type="button" onClick={() => handleIncrement('autoFuelScored', 1)}>+</button>
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
                <option value="level1">Level 1 - Off Carpet (15 pts)</option>
                <option value="level3">Level 3 - Above Mid Rung (30 pts)</option>
              </select>
            </div>

            {/* Hub Control */}
            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  name="hubControlFirst"
                  checked={formData.hubControlFirst}
                  onChange={handleChange}
                />
                🎯 Alliance controlled Hub first
              </label>
            </div>
          </div>
        </div>

        {/* Teleop Period Section (2:20 with Alliance Shifts) */}
        <div className="content-card form-section">
          <h3>🎮 Teleop Period <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>(2:20)</span></h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Alliance Shifts alternate which Hub is active. Only active Hub scores count!
          </p>

          <div className="form-grid">
            {/* Fuel Scored in Active Hub */}
            <div className="form-group counter-group">
              <label>⚽ Fuel in Active Hub (1 pt each)</label>
              <div className="counter">
                <button type="button" onClick={() => handleIncrement('teleopFuelActive', -1)}>−</button>
                <span>{formData.teleopFuelActive}</span>
                <button type="button" onClick={() => handleIncrement('teleopFuelActive', 1)}>+</button>
              </div>
            </div>

            {/* Fuel Scored in Inactive Hub (for tracking) */}
            <div className="form-group counter-group">
              <label>🚫 Fuel in Inactive Hub (0 pts)</label>
              <div className="counter">
                <button type="button" onClick={() => handleIncrement('teleopFuelInactive', -1)}>−</button>
                <span>{formData.teleopFuelInactive}</span>
                <button type="button" onClick={() => handleIncrement('teleopFuelInactive', 1)}>+</button>
              </div>
            </div>

            {/* Cycle Count */}
            <div className="form-group counter-group">
              <label>🔄 Cycle Count (collect + score)</label>
              <div className="counter">
                <button type="button" onClick={() => handleIncrement('teleopCycleCount', -1)}>−</button>
                <span>{formData.teleopCycleCount}</span>
                <button type="button" onClick={() => handleIncrement('teleopCycleCount', 1)}>+</button>
              </div>
            </div>
          </div>
        </div>

        {/* Endgame Section - Tower Climb */}
        <div className="content-card form-section">
          <h3>🏁 Endgame <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>(Final 30 sec - All Hubs Active)</span></h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Tower climb for big points. Level 2 earns Ranking Points only.
          </p>

          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="endgameTowerLevel">🗼 Tower Climb Level</label>
              <select
                id="endgameTowerLevel"
                name="endgameTowerLevel"
                value={formData.endgameTowerLevel}
                onChange={handleChange}
              >
                <option value="none">None (0 pts)</option>
                <option value="level1">Level 1 - Off Carpet (15 pts, 10 RP)</option>
                <option value="level2">Level 2 - Above Low Rung (0 pts, 20 RP)</option>
                <option value="level3">Level 3 - Above Mid Rung (30 pts)</option>
              </select>
            </div>

            {/* Defense Rating */}
            <div className="form-group">
              <label htmlFor="defenseRating">🛡️ Defense Rating (0-5)</label>
              <select
                id="defenseRating"
                name="defenseRating"
                value={formData.defenseRating}
                onChange={handleChange}
              >
                <option value={0}>0 - No defense played</option>
                <option value={1}>1 - Minimal defense</option>
                <option value={2}>2 - Some defense</option>
                <option value={3}>3 - Moderate defense</option>
                <option value={4}>4 - Strong defense</option>
                <option value={5}>5 - Elite defender</option>
              </select>
            </div>
          </div>
        </div>

        {/* Robot Role Section */}
        <div className="content-card form-section">
          <h3>🎯 Robot Role</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Select the primary role this robot played during the match (required for predictions)
          </p>
          <div className="form-group">
            <div className="role-toggle" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
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

