/**
 * =============================================================================
 * STRATEGY BOARD PAGE - Interactive FRC Strategy Planning for 2026 ReBUILT
 * =============================================================================
 *
 * PURPOSE:
 * A comprehensive tablet-optimized strategy board for FRC match planning.
 *
 * FEATURES:
 * - FRC 2026 REBUILT field background image
 * - Strategy mode tabs (Autonomous, TeleOp, Endgame)
 * - Draggable robot icons (3 red, 3 blue)
 * - Drawing tools (pen, arrow, rectangle, circle, eraser)
 * - Text annotation tool
 * - Defense zone marking (semi-transparent shapes)
 * - Toggle overlays (scoring zones, game pieces)
 * - Multiple colors and brush sizes
 * - Save/Load drawings per game phase
 * - Export to PNG and copy to clipboard
 * - Touch/stylus support for tablets
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
const FIELD_IMAGE_URL = '/Feild2026.png';

// LocalStorage keys
const STORAGE_KEY_YEAR = 'pinkscout_strategy_year';
const STORAGE_KEY_EVENT = 'pinkscout_strategy_event';

// Strategy phases/modes
const PHASES = {
  AUTO: 'autonomous',
  TELEOP: 'teleop',
  ENDGAME: 'endgame'
};

// Drawing tools
const TOOLS = {
  SELECT: 'select',
  PEN: 'pen',
  ARROW: 'arrow',
  RECTANGLE: 'rectangle',
  CIRCLE: 'circle',
  TEXT: 'text',
  ERASER: 'eraser'
};

// Colors (expanded palette)
const COLORS = {
  RED: '#e53935',
  BLUE: '#1e88e5',
  GREEN: '#43a047',
  YELLOW: '#fdd835',
  ORANGE: '#fb8c00',
  PURPLE: '#8e24aa',
  WHITE: '#ffffff',
  BLACK: '#333333'
};

// Brush sizes
const BRUSH_SIZES = {
  SMALL: 3,
  MEDIUM: 6,
  LARGE: 12
};

// Robot starting positions (relative to canvas, will be scaled)
const ROBOT_STARTING_POSITIONS = {
  red: [
    { id: 'red1', x: 0.92, y: 0.25, label: 'R1' },
    { id: 'red2', x: 0.92, y: 0.50, label: 'R2' },
    { id: 'red3', x: 0.92, y: 0.75, label: 'R3' }
  ],
  blue: [
    { id: 'blue1', x: 0.08, y: 0.25, label: 'B1' },
    { id: 'blue2', x: 0.08, y: 0.50, label: 'B2' },
    { id: 'blue3', x: 0.08, y: 0.75, label: 'B3' }
  ]
};

export default function Strategy() {
  const { user, userProfile, roleContext } = useAuth();
  const currentYear = new Date().getFullYear();

  // Canvas refs
  const canvasRef = useRef(null);
  const overlayCanvasRef = useRef(null);
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

  // Strategy Phase (Auto/TeleOp/Endgame)
  const [activePhase, setActivePhase] = useState(PHASES.AUTO);

  // Drawing State
  const [tool, setTool] = useState(TOOLS.PEN);
  const [color, setColor] = useState(COLORS.RED);
  const [brushSize, setBrushSize] = useState(BRUSH_SIZES.MEDIUM);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Shape/Arrow drawing state
  const [shapeStart, setShapeStart] = useState(null);
  const [canvasSnapshot, setCanvasSnapshot] = useState(null);

  // Text annotation state
  const [textInput, setTextInput] = useState('');
  const [textPosition, setTextPosition] = useState(null);
  const [showTextInput, setShowTextInput] = useState(false);

  // Robot positions (draggable)
  const [robots, setRobots] = useState(() => {
    const allRobots = [];
    ROBOT_STARTING_POSITIONS.red.forEach(r => allRobots.push({ ...r, alliance: 'red' }));
    ROBOT_STARTING_POSITIONS.blue.forEach(r => allRobots.push({ ...r, alliance: 'blue' }));
    return allRobots;
  });
  const [draggingRobot, setDraggingRobot] = useState(null);

  // Text annotations placed on field
  const [annotations, setAnnotations] = useState([]);

  // Overlay toggles
  const [showScoringZones, setShowScoringZones] = useState(true);
  const [showGamePieces, setShowGamePieces] = useState(true);
  const [showRobots, setShowRobots] = useState(true);

  // Saved Drawings (per phase)
  const [savedDrawings, setSavedDrawings] = useState([]);
  const [currentDrawingId, setCurrentDrawingId] = useState(null);
  const [drawingTitle, setDrawingTitle] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [matchKey, setMatchKey] = useState('');

  // Phase-specific drawing data
  const [phaseDrawings, setPhaseDrawings] = useState({
    [PHASES.AUTO]: null,
    [PHASES.TELEOP]: null,
    [PHASES.ENDGAME]: null
  });

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

  const drawFieldBackground = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
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

    // Draw overlays if enabled
    if (showScoringZones) {
      drawScoringZoneOverlays(ctx, canvas.width, canvas.height);
    }
  }, [showScoringZones]);

  // Draw scoring zone overlays
  const drawScoringZoneOverlays = (ctx, width, height) => {
    ctx.globalAlpha = 0.15;

    // Red alliance zone (right side)
    ctx.fillStyle = COLORS.RED;
    ctx.fillRect(width * 0.85, 0, width * 0.15, height);

    // Blue alliance zone (left side)
    ctx.fillStyle = COLORS.BLUE;
    ctx.fillRect(0, 0, width * 0.15, height);

    ctx.globalAlpha = 1.0;
  };

  // Draw robots on the field
  const drawRobots = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !showRobots) return;
    const ctx = canvas.getContext('2d');

    const robotSize = Math.min(canvas.width, canvas.height) * 0.07;

    robots.forEach(robot => {
      const x = robot.x * canvas.width;
      const y = robot.y * canvas.height;

      // Robot body
      ctx.fillStyle = robot.alliance === 'red' ? COLORS.RED : COLORS.BLUE;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.arc(x, y, robotSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Robot label
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${robotSize * 0.4}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(robot.label, x, y);
    });
  }, [robots, showRobots]);

  // Redraw robots when they change
  useEffect(() => {
    if (fieldLoaded && canvasRef.current) {
      // Only redraw robots overlay, not the whole canvas
      drawRobots();
    }
  }, [robots, showRobots, fieldLoaded, drawRobots]);

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

  // Check if clicking on a robot
  const getRobotAtPosition = (x, y) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const robotSize = Math.min(canvas.width, canvas.height) * 0.08;

    for (const robot of robots) {
      const rx = robot.x * canvas.width;
      const ry = robot.y * canvas.height;
      const dist = Math.sqrt((x - rx) ** 2 + (y - ry) ** 2);
      if (dist < robotSize / 2) {
        return robot;
      }
    }
    return null;
  };

  const startDrawing = (e) => {
    e.preventDefault();
    const { x, y } = getCanvasCoordinates(e);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Check if selecting/dragging a robot
    if (tool === TOOLS.SELECT || showRobots) {
      const robot = getRobotAtPosition(x, y);
      if (robot) {
        setDraggingRobot(robot.id);
        return;
      }
    }

    // Text tool - show input at position
    if (tool === TOOLS.TEXT) {
      setTextPosition({ x, y });
      setShowTextInput(true);
      return;
    }

    setIsDrawing(true);
    setHasUnsavedChanges(true);

    // Save snapshot for shape tools
    if ([TOOLS.ARROW, TOOLS.RECTANGLE, TOOLS.CIRCLE].includes(tool)) {
      setShapeStart({ x, y });
      setCanvasSnapshot(ctx.getImageData(0, 0, canvas.width, canvas.height));
    } else {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const draw = (e) => {
    e.preventDefault();
    const { x, y } = getCanvasCoordinates(e);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Handle robot dragging
    if (draggingRobot) {
      setRobots(prev => prev.map(r =>
        r.id === draggingRobot
          ? { ...r, x: x / canvas.width, y: y / canvas.height }
          : r
      ));
      setHasUnsavedChanges(true);
      return;
    }

    if (!isDrawing) return;

    // Shape preview
    if (shapeStart && canvasSnapshot) {
      ctx.putImageData(canvasSnapshot, 0, 0);

      if (tool === TOOLS.ARROW) {
        drawArrow(ctx, shapeStart.x, shapeStart.y, x, y);
      } else if (tool === TOOLS.RECTANGLE) {
        drawRectangle(ctx, shapeStart.x, shapeStart.y, x, y, false);
      } else if (tool === TOOLS.CIRCLE) {
        drawCircle(ctx, shapeStart.x, shapeStart.y, x, y, false);
      }
      return;
    }

    // Pen / Eraser drawing
    if (tool === TOOLS.ERASER) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
      ctx.lineWidth = brushSize * 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (tool === TOOLS.PEN) {
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
    // Stop robot dragging
    if (draggingRobot) {
      setDraggingRobot(null);
      return;
    }

    if (!isDrawing) return;

    const { x, y } = getCanvasCoordinates(e);
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Finalize shapes
    if (shapeStart && canvasSnapshot) {
      ctx.putImageData(canvasSnapshot, 0, 0);

      if (tool === TOOLS.ARROW) {
        drawArrow(ctx, shapeStart.x, shapeStart.y, x, y);
      } else if (tool === TOOLS.RECTANGLE) {
        drawRectangle(ctx, shapeStart.x, shapeStart.y, x, y, true);
      } else if (tool === TOOLS.CIRCLE) {
        drawCircle(ctx, shapeStart.x, shapeStart.y, x, y, true);
      }

      setShapeStart(null);
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

  // Draw rectangle (for defense zones)
  const drawRectangle = (ctx, fromX, fromY, toX, toY, fill = false) => {
    const width = toX - fromX;
    const height = toY - fromY;

    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;

    if (fill) {
      // Semi-transparent fill for defense zones
      ctx.fillStyle = color + '40'; // 25% opacity
      ctx.fillRect(fromX, fromY, width, height);
    }
    ctx.strokeRect(fromX, fromY, width, height);
  };

  // Draw circle/ellipse
  const drawCircle = (ctx, fromX, fromY, toX, toY, fill = false) => {
    const centerX = (fromX + toX) / 2;
    const centerY = (fromY + toY) / 2;
    const radiusX = Math.abs(toX - fromX) / 2;
    const radiusY = Math.abs(toY - fromY) / 2;

    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;

    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);

    if (fill) {
      ctx.fillStyle = color + '40'; // 25% opacity
      ctx.fill();
    }
    ctx.stroke();
  };

  // Add text annotation
  const addTextAnnotation = () => {
    if (!textInput.trim() || !textPosition) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    ctx.globalCompositeOperation = 'source-over';
    ctx.font = `bold ${Math.max(14, brushSize * 2.5)}px Arial`;
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;

    // Draw text with outline for visibility
    ctx.strokeText(textInput, textPosition.x, textPosition.y);
    ctx.fillText(textInput, textPosition.x, textPosition.y);

    // Save to annotations list
    setAnnotations(prev => [...prev, {
      id: Date.now(),
      text: textInput,
      x: textPosition.x / canvas.width,
      y: textPosition.y / canvas.height,
      color: color
    }]);

    setTextInput('');
    setTextPosition(null);
    setShowTextInput(false);
    setHasUnsavedChanges(true);
  };

  // Reset robots to starting positions
  const resetRobots = () => {
    const allRobots = [];
    ROBOT_STARTING_POSITIONS.red.forEach(r => allRobots.push({ ...r, alliance: 'red' }));
    ROBOT_STARTING_POSITIONS.blue.forEach(r => allRobots.push({ ...r, alliance: 'blue' }));
    setRobots(allRobots);
    setHasUnsavedChanges(true);
  };

  // ==========================================================================
  // CANVAS ACTIONS
  // ==========================================================================

  const clearCanvas = () => {
    if (hasUnsavedChanges && !window.confirm('Clear canvas? Unsaved changes will be lost.')) {
      return;
    }
    drawFieldBackground();
    resetRobots();
    setAnnotations([]);
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
                        onMouseDown={(e) => {
                          e.preventDefault();
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
            <h2>🎨 Strategy Board - 2026 ReBUILT</h2>

            {/* Phase Tabs */}
            <div style={{
              display: 'flex',
              gap: '0',
              marginBottom: '1rem',
              borderRadius: '8px',
              overflow: 'hidden',
              border: '2px solid var(--border-color)'
            }}>
              {Object.entries(PHASES).map(([key, phase]) => (
                <button
                  key={phase}
                  type="button"
                  onClick={() => setActivePhase(phase)}
                  style={{
                    flex: 1,
                    padding: '0.75rem 1rem',
                    border: 'none',
                    background: activePhase === phase
                      ? phase === PHASES.AUTO ? '#43a047'
                        : phase === PHASES.TELEOP ? '#1e88e5'
                        : '#fb8c00'
                      : 'var(--bg-secondary)',
                    color: activePhase === phase ? '#fff' : 'var(--text-color)',
                    fontWeight: activePhase === phase ? 'bold' : 'normal',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {phase === PHASES.AUTO ? '🤖 Autonomous'
                    : phase === PHASES.TELEOP ? '🎮 TeleOp'
                    : '🏁 Endgame'}
                </button>
              ))}
            </div>

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
              flexDirection: 'column',
              gap: '0.75rem',
              marginBottom: '1rem',
              padding: '1rem',
              background: 'var(--bg-secondary)',
              borderRadius: '8px'
            }}>
              {/* Row 1: Tools */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', minWidth: '50px' }}>Tools:</span>
                <button
                  type="button"
                  className={`btn btn-small ${tool === TOOLS.SELECT ? 'btn-primary' : ''}`}
                  onClick={() => setTool(TOOLS.SELECT)}
                  title="Select/Move Robots"
                >
                  👆 Select
                </button>
                <button
                  type="button"
                  className={`btn btn-small ${tool === TOOLS.PEN ? 'btn-primary' : ''}`}
                  onClick={() => setTool(TOOLS.PEN)}
                  title="Freehand Pen"
                >
                  ✏️ Pen
                </button>
                <button
                  type="button"
                  className={`btn btn-small ${tool === TOOLS.ARROW ? 'btn-primary' : ''}`}
                  onClick={() => setTool(TOOLS.ARROW)}
                  title="Draw Arrow"
                >
                  ➡️ Arrow
                </button>
                <button
                  type="button"
                  className={`btn btn-small ${tool === TOOLS.RECTANGLE ? 'btn-primary' : ''}`}
                  onClick={() => setTool(TOOLS.RECTANGLE)}
                  title="Draw Rectangle (Defense Zones)"
                >
                  ⬜ Rect
                </button>
                <button
                  type="button"
                  className={`btn btn-small ${tool === TOOLS.CIRCLE ? 'btn-primary' : ''}`}
                  onClick={() => setTool(TOOLS.CIRCLE)}
                  title="Draw Circle"
                >
                  ⭕ Circle
                </button>
                <button
                  type="button"
                  className={`btn btn-small ${tool === TOOLS.TEXT ? 'btn-primary' : ''}`}
                  onClick={() => setTool(TOOLS.TEXT)}
                  title="Add Text Annotation"
                >
                  📝 Text
                </button>
                <button
                  type="button"
                  className={`btn btn-small ${tool === TOOLS.ERASER ? 'btn-primary' : ''}`}
                  onClick={() => setTool(TOOLS.ERASER)}
                  title="Eraser"
                >
                  🧹 Eraser
                </button>
              </div>

              {/* Row 2: Colors & Size */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold', minWidth: '50px' }}>Color:</span>
                  {Object.entries(COLORS).map(([name, c]) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setColor(c)}
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: c,
                        border: color === c ? '3px solid var(--primary-color)' : '2px solid #666',
                        cursor: 'pointer',
                        boxShadow: color === c ? '0 0 8px var(--primary-color)' : 'none'
                      }}
                      title={name}
                    />
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold' }}>Size:</span>
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
              </div>

              {/* Row 3: Overlays & Actions */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
                {/* Overlay Toggles */}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <span style={{ fontWeight: 'bold' }}>Show:</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={showScoringZones}
                      onChange={(e) => setShowScoringZones(e.target.checked)}
                    />
                    Zones
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={showRobots}
                      onChange={(e) => setShowRobots(e.target.checked)}
                    />
                    Robots
                  </label>
                  <button type="button" className="btn btn-small" onClick={resetRobots} title="Reset robot positions">
                    🔄 Reset Robots
                  </button>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
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
            </div>

            {/* Text Input Modal */}
            {showTextInput && textPosition && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
              }}>
                <div style={{
                  background: 'var(--bg-primary)',
                  padding: '1.5rem',
                  borderRadius: '12px',
                  minWidth: '300px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
                }}>
                  <h3 style={{ margin: '0 0 1rem 0' }}>📝 Add Annotation</h3>
                  <input
                    type="text"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Enter text..."
                    autoFocus
                    style={{ width: '100%', marginBottom: '1rem' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addTextAnnotation();
                      if (e.key === 'Escape') {
                        setShowTextInput(false);
                        setTextPosition(null);
                        setTextInput('');
                      }
                    }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => {
                        setShowTextInput(false);
                        setTextPosition(null);
                        setTextInput('');
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-primary"
                      onClick={addTextAnnotation}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Canvas */}
            <div
              ref={containerRef}
              style={{
                width: '100%',
                border: '2px solid var(--border-color)',
                borderRadius: '8px',
                overflow: 'hidden',
                touchAction: 'none',
                position: 'relative'
              }}
            >
              <canvas
                ref={canvasRef}
                style={{
                  width: '100%',
                  cursor: tool === TOOLS.SELECT ? 'grab'
                    : tool === TOOLS.TEXT ? 'text'
                    : tool === TOOLS.ERASER ? 'cell'
                    : 'crosshair'
                }}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />

              {/* Phase indicator on canvas */}
              <div style={{
                position: 'absolute',
                top: '8px',
                left: '8px',
                background: activePhase === PHASES.AUTO ? '#43a047'
                  : activePhase === PHASES.TELEOP ? '#1e88e5'
                  : '#fb8c00',
                color: '#fff',
                padding: '4px 12px',
                borderRadius: '4px',
                fontWeight: 'bold',
                fontSize: '0.85rem',
                pointerEvents: 'none'
              }}>
                {activePhase === PHASES.AUTO ? '🤖 AUTO'
                  : activePhase === PHASES.TELEOP ? '🎮 TELEOP'
                  : '🏁 ENDGAME'}
              </div>
            </div>

            {/* Instructions */}
            <div style={{
              marginTop: '0.75rem',
              fontSize: '0.85rem',
              color: 'var(--text-muted)',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem'
            }}>
              <span>💡 <strong>Tips:</strong></span>
              <span>Drag robots to position them</span>
              <span>Use rectangles for defense zones</span>
              <span>Draw arrows for paths</span>
              <span>Add text labels for notes</span>
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
