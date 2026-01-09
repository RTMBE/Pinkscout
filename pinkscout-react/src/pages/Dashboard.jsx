/**
 * =============================================================================
 * DASHBOARD.JSX - Scouting Data Dashboard
 * =============================================================================
 * 
 * WHAT IS THIS PAGE?
 * Displays an overview of all scouting data collected by the team:
 * - Summary statistics (total entries, teams scouted, etc.)
 * - Recent scouting entries table
 * - Quick filters and search
 * 
 * DATA SOURCE: Firestore 'scouting' collection
 * 
 * =============================================================================
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { getAllScoutingData, deleteScoutingData } from '../services/scoutingService';
import { useAuth } from '../contexts/AuthContext';

export default function Dashboard() {
  // ==========================================================================
  // STATE
  // ==========================================================================
  
  const [scoutingData, setScoutingData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const { isAdmin } = useAuth();

  // ==========================================================================
  // LOAD DATA ON MOUNT
  // ==========================================================================
  
  useEffect(() => {
    loadScoutingData();
  }, []);

  const loadScoutingData = async () => {
    try {
      setLoading(true);
      const data = await getAllScoutingData();
      setScoutingData(data);
      setError(null);
    } catch (err) {
      console.error('Error loading scouting data:', err);
      setError('Failed to load scouting data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // DELETE HANDLER (Admin only)
  // ==========================================================================
  
  const handleDelete = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this entry?')) return;
    
    try {
      await deleteScoutingData(docId);
      setScoutingData(prev => prev.filter(entry => entry.id !== docId));
    } catch (err) {
      console.error('Error deleting entry:', err);
      alert('Failed to delete entry.');
    }
  };

  // ==========================================================================
  // COMPUTED VALUES
  // ==========================================================================
  
  // Filter data based on search term
  const filteredData = scoutingData.filter(entry => {
    const term = searchTerm.toLowerCase();
    return (
      String(entry.teamNumber).includes(term) ||
      String(entry.matchNumber).includes(term) ||
      (entry.scouterName || '').toLowerCase().includes(term) ||
      (entry.eventKey || '').toLowerCase().includes(term)
    );
  });

  // Calculate summary stats
  const uniqueTeams = new Set(scoutingData.map(e => e.teamNumber)).size;
  const uniqueEvents = new Set(scoutingData.map(e => e.eventKey).filter(Boolean)).size;
  const uniqueScouters = new Set(scoutingData.map(e => e.scouterName).filter(Boolean)).size;

  // ==========================================================================
  // RENDER
  // ==========================================================================
  
  return (
    <>
      <Helmet>
        <title>Dashboard - PinkScout</title>
        <meta name="description" content="View all scouting data collected by your team" />
      </Helmet>

      {/* Page Header */}
      <header className="page-header">
        <h1>📊 Scouting Dashboard</h1>
        <p>Overview of all scouting data collected by your team</p>
      </header>

      {/* Summary Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{scoutingData.length}</div>
          <div className="stat-label">Total Entries</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{uniqueTeams}</div>
          <div className="stat-label">Teams Scouted</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{uniqueEvents}</div>
          <div className="stat-label">Events</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{uniqueScouters}</div>
          <div className="stat-label">Scouters</div>
        </div>
      </div>

      {/* Data Table Card */}
      <div className="content-card">
        <div className="card-header">
          <h2>Recent Entries</h2>
          <div className="card-actions">
            <input
              type="text"
              placeholder="Search by team, match, scouter..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <button onClick={loadScoutingData} className="btn btn-secondary">
              🔄 Refresh
            </button>
            <Link to="/scouting" className="btn btn-primary">
              + New Entry
            </Link>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading scouting data...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="error-message">
            {error}
            <button onClick={loadScoutingData} className="btn btn-secondary">
              Try Again
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredData.length === 0 && (
          <div className="empty-state">
            <p>
              {searchTerm
                ? 'No entries match your search.'
                : 'No scouting data yet. Start by scouting a match!'}
            </p>
            {!searchTerm && (
              <Link to="/scouting" className="btn btn-primary">
                Scout Your First Match
              </Link>
            )}
          </div>
        )}

        {/* Data Table */}
        {!loading && !error && filteredData.length > 0 && (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Match</th>
                  <th>Event</th>
                  <th>Scouter</th>
                  <th>Auto Pts</th>
                  <th>Teleop Pts</th>
                  <th>Date</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredData.slice(0, 50).map(entry => (
                  <tr key={entry.id}>
                    <td>
                      <Link to={`/teams?team=${entry.teamNumber}`}>
                        {entry.teamNumber}
                      </Link>
                    </td>
                    <td>{entry.matchNumber || '-'}</td>
                    <td>{entry.eventKey || '-'}</td>
                    <td>{entry.scouterName || 'Unknown'}</td>
                    <td>
                      {((entry.autoSpeaker || 0) * 5) +
                       ((entry.autoAmp || 0) * 2) +
                       (entry.autoMobility ? 2 : 0)}
                    </td>
                    <td>
                      {((entry.teleopSpeaker || 0) * 2) +
                       ((entry.teleopAmp || 0) * 1) +
                       ((entry.amplifiedScored || 0) * 5)}
                    </td>
                    <td>
                      {entry.createdAt
                        ? new Date(entry.createdAt).toLocaleDateString()
                        : '-'}
                    </td>
                    {isAdmin && (
                      <td>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="btn btn-danger btn-small"
                        >
                          🗑️
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredData.length > 50 && (
              <p className="table-note">
                Showing 50 of {filteredData.length} entries. Use search to filter.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

