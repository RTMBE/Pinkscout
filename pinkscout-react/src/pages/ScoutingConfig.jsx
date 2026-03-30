/**
 * =============================================================================
 * SCOUTING CONFIG PAGE - Customizable Scouting Field Editor
 * =============================================================================
 * 
 * Allows team leads to:
 * - Add/remove/modify scouting fields
 * - Configure scoring weights for ECS calculation
 * - Set up year-specific configurations
 * 
 * =============================================================================
 */

import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../contexts/AuthContext';
import {
  getScoutingConfig,
  saveScoutingConfig,
  FIELD_TYPES,
  FIELD_CATEGORIES,
  DEFAULT_FIELDS,
  DEFAULT_SCORING_WEIGHTS,
  getDataSharingSetting,
  updateDataSharingSetting
} from '../services/scoutingConfigService';
import '../styles/ScoutingConfig.css';

export default function ScoutingConfig() {
  const { user, roleContext } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);
  const [fields, setFields] = useState([]);
  const [weights, setWeights] = useState({});
  const [configName, setConfigName] = useState('Custom Config');
  const [year, setYear] = useState(2026);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [editingField, setEditingField] = useState(null);
  const [useAllEventData, setUseAllEventData] = useState(true); // Default: use all data
  const [savingDataSharing, setSavingDataSharing] = useState(false);

  // Check if user is team lead
  const isTeamLead = roleContext?.isTeamLead || roleContext?.isMasterAdmin;
  const teamLeadUid = roleContext?.teamLeadUid || user?.id;

  // Load configuration
  useEffect(() => {
    async function loadConfig() {
      if (!teamLeadUid) return;
      setLoading(true);
      try {
        const data = await getScoutingConfig(teamLeadUid, year);
        setConfig(data);
        setFields(data.fields || DEFAULT_FIELDS);
        setWeights(data.scoring_weights || DEFAULT_SCORING_WEIGHTS);
        setConfigName(data.config_name || 'Custom Config');

        // Load data sharing setting
        const sharingEnabled = await getDataSharingSetting(teamLeadUid);
        setUseAllEventData(sharingEnabled);
      } catch (error) {
        setMessage({ type: 'error', text: 'Failed to load configuration' });
      }
      setLoading(false);
    }
    loadConfig();
  }, [teamLeadUid, year]);

  // Handle data sharing toggle
  const handleDataSharingToggle = async (enabled) => {
    if (!isTeamLead || !teamLeadUid) return;

    setSavingDataSharing(true);
    const success = await updateDataSharingSetting(teamLeadUid, enabled);

    if (success) {
      setUseAllEventData(enabled);
      setMessage({
        type: 'success',
        text: enabled
          ? 'Now viewing all available scouting data from all teams'
          : 'Now viewing only your team\'s scouting data'
      });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } else {
      setMessage({ type: 'error', text: 'Failed to update data sharing setting' });
    }
    setSavingDataSharing(false);
  };

  // Save configuration
  const handleSave = async () => {
    if (!isTeamLead) {
      setMessage({ type: 'error', text: 'Only team leads can save configurations' });
      return;
    }
    setSaving(true);
    try {
      await saveScoutingConfig(teamLeadUid, {
        config_name: configName,
        year,
        fields,
        scoring_weights: weights,
        ecs_config: { formula: 'weighted_sum', version: 1 }
      });
      setMessage({ type: 'success', text: 'Configuration saved successfully!' });
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
    setSaving(false);
  };

  // Add new field
  const addField = () => {
    const newField = {
      id: `custom_${Date.now()}`,
      name: 'New Field',
      type: FIELD_TYPES.NUMBER,
      category: FIELD_CATEGORIES.CUSTOM,
      min: 0,
      max: 100,
      weight: 1,
      description: ''
    };
    setFields([...fields, newField]);
    setEditingField(newField.id);
  };

  // Update field
  const updateField = (id, updates) => {
    setFields(fields.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  // Remove field
  const removeField = (id) => {
    setFields(fields.filter(f => f.id !== id));
    const newWeights = { ...weights };
    delete newWeights[id];
    setWeights(newWeights);
  };

  // Update weight
  const updateWeight = (fieldId, weight) => {
    setWeights({ ...weights, [fieldId]: parseFloat(weight) || 0 });
  };

  // Reset to defaults
  const resetToDefaults = () => {
    if (window.confirm('Reset all fields to default 2026 configuration?')) {
      setFields(DEFAULT_FIELDS);
      setWeights(DEFAULT_SCORING_WEIGHTS);
      setConfigName('Default Config');
    }
  };

  if (!isTeamLead) {
    return (
      <div className="page-container">
        <Helmet><title>Scouting Config - PinkScout</title></Helmet>
        <header className="page-header">
          <h1>⚙️ Scouting Configuration</h1>
        </header>
        <div className="content-card">
          <p>Only team leads can configure scouting fields.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page-container">
        <Helmet><title>Scouting Config - PinkScout</title></Helmet>
        <div className="loading-spinner">Loading configuration...</div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <Helmet><title>Scouting Config - PinkScout</title></Helmet>
      
      <header className="page-header">
        <h1>⚙️ Scouting Configuration</h1>
        <p>Customize scouting fields and scoring weights for your team</p>
      </header>

      {message.text && (
        <div className={`message ${message.type}`}>{message.text}</div>
      )}

      {/* Config Info */}
      <div className="content-card">
        <h3>📋 Configuration Settings</h3>
        <div className="config-header">
          <div className="form-group">
            <label>Config Name</label>
            <input
              type="text"
              value={configName}
              onChange={(e) => setConfigName(e.target.value)}
              placeholder="My Custom Config"
            />
          </div>
          <div className="form-group">
            <label>Year</label>
            <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
              <option value={2024}>2024</option>
            </select>
          </div>
        </div>
      </div>

      {/* Data Sharing Settings */}
      <div className="content-card">
        <h3>🔗 Data Sharing</h3>
        <p className="section-description">
          Choose whether to view scouting data from all teams at the same competition,
          or only data collected by your team.
        </p>
        <div className="data-sharing-toggle">
          <div className="toggle-options">
            <button
              className={`toggle-btn ${useAllEventData ? 'active' : ''}`}
              onClick={() => handleDataSharingToggle(true)}
              disabled={savingDataSharing}
            >
              <span className="toggle-icon">🌐</span>
              <span className="toggle-label">All Available Data</span>
              <span className="toggle-desc">See data from all teams scouting this event</span>
            </button>
            <button
              className={`toggle-btn ${!useAllEventData ? 'active' : ''}`}
              onClick={() => handleDataSharingToggle(false)}
              disabled={savingDataSharing}
            >
              <span className="toggle-icon">🔒</span>
              <span className="toggle-label">My Team Only</span>
              <span className="toggle-desc">Only see data from your team members</span>
            </button>
          </div>
          {savingDataSharing && <span className="saving-indicator">Saving...</span>}
        </div>
      </div>

      {/* Field Editor */}
      <div className="content-card">
        <div className="card-header">
          <h3>📝 Scouting Fields</h3>
          <div className="card-actions">
            <button className="btn btn-secondary" onClick={resetToDefaults}>Reset Defaults</button>
            <button className="btn btn-primary" onClick={addField}>+ Add Field</button>
          </div>
        </div>

        <div className="fields-list">
          {Object.values(FIELD_CATEGORIES).map(category => {
            const categoryFields = fields.filter(f => f.category === category);
            if (categoryFields.length === 0) return null;
            return (
              <div key={category} className="field-category">
                <h4>{category.charAt(0).toUpperCase() + category.slice(1)} Fields</h4>
                {categoryFields.map(field => (
                  <div key={field.id} className={`field-item ${editingField === field.id ? 'editing' : ''}`}>
                    <div className="field-header" onClick={() => setEditingField(editingField === field.id ? null : field.id)}>
                      <span className="field-name">{field.name}</span>
                      <span className="field-type">{field.type}</span>
                      <span className="field-weight">Weight: {weights[field.id] || 0}</span>
                    </div>
                    {editingField === field.id && (
                      <div className="field-editor">
                        <div className="editor-row">
                          <div className="form-group">
                            <label>Field Name</label>
                            <input type="text" value={field.name} onChange={(e) => updateField(field.id, { name: e.target.value })} />
                          </div>
                          <div className="form-group">
                            <label>Type</label>
                            <select value={field.type} onChange={(e) => updateField(field.id, { type: e.target.value })}>
                              {Object.values(FIELD_TYPES).map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </div>
                          <div className="form-group">
                            <label>Category</label>
                            <select value={field.category} onChange={(e) => updateField(field.id, { category: e.target.value })}>
                              {Object.values(FIELD_CATEGORIES).map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="editor-row">
                          <div className="form-group">
                            <label>Min</label>
                            <input type="number" value={field.min || 0} onChange={(e) => updateField(field.id, { min: parseInt(e.target.value) })} />
                          </div>
                          <div className="form-group">
                            <label>Max</label>
                            <input type="number" value={field.max || 100} onChange={(e) => updateField(field.id, { max: parseInt(e.target.value) })} />
                          </div>
                          <div className="form-group">
                            <label>Weight (ECS)</label>
                            <input type="number" step="0.1" value={weights[field.id] || 0} onChange={(e) => updateWeight(field.id, e.target.value)} />
                          </div>
                        </div>
                        {field.type === 'select' && (
                          <div className="form-group">
                            <label>Options (comma-separated)</label>
                            <input type="text" value={(field.options || []).join(', ')} onChange={(e) => updateField(field.id, { options: e.target.value.split(',').map(s => s.trim()) })} />
                          </div>
                        )}
                        <div className="editor-actions">
                          <button className="btn btn-danger btn-sm" onClick={() => removeField(field.id)}>🗑️ Remove</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Save Button */}
      <div className="content-card">
        <button className="btn btn-primary btn-lg" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : '💾 Save Configuration'}
        </button>
      </div>
    </div>
  );
}

