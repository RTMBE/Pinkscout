/**
 * =============================================================================
 * DATA EXPORT SERVICE - Export scouting data to CSV/JSON formats
 * =============================================================================
 * 
 * Provides functionality to export scouting data for external analysis.
 * Teams can download their data for use in spreadsheets or custom tools.
 */

/**
 * Convert scouting data array to CSV format
 * @param {Array} data - Array of scouting entries
 * @returns {string} CSV formatted string
 */
export function convertToCSV(data) {
  if (!data || data.length === 0) {
    return '';
  }

  // Define columns in a logical order for scouting analysis
  const columns = [
    'teamNumber',
    'matchNumber',
    'eventKey',
    'allianceColor',
    'startingPosition',
    'autoFuelScored',
    'autoCycles',
    'autoTowerClimb',
    'autoWin',
    'teleopFuelScored',
    'teleopCycles',
    'endgameTowerLevel',
    'robotRole',
    'scouterName',
    'notes',
    'createdAt'
  ];

  // Create header row
  const header = columns.join(',');

  // Create data rows
  const rows = data.map(entry => {
    return columns.map(col => {
      let value = entry[col] ?? '';
      
      // Handle special cases
      if (col === 'createdAt' && value) {
        value = new Date(value).toISOString();
      }
      
      // Escape and quote strings that contain commas, quotes, or newlines
      if (typeof value === 'string') {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          value = `"${value.replace(/"/g, '""')}"`;
        }
      }
      
      return value;
    }).join(',');
  });

  return [header, ...rows].join('\n');
}

/**
 * Convert scouting data to JSON format (pretty printed)
 * @param {Array} data - Array of scouting entries
 * @returns {string} JSON formatted string
 */
export function convertToJSON(data) {
  if (!data || data.length === 0) {
    return '[]';
  }

  // Clean up data for export (remove internal IDs, add readable names)
  const cleanData = data.map(entry => ({
    team: entry.teamNumber,
    match: entry.matchNumber,
    event: entry.eventKey,
    alliance: entry.allianceColor,
    startPosition: entry.startingPosition,
    auto: {
      fuelScored: entry.autoFuelScored || 0,
      cycles: entry.autoCycles || 0,
      towerClimb: entry.autoTowerClimb || 'none',
      wonAuto: entry.autoWin || false
    },
    teleop: {
      fuelScored: entry.teleopFuelScored || 0,
      cycles: entry.teleopCycles || 0
    },
    endgame: {
      towerLevel: entry.endgameTowerLevel || 'none'
    },
    robotRole: entry.robotRole || 'unknown',
    scouter: entry.scouterName || 'Unknown',
    notes: entry.notes || '',
    timestamp: entry.createdAt
  }));

  return JSON.stringify(cleanData, null, 2);
}

/**
 * Trigger a file download in the browser
 * @param {string} content - File content
 * @param {string} filename - Name of the file to download
 * @param {string} mimeType - MIME type of the file
 */
export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up the URL object
  URL.revokeObjectURL(url);
}

/**
 * Export scouting data to CSV file
 * @param {Array} data - Array of scouting entries
 * @param {string} eventKey - Optional event key for filename
 */
export function exportToCSV(data, eventKey = '') {
  const csv = convertToCSV(data);
  const filename = eventKey 
    ? `pinkscout_${eventKey}_${new Date().toISOString().split('T')[0]}.csv`
    : `pinkscout_export_${new Date().toISOString().split('T')[0]}.csv`;
  downloadFile(csv, filename, 'text/csv;charset=utf-8');
}

/**
 * Export scouting data to JSON file
 * @param {Array} data - Array of scouting entries
 * @param {string} eventKey - Optional event key for filename
 */
export function exportToJSON(data, eventKey = '') {
  const json = convertToJSON(data);
  const filename = eventKey 
    ? `pinkscout_${eventKey}_${new Date().toISOString().split('T')[0]}.json`
    : `pinkscout_export_${new Date().toISOString().split('T')[0]}.json`;
  downloadFile(json, filename, 'application/json');
}

