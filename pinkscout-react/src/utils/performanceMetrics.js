/**
 * =============================================================================
 * PERFORMANCE METRICS UTILITY
 * =============================================================================
 *
 * Calculates performance trends and metrics from scouting data:
 * - Performance slope (improvement/decline rate)
 * - Consistency index (how reliable the team is)
 * - Volatility (variance in performance)
 * - Trending badges (Hot, Rising, Stable, Declining, Cold)
 *
 * =============================================================================
 */

import { calculateAutoPoints, calculateTeleopPoints } from './epaUtils';

/**
 * Calculate linear regression slope for performance trend
 * Positive slope = improving, Negative slope = declining
 * @param {Array} scoutingData - Array of scouting entries (chronologically ordered)
 * @returns {number} Slope value (points per match improvement)
 */
export function calculatePerformanceSlope(scoutingData) {
  if (!scoutingData || scoutingData.length < 3) {
    return 0;
  }

  // Sort by timestamp or match number
  const sorted = [...scoutingData].sort((a, b) => {
    const timeA = a.createdAt || a.created_at || a.timestamp || 0;
    const timeB = b.createdAt || b.created_at || b.timestamp || 0;
    return new Date(timeA) - new Date(timeB);
  });

  // Calculate total points for each match
  const points = sorted.map(entry => {
    const auto = calculateAutoPoints(entry);
    const teleop = calculateTeleopPoints(entry);
    const endgame = entry.endgamePoints || entry.climbPoints || 0;
    return auto + teleop + endgame;
  });

  // Linear regression (least squares method)
  const n = points.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += points[i];
    sumXY += i * points[i];
    sumXX += i * i;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return 0;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  return Math.round(slope * 100) / 100; // 2 decimal places
}

/**
 * Calculate consistency index (0-100)
 * Higher = more consistent performance
 * @param {Array} scoutingData - Array of scouting entries
 * @returns {number} Consistency index (0-100)
 */
export function calculateConsistencyIndex(scoutingData) {
  if (!scoutingData || scoutingData.length < 2) {
    return 0;
  }

  const points = scoutingData.map(entry => {
    const auto = calculateAutoPoints(entry);
    const teleop = calculateTeleopPoints(entry);
    const endgame = entry.endgamePoints || entry.climbPoints || 0;
    return auto + teleop + endgame;
  });

  const mean = points.reduce((a, b) => a + b, 0) / points.length;
  if (mean === 0) return 0;

  // Coefficient of variation (CV) = std dev / mean
  const variance = points.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / points.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / mean;

  // Convert to 0-100 scale (lower CV = higher consistency)
  // CV of 0 = 100% consistent, CV of 1+ = 0% consistent
  const consistency = Math.max(0, Math.min(100, (1 - cv) * 100));
  return Math.round(consistency);
}

/**
 * Calculate volatility (standard deviation of performance)
 * Higher = more variable performance
 * @param {Array} scoutingData - Array of scouting entries
 * @returns {number} Volatility value (std dev of total points)
 */
export function calculateVolatility(scoutingData) {
  if (!scoutingData || scoutingData.length < 2) {
    return 0;
  }

  const points = scoutingData.map(entry => {
    const auto = calculateAutoPoints(entry);
    const teleop = calculateTeleopPoints(entry);
    const endgame = entry.endgamePoints || entry.climbPoints || 0;
    return auto + teleop + endgame;
  });

  const mean = points.reduce((a, b) => a + b, 0) / points.length;
  const variance = points.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / points.length;
  return Math.round(Math.sqrt(variance) * 10) / 10;
}

/**
 * Get trending badge based on performance metrics
 * @param {number} slope - Performance slope
 * @param {number} consistency - Consistency index
 * @param {number} matchCount - Number of matches analyzed
 * @returns {Object} { label, emoji, color, description }
 */
export function getTrendingBadge(slope, consistency, matchCount) {
  if (matchCount < 3) {
    return {
      label: 'Insufficient Data',
      emoji: '❓',
      color: '#9E9E9E',
      description: 'Need at least 3 matches to determine trend'
    };
  }

  // Strong positive trend with consistency
  if (slope > 3 && consistency > 60) {
    return {
      label: 'Hot',
      emoji: '🔥',
      color: '#FF5722',
      description: `Improving +${slope.toFixed(1)} pts/match`
    };
  }

  // Positive trend
  if (slope > 1) {
    return {
      label: 'Rising',
      emoji: '📈',
      color: '#4CAF50',
      description: `Trending up +${slope.toFixed(1)} pts/match`
    };
  }

  // Stable performance
  if (slope >= -1 && slope <= 1 && consistency > 50) {
    return {
      label: 'Stable',
      emoji: '➡️',
      color: '#2196F3',
      description: 'Consistent performance'
    };
  }

  // Negative trend
  if (slope < -1 && slope >= -3) {
    return {
      label: 'Declining',
      emoji: '📉',
      color: '#FF9800',
      description: `Trending down ${slope.toFixed(1)} pts/match`
    };
  }

  // Strong negative trend
  if (slope < -3) {
    return {
      label: 'Cold',
      emoji: '❄️',
      color: '#F44336',
      description: `Sharp decline ${slope.toFixed(1)} pts/match`
    };
  }

  // Default: variable performance
  return {
    label: 'Variable',
    emoji: '🎲',
    color: '#9C27B0',
    description: 'Inconsistent performance'
  };
}

/**
 * Get all performance metrics for a team
 * @param {Array} scoutingData - Array of scouting entries
 * @returns {Object} All performance metrics
 */
export function getPerformanceMetrics(scoutingData) {
  const slope = calculatePerformanceSlope(scoutingData);
  const consistency = calculateConsistencyIndex(scoutingData);
  const volatility = calculateVolatility(scoutingData);
  const matchCount = scoutingData?.length || 0;
  const trendBadge = getTrendingBadge(slope, consistency, matchCount);

  // Calculate recent form (last 3 matches vs average)
  let recentForm = null;
  if (matchCount >= 5) {
    const sorted = [...scoutingData].sort((a, b) => {
      const timeA = a.createdAt || a.created_at || a.timestamp || 0;
      const timeB = b.createdAt || b.created_at || b.timestamp || 0;
      return new Date(timeB) - new Date(timeA); // Most recent first
    });

    const recentPoints = sorted.slice(0, 3).map(entry => {
      const auto = calculateAutoPoints(entry);
      const teleop = calculateTeleopPoints(entry);
      const endgame = entry.endgamePoints || entry.climbPoints || 0;
      return auto + teleop + endgame;
    });

    const allPoints = scoutingData.map(entry => {
      const auto = calculateAutoPoints(entry);
      const teleop = calculateTeleopPoints(entry);
      const endgame = entry.endgamePoints || entry.climbPoints || 0;
      return auto + teleop + endgame;
    });

    const recentAvg = recentPoints.reduce((a, b) => a + b, 0) / recentPoints.length;
    const overallAvg = allPoints.reduce((a, b) => a + b, 0) / allPoints.length;
    recentForm = Math.round((recentAvg / overallAvg - 1) * 100); // % above/below average
  }

  return {
    slope,
    consistency,
    volatility,
    matchCount,
    trendBadge,
    recentForm
  };
}

