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

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { saveScoutingData } from '../services/scoutingService';
import { useAuth } from '../contexts/AuthContext';

export default function Scouting() {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  
  // ==========================================================================
  // FORM STATE
  // ==========================================================================
  
  const [formData, setFormData] = useState({
    // Match Info
    teamNumber: '',
    matchNumber: '',
    eventKey: '',
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

      // Add scouter info
      const dataToSave = {
        ...formData,
        teamNumber: parseInt(formData.teamNumber),
        matchNumber: parseInt(formData.matchNumber) || null,
        scouterName: userProfile?.displayName || user?.displayName || user?.email,
        scouterUid: user?.uid
      };

      await saveScoutingData(dataToSave);
      setSuccess(true);
      
      // Reset form after short delay
      setTimeout(() => {
        setFormData({
          teamNumber: '',
          matchNumber: '',
          eventKey: formData.eventKey, // Keep event key
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
              <label htmlFor="eventKey">Event Key</label>
              <input
                type="text"
                id="eventKey"
                name="eventKey"
                value={formData.eventKey}
                onChange={handleChange}
                placeholder="e.g., 2024casj"
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

