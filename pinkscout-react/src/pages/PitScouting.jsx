/**
 * =============================================================================
 * PIT SCOUTING PAGE - Pre-event robot capability collection
 * =============================================================================
 * 
 * PURPOSE:
 * Collect robot configuration data before matches begin.
 * This data helps with alliance selection and strategy planning.
 * 
 * FEATURES:
 * - Select event
 * - Enter team number
 * - Record robot configuration (drive type, climb, shooter, intake)
 * - Optional robot image upload
 * - View existing pit scouting data
 * 
 * =============================================================================
 */

import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../contexts/AuthContext';
import { getEventList, getTeamEvents } from '../services/blueAllianceAPI';
import { 
  savePitScoutingData, 
  getPitScoutingByEvent, 
  uploadRobotImage,
  getPitScoutingForTeam
} from '../services/pitScoutingService';

// LocalStorage keys
const STORAGE_KEY_YEAR = 'pinkscout_pit_year';
const STORAGE_KEY_EVENT = 'pinkscout_pit_event';

export default function PitScouting() {
  const { user, userProfile, roleContext } = useAuth();
  const currentYear = new Date().getFullYear();

  // ==========================================================================
  // STATE
  // ==========================================================================

  // Event Selection
  const [selectedYear, setSelectedYear] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_YEAR);
    return saved ? parseInt(saved) : currentYear;
  });
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(() => {
    return localStorage.getItem(STORAGE_KEY_EVENT) || '';
  });
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventSearch, setEventSearch] = useState('');
  const [showEventDropdown, setShowEventDropdown] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    teamNumber: '',
    driveType: '',
    climbLevel: '',
    shooterType: '',
    intakeType: '',
    preferredStrategy: '',
    notes: ''
  });

  // Image State
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  // UI State
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [existingEntries, setExistingEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);

  // ==========================================================================
  // LOAD EVENTS
  // ==========================================================================

  useEffect(() => {
    loadEvents();
  }, [selectedYear]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_YEAR, selectedYear.toString());
  }, [selectedYear]);

  useEffect(() => {
    if (selectedEvent) {
      localStorage.setItem(STORAGE_KEY_EVENT, selectedEvent);
      loadExistingEntries();
    }
  }, [selectedEvent, roleContext]);

  const loadEvents = async () => {
    setLoadingEvents(true);
    try {
      // Try to get user's team events first
      if (userProfile?.teamNumber) {
        const teamEvents = await getTeamEvents(userProfile.teamNumber, selectedYear);
        if (teamEvents.length > 0) {
          setEvents(teamEvents);
          // Auto-select current/next event
          const now = new Date();
          const upcomingEvent = teamEvents.find(e => new Date(e.end_date) >= now);
          if (upcomingEvent && !selectedEvent) {
            setSelectedEvent(upcomingEvent.key);
          }
          setLoadingEvents(false);
          return;
        }
      }
      // Fallback to all events
      const allEvents = await getEventList(selectedYear);
      setEvents(allEvents);
    } catch (err) {
      console.error('Error loading events:', err);
    } finally {
      setLoadingEvents(false);
    }
  };

  const loadExistingEntries = async () => {
    if (!selectedEvent || !roleContext) return;
    setLoadingEntries(true);
    try {
      const entries = await getPitScoutingByEvent(selectedEvent, roleContext);
      setExistingEntries(entries);
    } catch (err) {
      console.error('Error loading existing entries:', err);
    } finally {
      setLoadingEntries(false);
    }
  };

  // ==========================================================================
  // FILTERED EVENTS
  // ==========================================================================

  const filteredEvents = events.filter(event => {
    const searchLower = eventSearch.toLowerCase();
    return (
      event.name?.toLowerCase().includes(searchLower) ||
      event.key?.toLowerCase().includes(searchLower) ||
      event.city?.toLowerCase().includes(searchLower)
    );
  });

  const selectedEventData = events.find(e => e.key === selectedEvent);

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEditEntry = async (entry) => {
    setEditingEntry(entry);
    setFormData({
      teamNumber: entry.team_number.toString(),
      driveType: entry.drive_type || '',
      climbLevel: entry.climb_level || '',
      shooterType: entry.shooter_type || '',
      intakeType: entry.intake_type || '',
      preferredStrategy: entry.preferred_strategy || '',
      notes: entry.notes || ''
    });
    if (entry.robot_image_url) {
      setImagePreview(entry.robot_image_url);
    }
  };

  const handleCancelEdit = () => {
    setEditingEntry(null);
    setFormData({
      teamNumber: '',
      driveType: '',
      climbLevel: '',
      shooterType: '',
      intakeType: '',
      preferredStrategy: '',
      notes: ''
    });
    setImageFile(null);
    setImagePreview(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess(false);

    try {
      // Validation
      if (!formData.teamNumber) {
        throw new Error('Team number is required');
      }
      if (!selectedEvent) {
        throw new Error('Please select an event');
      }
      if (!roleContext?.scoutingId && !roleContext?.teamLeadUid) {
        throw new Error('Your account is not linked to a team. Please update your profile.');
      }

      // Upload image first if present
      let imageUrl = editingEntry?.robot_image_url || null;
      if (imageFile) {
        try {
          setUploadingImage(true);
          imageUrl = await uploadRobotImage(imageFile, formData.teamNumber, selectedEvent);
        } catch (imgErr) {
          console.error('Image upload failed:', imgErr);
          // Continue with submission even if image fails
        } finally {
          setUploadingImage(false);
        }
      }

      const dataToSave = {
        ...formData,
        eventKey: selectedEvent,
        robotImageUrl: imageUrl,
        scouterUid: user?.id,
        scouterName: userProfile?.displayName || user?.email,
        teamLeadUid: roleContext?.teamLeadUid,
        scoutingId: roleContext?.scoutingId
      };

      await savePitScoutingData(dataToSave);
      setSuccess(true);

      // Reload entries and reset form
      await loadExistingEntries();
      setTimeout(() => {
        handleCancelEdit();
        setSuccess(false);
      }, 2000);
    } catch (err) {
      setError(err.message);
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
        <title>Pit Scouting | PinkScout</title>
      </Helmet>

      <div className="page-container">
        <h1 className="page-title">🔧 Pit Scouting</h1>
        <p className="page-subtitle">Record robot capabilities before matches</p>

        {/* Success/Error Messages */}
        {success && (
          <div className="alert alert-success">
            ✅ Pit scouting data saved successfully!
          </div>
        )}
        {error && (
          <div className="alert alert-error">
            ❌ {error}
          </div>
        )}

        {/* Event Selection */}
        <div className="card">
          <h2>📅 Select Event</h2>
          <div className="form-row">
            <div className="form-group">
              <label>Year</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              >
                {[...Array(5)].map((_, i) => (
                  <option key={currentYear - i} value={currentYear - i}>
                    {currentYear - i}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ flex: 2 }}>
              <label>Event</label>
              <div className="searchable-dropdown">
                <input
                  type="text"
                  placeholder={loadingEvents ? 'Loading events...' : 'Search events...'}
                  value={eventSearch}
                  onChange={(e) => setEventSearch(e.target.value)}
                  onFocus={() => setShowEventDropdown(true)}
                  onBlur={() => setTimeout(() => setShowEventDropdown(false), 200)}
                />
                {showEventDropdown && filteredEvents.length > 0 && (
                  <div className="dropdown-list">
                    {filteredEvents.slice(0, 20).map(event => (
                      <div
                        key={event.key}
                        className={`dropdown-item ${selectedEvent === event.key ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedEvent(event.key);
                          setEventSearch('');
                          setShowEventDropdown(false);
                        }}
                      >
                        {event.name} ({event.key})
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {selectedEventData && (
                <div className="selected-event-badge">
                  ✅ {selectedEventData.name}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Pit Scouting Form */}
        {selectedEvent && (
          <form onSubmit={handleSubmit} className="card">
            <h2>{editingEntry ? '✏️ Edit Pit Scouting Entry' : '📝 New Pit Scouting Entry'}</h2>

            {/* Team Number */}
            <div className="form-group">
              <label>Team Number *</label>
              <input
                type="number"
                name="teamNumber"
                value={formData.teamNumber}
                onChange={handleChange}
                placeholder="e.g., 1551"
                required
                min="1"
                max="99999"
                disabled={!!editingEntry}
              />
            </div>

            {/* Robot Configuration */}
            <h3 style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>🤖 Robot Configuration</h3>

            <div className="form-row">
              <div className="form-group">
                <label>Drive Type</label>
                <select name="driveType" value={formData.driveType} onChange={handleChange}>
                  <option value="">Select...</option>
                  <option value="tank">Tank Drive</option>
                  <option value="mecanum">Mecanum</option>
                  <option value="swerve">Swerve</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label>Max Climb Level</label>
                <select name="climbLevel" value={formData.climbLevel} onChange={handleChange}>
                  <option value="">Select...</option>
                  <option value="none">None</option>
                  <option value="level1">Level 1 (15 pts)</option>
                  <option value="level2">Level 2 (20 pts)</option>
                  <option value="level3">Level 3 (30 pts)</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Shooter Type</label>
                <select name="shooterType" value={formData.shooterType} onChange={handleChange}>
                  <option value="">Select...</option>
                  <option value="turret">Turret</option>
                  <option value="static_1">Static 1</option>
                  <option value="static_2">Static 2</option>
                  <option value="static_3">Static 3</option>
                  <option value="static_4">Static 4</option>
                </select>
              </div>
              <div className="form-group">
                <label>Intake Type</label>
                <select name="intakeType" value={formData.intakeType} onChange={handleChange}>
                  <option value="">Select...</option>
                  <option value="over_bumper">Over Bumper</option>
                  <option value="through_bumper">Through Bumper</option>
                  <option value="none">None</option>
                </select>
              </div>
            </div>

            {/* Strategy & Notes */}
            <div className="form-group">
              <label>Preferred Strategy</label>
              <input
                type="text"
                name="preferredStrategy"
                value={formData.preferredStrategy}
                onChange={handleChange}
                placeholder="e.g., Offensive shooter, defensive blocker..."
              />
            </div>

            <div className="form-group">
              <label>Notes</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Additional observations about the robot..."
                rows={3}
              />
            </div>

            {/* Robot Image Upload */}
            <div className="form-group">
              <label>Robot Image (optional)</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
              />
              <small>Max 5MB. JPEG, PNG, or WebP.</small>
              {imagePreview && (
                <div className="image-preview" style={{ marginTop: '1rem' }}>
                  <img
                    src={imagePreview}
                    alt="Robot preview"
                    style={{ maxWidth: '200px', borderRadius: '8px' }}
                  />
                </div>
              )}
            </div>

            {/* Submit Buttons */}
            <div className="form-actions" style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting || uploadingImage}
              >
                {submitting ? 'Saving...' : uploadingImage ? 'Uploading Image...' :
                 editingEntry ? 'Update Entry' : 'Save Pit Scouting'}
              </button>
              {editingEntry && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCancelEdit}
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>
        )}

        {/* Existing Entries */}
        {selectedEvent && (
          <div className="card" style={{ marginTop: '2rem' }}>
            <h2>📋 Existing Pit Scouting Entries</h2>
            {loadingEntries ? (
              <p>Loading entries...</p>
            ) : existingEntries.length === 0 ? (
              <p className="text-muted">No pit scouting entries yet for this event.</p>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>Drive</th>
                      <th>Climb</th>
                      <th>Shooter</th>
                      <th>Intake</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {existingEntries.map(entry => (
                      <tr key={entry.id}>
                        <td data-label="Team"><strong>{entry.team_number}</strong></td>
                        <td data-label="Drive">{entry.drive_type || '-'}</td>
                        <td data-label="Climb">{entry.climb_level || '-'}</td>
                        <td data-label="Shooter">{entry.shooter_type || '-'}</td>
                        <td data-label="Intake">{entry.intake_type || '-'}</td>
                        <td data-label="">
                          <button
                            className="btn btn-small"
                            onClick={() => handleEditEntry(entry)}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
