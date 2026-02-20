/**
 * =============================================================================
 * STRATEGY BOARD PAGE - Drawing board for match strategies
 * =============================================================================
 * 
 * PURPOSE:
 * A tablet-optimized drawing board for planning match strategies.
 * Allows users to draw on a field image background.
 * 
 * FEATURES:
 * - FRC 2026 REBUILT field background image
 * - Drawing tools (pen, arrow, eraser)
 * - Color selection (red, blue, black)
 * - Brush size (S/M/L)
 * - Save/Load drawings
 * - Match-specific or default strategies
 * - Export to PNG and copy to clipboard
 * - Touch/stylus support for tablets
 * 
 * NOTES:
 * - Canvas is implemented using native HTML5 Canvas API
 * - No external canvas library to keep bundle size small
 * - Supports touch and stylus input
 * 
 * =============================================================================
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../contexts/AuthContext';
import { getEventList, getTeamEvents } from '../services/blueAllianceAPI';
import { 
  saveStrategyDrawing, 
  getStrategyDrawings,
  getDefaultStrategyDrawing,
  deleteStrategyDrawing
} from '../services/strategyService';

// Field image - 2026 FRC REBUILT field
const FIELD_IMAGE_URL = '/field-2026.svg';

// LocalStorage keys
const STORAGE_KEY_YEAR = 'pinkscout_strategy_year';
const STORAGE_KEY_EVENT = 'pinkscout_strategy_event';

// Drawing tools
const TOOLS = {
  PEN: 'pen',
  ERASER: 'eraser',
  ARROW: 'arrow'
};

// Colors
const COLORS = {
  RED: '#e53935',
  BLUE: '#1e88e5',
  BLACK: '#333333'
};

// Brush sizes
const BRUSH_SIZES = {
  SMALL: 3,
  MEDIUM: 6,
  LARGE: 12
};

export default function Strategy() {
  const { user, userProfile, roleContext } = useAuth();
  const currentYear = new Date().getFullYear();

  // Canvas ref
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

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

  // Drawing State
  const [tool, setTool] = useState(TOOLS.PEN);
  const [color, setColor] = useState(COLORS.RED);
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES.MEDIUM);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Arrow drawing state
  const [arrowStart, setArrowStart] = useState(null);
  const [canvasSnapshot, setCanvasSnapshot] = useState(null);

  // Saved Drawings
  const [savedDrawings, setSavedDrawings] = useState([]);
  const [currentDrawingId, setCurrentDrawingId] = useState(null);
  const [drawingTitle, setDrawingTitle] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [matchKey, setMatchKey] = useState('');

  // UI State
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Field image loaded
  const [fieldLoaded, setFieldLoaded] = useState(false);
  const fieldImageRef = useRef(null);

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
      loadSavedDrawings();
    }
  }, [selectedEvent, roleContext]);

  const loadEvents = async () => {
    setLoadingEvents(true);
    try {
      if (userProfile?.teamNumber) {
        const teamEvents = await getTeamEvents(userProfile.teamNumber, selectedYear);
        if (teamEvents.length > 0) {
          setEvents(teamEvents);
          const now = new Date();
          const upcomingEvent = teamEvents.find(e => new Date(e.end_date) >= now);
          if (upcomingEvent && !selectedEvent) {
            setSelectedEvent(upcomingEvent.key);
          }
          setLoadingEvents(false);
          return;
        }
      }
      const allEvents = await getEventList(selectedYear);
      setEvents(allEvents);
    } catch (err) {
      console.error('Error loading events:', err);
    } finally {
      setLoadingEvents(false);
    }
  };

  const loadSavedDrawings = async () => {
    if (!selectedEvent || !roleContext) return;
    setLoading(true);
    try {
      const drawings = await getStrategyDrawings(selectedEvent, roleContext);
      setSavedDrawings(drawings);
    } catch (err) {
      console.error('Error loading saved drawings:', err);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // CANVAS INITIALIZATION
  // ==========================================================================

  useEffect(() => {
    // Load field image
    const img = new Image();
    img.onload = () => {
      fieldImageRef.current = img;
      setFieldLoaded(true);
    };
    img.onerror = () => {
      // Fallback to green field if image not found
      setFieldLoaded(true);
    };
    img.src = FIELD_IMAGE_URL;
  }, []);

  useEffect(() => {
    if (fieldLoaded && canvasRef.current) {
      initializeCanvas();
    }
  }, [fieldLoaded, selectedEvent]);

  const initializeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // Set canvas size based on container
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = Math.min(rect.width * 0.5, 500);

    // Draw field background
    drawFieldBackground();
  }, []);

  const drawFieldBackground = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Clear canvas
    ctx.fillStyle = '#2d5016';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw field image if loaded
    if (fieldImageRef.current) {
      ctx.drawImage(fieldImageRef.current, 0, 0, canvas.width, canvas.height);
    } else {
      // Draw simple field outline as fallback
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2, 10);
      ctx.lineTo(canvas.width / 2, canvas.height - 10);
      ctx.stroke();
    }
  };

  // ==========================================================================
  // DRAWING HANDLERS
  // ==========================================================================

  const getCanvasCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if (e.touches) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY
      };
    }

    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    setIsDrawing(true);
    setHasUnsavedChanges(true);

    const { x, y } = getCanvasCoordinates(e);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (tool === TOOLS.ARROW) {
      // Save canvas state for arrow preview
      setArrowStart({ x, y });
      setCanvasSnapshot(ctx.getImageData(0, 0, canvas.width, canvas.height));
    } else {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();

    const { x, y } = getCanvasCoordinates(e);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (tool === TOOLS.ARROW && arrowStart && canvasSnapshot) {
      // Restore canvas and draw preview arrow
      ctx.putImageData(canvasSnapshot, 0, 0);
      drawArrow(ctx, arrowStart.x, arrowStart.y, x, y);
    } else if (tool === TOOLS.ERASER) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopDrawing = (e) => {
    if (tool === TOOLS.ARROW && isDrawing && arrowStart) {
      const { x, y } = getCanvasCoordinates(e);
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      // Restore canvas and draw final arrow
      if (canvasSnapshot) {
        ctx.putImageData(canvasSnapshot, 0, 0);
      }
      drawArrow(ctx, arrowStart.x, arrowStart.y, x, y);
      setArrowStart(null);
      setCanvasSnapshot(null);
    }
    setIsDrawing(false);
  };

  // Draw arrow with arrowhead
  const drawArrow = (ctx, fromX, fromY, toX, toY) => {
    const headLen = Math.max(15, brushSize * 2.5);
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);

    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw line
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Draw arrowhead
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - headLen * Math.cos(angle - Math.PI / 6),
      toY - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      toX - headLen * Math.cos(angle + Math.PI / 6),
      toY - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  };

  // ==========================================================================
  // CANVAS ACTIONS
  // ==========================================================================

  const clearCanvas = () => {
    if (hasUnsavedChanges && !window.confirm('Clear canvas? Unsaved changes will be lost.')) {
      return;
    }
    drawFieldBackground();
    setHasUnsavedChanges(false);
  };

  // Export canvas as PNG
  const exportAsPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `strategy-${selectedEvent || 'drawing'}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    setSuccess('Image exported!');
    setTimeout(() => setSuccess(''), 3000);
  };

  // Copy to clipboard for sharing
  const copyToClipboard = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      setSuccess('Copied to clipboard!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      // Fallback: download if clipboard not supported
      exportAsPNG();
    }
  };

  const saveDrawing = async () => {
    if (!selectedEvent) {
      setError('Please select an event first');
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const drawingData = canvas.toDataURL('image/png');

      const drawingToSave = {
        id: currentDrawingId,
        eventKey: selectedEvent,
        matchKey: matchKey || null,
        drawingData: { imageData: drawingData },
        title: drawingTitle || `Strategy ${new Date().toLocaleString()}`,
        isDefault: isDefault,
        createdBy: user?.id,
        teamLeadUid: roleContext?.teamLeadUid
      };

      const saved = await saveStrategyDrawing(drawingToSave);
      setCurrentDrawingId(saved.id);
      setSuccess('Strategy saved!');
      setHasUnsavedChanges(false);
      await loadSavedDrawings();

      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const loadDrawing = async (drawing) => {
    if (hasUnsavedChanges && !window.confirm('Load different strategy? Unsaved changes lost.')) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || !drawing.drawing_data?.imageData) return;

    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      setCurrentDrawingId(drawing.id);
      setDrawingTitle(drawing.title || '');
      setMatchKey(drawing.match_key || '');
      setIsDefault(drawing.is_default || false);
      setHasUnsavedChanges(false);
    };
    img.src = drawing.drawing_data.imageData;
  };

  const handleDeleteDrawing = async (id) => {
    if (!window.confirm('Delete this strategy?')) return;

    try {
      await deleteStrategyDrawing(id);
      if (currentDrawingId === id) {
        setCurrentDrawingId(null);
        setDrawingTitle('');
        clearCanvas();
      }
      await loadSavedDrawings();
    } catch (err) {
      setError(err.message);
    }
  };

  const newDrawing = () => {
    if (hasUnsavedChanges && !window.confirm('Start new? Unsaved changes lost.')) return;
    drawFieldBackground();
    setCurrentDrawingId(null);
    setDrawingTitle('');
    setMatchKey('');
    setIsDefault(false);
    setHasUnsavedChanges(false);
  };

  // Filtered events
  const filteredEvents = events.filter(event => {
    const searchLower = eventSearch.toLowerCase();
    return (
      event.name?.toLowerCase().includes(searchLower) ||
      event.key?.toLowerCase().includes(searchLower)
    );
  });

  const selectedEventData = events.find(e => e.key === selectedEvent);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <>
      <Helmet>
        <title>Strategy Board | PinkScout</title>
      </Helmet>

      <div className="page-container">
        <h1 className="page-title">🎯 Strategy Board</h1>
        <p className="page-subtitle">Draw and plan match strategies</p>

        {/* Messages */}
        {success && <div className="alert alert-success">✅ {success}</div>}
        {error && <div className="alert alert-error">❌ {error}</div>}
        {hasUnsavedChanges && (
          <div className="alert alert-warning">⚠️ You have unsaved changes</div>
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
                  placeholder={loadingEvents ? 'Loading...' : 'Search events...'}
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
                        {event.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {selectedEventData && (
                <div className="selected-event-badge">✅ {selectedEventData.name}</div>
              )}
            </div>
          </div>
        </div>

        {/* Drawing Board */}
        {selectedEvent && (
          <div className="card">
            <h2>🎨 Drawing Board</h2>

            {/* Drawing Title & Options */}
            <div className="form-row" style={{ marginBottom: '1rem' }}>
              <div className="form-group">
                <label>Title</label>
                <input
                  type="text"
                  value={drawingTitle}
                  onChange={(e) => setDrawingTitle(e.target.value)}
                  placeholder="Strategy name..."
                />
              </div>
              <div className="form-group">
                <label>Match Key (optional)</label>
                <input
                  type="text"
                  value={matchKey}
                  onChange={(e) => setMatchKey(e.target.value)}
                  placeholder="e.g., qm1, sf1m1"
                />
              </div>
              <div className="form-group" style={{ alignSelf: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                  />
                  Default Strategy
                </label>
              </div>
            </div>

            {/* Toolbar */}
            <div className="strategy-toolbar" style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              marginBottom: '1rem',
              padding: '1rem',
              background: 'var(--bg-secondary)',
              borderRadius: '8px'
            }}>
              {/* Tools */}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className={`btn btn-small ${tool === TOOLS.PEN ? 'btn-primary' : ''}`}
                  onClick={() => setTool(TOOLS.PEN)}
                >
                  ✏️ Pen
                </button>
                <button
                  type="button"
                  className={`btn btn-small ${tool === TOOLS.ARROW ? 'btn-primary' : ''}`}
                  onClick={() => setTool(TOOLS.ARROW)}
                >
                  ➡️ Arrow
                </button>
                <button
                  type="button"
                  className={`btn btn-small ${tool === TOOLS.ERASER ? 'btn-primary' : ''}`}
                  onClick={() => setTool(TOOLS.ERASER)}
                >
                  🧹 Eraser
                </button>
              </div>

              {/* Colors */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span>Color:</span>
                {Object.entries(COLORS).map(([name, c]) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setColor(c)}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      backgroundColor: c,
                      border: color === c ? '3px solid var(--primary-color)' : '2px solid #ccc',
                      cursor: 'pointer'
                    }}
                    title={name}
                  />
                ))}
              </div>

              {/* Brush Size */}
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span>Size:</span>
                {Object.entries(BRUSH_SIZES).map(([name, size]) => (
                  <button
                    key={name}
                    type="button"
                    className={`btn btn-small ${brushSize === size ? 'btn-primary' : ''}`}
                    onClick={() => setBrushSize(size)}
                  >
                    {name[0]}
                  </button>
                ))}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
                <button type="button" className="btn btn-small" onClick={newDrawing}>
                  📄 New
                </button>
                <button type="button" className="btn btn-small" onClick={clearCanvas}>
                  🗑️ Clear
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-primary"
                  onClick={saveDrawing}
                  disabled={saving}
                >
                  {saving ? '...' : '💾 Save'}
                </button>
                <button type="button" className="btn btn-small" onClick={exportAsPNG} title="Download as PNG">
                  📥 Export
                </button>
                <button type="button" className="btn btn-small" onClick={copyToClipboard} title="Copy to clipboard">
                  📋 Copy
                </button>
              </div>
            </div>

            {/* Canvas */}
            <div
              ref={containerRef}
              style={{
                width: '100%',
                border: '2px solid var(--border-color)',
                borderRadius: '8px',
                overflow: 'hidden',
                touchAction: 'none'
              }}
            >
              <canvas
                ref={canvasRef}
                style={{ width: '100%', cursor: 'crosshair' }}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
            </div>
          </div>
        )}

        {/* Saved Strategies */}
        {selectedEvent && (
          <div className="card" style={{ marginTop: '2rem' }}>
            <h2>📁 Saved Strategies</h2>
            {loading ? (
              <p>Loading...</p>
            ) : savedDrawings.length === 0 ? (
              <p className="text-muted">No saved strategies for this event.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                {savedDrawings.map(drawing => (
                  <div
                    key={drawing.id}
                    className="card"
                    style={{
                      padding: '1rem',
                      cursor: 'pointer',
                      border: currentDrawingId === drawing.id ? '2px solid var(--primary-color)' : undefined
                    }}
                    onClick={() => loadDrawing(drawing)}
                  >
                    <h4 style={{ margin: '0 0 0.5rem 0' }}>
                      {drawing.title || 'Untitled'}
                      {drawing.is_default && ' ⭐'}
                    </h4>
                    {drawing.match_key && (
                      <small>Match: {drawing.match_key}</small>
                    )}
                    <div style={{ marginTop: '0.5rem' }}>
                      <button
                        className="btn btn-small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDrawing(drawing.id);
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
