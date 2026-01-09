/**
 * =============================================================================
 * EVENTS.JSX - Event Browser Page
 * =============================================================================
 * 
 * WHAT IS THIS PAGE?
 * Browse FRC events and view their details:
 * - List events for the current year
 * - View teams at an event
 * - View match schedule
 * - See team EPA rankings at event
 * 
 * DATA SOURCES:
 * - The Blue Alliance API for event data
 * - Statbotics API for team EPA at events
 * 
 * =============================================================================
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { getEventList, getEventTeams, getEventMatches } from '../services/blueAllianceAPI';
import { getEventTeamStats } from '../services/statboticsAPI';
import { classifyEPA } from '../utils/epaUtils';

export default function Events() {
  // ==========================================================================
  // STATE
  // ==========================================================================
  
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventTeams, setEventTeams] = useState([]);
  const [eventMatches, setEventMatches] = useState([]);
  const [teamStats, setTeamStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // ==========================================================================
  // LOAD EVENTS ON MOUNT/YEAR CHANGE
  // ==========================================================================
  
  useEffect(() => {
    loadEvents();
  }, [year]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const eventList = await getEventList(year);
      setEvents(eventList);
    } catch (err) {
      console.error('Error loading events:', err);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // LOAD EVENT DETAILS
  // ==========================================================================
  
  const selectEvent = async (event) => {
    setSelectedEvent(event);
    setLoadingDetails(true);
    
    try {
      const [teams, matches, stats] = await Promise.all([
        getEventTeams(event.key),
        getEventMatches(event.key),
        getEventTeamStats(event.key)
      ]);
      
      setEventTeams(teams);
      setEventMatches(matches);
      setTeamStats(stats);
    } catch (err) {
      console.error('Error loading event details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  // ==========================================================================
  // FILTER EVENTS
  // ==========================================================================
  
  const filteredEvents = events.filter(event => {
    const term = searchTerm.toLowerCase();
    return (
      event.name.toLowerCase().includes(term) ||
      event.key.toLowerCase().includes(term) ||
      (event.city || '').toLowerCase().includes(term) ||
      (event.state_prov || '').toLowerCase().includes(term)
    );
  });

  // ==========================================================================
  // RENDER
  // ==========================================================================
  
  return (
    <>
      <Helmet>
        <title>Events - PinkScout</title>
        <meta name="description" content="Browse FRC events and view team rankings" />
      </Helmet>

      {/* Page Header */}
      <header className="page-header">
        <h1>🏆 Events</h1>
        <p>Browse FRC events and view team rankings</p>
      </header>

      {/* Year Selector and Search */}
      <div className="content-card">
        <div className="events-controls">
          <div className="year-selector">
            <label htmlFor="year">Year:</label>
            <select 
              id="year" 
              value={year} 
              onChange={(e) => setYear(parseInt(e.target.value))}
            >
              {[...Array(10)].map((_, i) => (
                <option key={currentYear - i} value={currentYear - i}>
                  {currentYear - i}
                </option>
              ))}
            </select>
          </div>
          <input
            type="text"
            placeholder="Search events..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="events-layout">
        {/* Event List */}
        <div className="content-card events-list-card">
          <h3>Events ({filteredEvents.length})</h3>
          
          {loading ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
            </div>
          ) : (
            <div className="events-list">
              {filteredEvents.map(event => (
                <div
                  key={event.key}
                  className={`event-item ${selectedEvent?.key === event.key ? 'selected' : ''}`}
                  onClick={() => selectEvent(event)}
                >
                  <div className="event-name">{event.name}</div>
                  <div className="event-meta">
                    📍 {event.city}, {event.state_prov} • 📅 {event.start_date}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Event Details */}
        <div className="content-card event-details-card">
          {!selectedEvent ? (
            <div className="empty-state">
              <p>Select an event to view details</p>
            </div>
          ) : loadingDetails ? (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p>Loading event details...</p>
            </div>
          ) : (
            <>
              <h3>{selectedEvent.name}</h3>
              <p className="event-info">
                📍 {selectedEvent.city}, {selectedEvent.state_prov} •
                📅 {selectedEvent.start_date} to {selectedEvent.end_date}
              </p>

              {/* Teams Tab */}
              <div className="event-section">
                <h4>Teams ({eventTeams.length})</h4>
                <div className="teams-grid">
                  {teamStats
                    .sort((a, b) => (b.epa_percentile || 0) - (a.epa_percentile || 0))
                    .slice(0, 20)
                    .map(team => {
                      const classification = classifyEPA(team.epa_percentile || 50);
                      return (
                        <Link
                          key={team.team_number}
                          to={`/teams?team=${team.team_number}`}
                          className="team-chip"
                          style={{ borderColor: classification.color }}
                        >
                          <span className="team-chip-number">{team.team_number}</span>
                          <span className="team-chip-emoji">{classification.emoji}</span>
                        </Link>
                      );
                    })}
                </div>
                {teamStats.length > 20 && (
                  <p className="more-text">+{teamStats.length - 20} more teams</p>
                )}
              </div>

              {/* Matches Preview */}
              <div className="event-section">
                <h4>Matches ({eventMatches.length})</h4>
                {eventMatches.length === 0 ? (
                  <p>No matches scheduled yet.</p>
                ) : (
                  <div className="matches-preview">
                    {eventMatches.slice(0, 5).map(match => (
                      <div key={match.key} className="match-item">
                        <span className="match-label">
                          {match.comp_level.toUpperCase()} {match.match_number}
                        </span>
                        <span className="match-alliances">
                          <span className="red-alliance">
                            {match.alliances?.red?.team_keys?.map(t => t.replace('frc', '')).join(', ')}
                          </span>
                          <span className="vs">vs</span>
                          <span className="blue-alliance">
                            {match.alliances?.blue?.team_keys?.map(t => t.replace('frc', '')).join(', ')}
                          </span>
                        </span>
                      </div>
                    ))}
                    {eventMatches.length > 5 && (
                      <p className="more-text">+{eventMatches.length - 5} more matches</p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

