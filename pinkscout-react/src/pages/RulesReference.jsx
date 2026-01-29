/**
 * =============================================================================
 * RULESREFERENCE.JSX - FRC 2026 Rules & Match Reference
 * =============================================================================
 * 
 * WHAT IS THIS PAGE?
 * A fast, in-match reference for high-impact FRC 2026 game rules that can
 * affect penalties, match outcomes, replays, or score corrections.
 * 
 * PURPOSE:
 * Function as a driver coach + strategist cheat sheet that can be opened
 * mid-event to verify rules and support calm, accurate discussions with referees.
 * 
 * ACCESSIBILITY:
 * - Publicly accessible (no login required)
 * - No team number requirement
 * - Mobile-optimized with large, readable text
 * 
 * =============================================================================
 */

import { useState } from 'react';
import { Helmet } from 'react-helmet-async';

// =============================================================================
// FRC 2026 REBUILT - TOP 20 CRITICAL RULES
// Categories: Robot-to-Robot Contact, Defense & Blocking, Protected Zones / Endgame,
//             Human Player & Drive Team Conduct, Inspection & Robot Legality,
//             Match Timing & Referee Authority
// =============================================================================

const RULES_DATA = [
  // Robot-to-Robot Contact
  {
    id: 'G401',
    category: 'Robot-to-Robot Contact',
    title: 'No Damaging Contact',
    description: 'ROBOTS may not damage or functionally impair other ROBOTS.',
    penalty: 'FOUL, TECH FOUL if extended or repeated, YELLOW/RED CARD for egregious violations',
  },
  {
    id: 'G402',
    category: 'Robot-to-Robot Contact',
    title: 'No Pinning Over 5 Seconds',
    description: 'A ROBOT may not PIN an opponent\'s ROBOT for more than 5 seconds. After 5 seconds, must back off at least 6 feet before re-engaging.',
    penalty: 'FOUL per additional 5 seconds of PIN',
  },
  {
    id: 'G403',
    category: 'Robot-to-Robot Contact',
    title: 'No Tipping or Entanglement',
    description: 'Strategies aimed at tipping, entangling, or disabling ROBOTS are not permitted.',
    penalty: 'TECH FOUL, YELLOW CARD if deliberate',
  },
  // Defense & Blocking
  {
    id: 'G410',
    category: 'Defense & Blocking',
    title: 'Defense Must Be Legal',
    description: 'Defense must be played without using mechanisms designed solely to obstruct opponents.',
    penalty: 'FOUL, TECH FOUL for repeated violations',
  },
  {
    id: 'G411',
    category: 'Defense & Blocking',
    title: 'No Blocking Opponent Access to Their Elements',
    description: 'ROBOTS may not block opponent access to their GAME PIECES or SCORING locations indefinitely.',
    penalty: 'FOUL after 5 seconds, TECH FOUL if persistent',
  },
  // Protected Zones / Endgame
  {
    id: 'G420',
    category: 'Protected Zones / Endgame',
    title: 'Protected Zones',
    description: 'Certain field areas are PROTECTED ZONES. Opposing ROBOTS may not contact ROBOTS in these zones under specified conditions.',
    penalty: 'TECH FOUL per instance of contact',
  },
  {
    id: 'G421',
    category: 'Protected Zones / Endgame',
    title: 'Endgame Protection',
    description: 'During the last 20 seconds of the MATCH (ENDGAME), ROBOTS attempting to CLIMB or PARK in designated areas are protected from opponent contact.',
    penalty: 'TECH FOUL, YELLOW CARD for intentional disruption',
  },
  {
    id: 'G422',
    category: 'Protected Zones / Endgame',
    title: 'No Interference with Climbing Robots',
    description: 'ROBOTS may not contact or interfere with an opponent ROBOT that has begun its CLIMB sequence.',
    penalty: 'TECH FOUL plus opponent points if climb prevented',
  },
  // Human Player & Drive Team Conduct
  {
    id: 'G430',
    category: 'Human Player & Drive Team Conduct',
    title: 'Human Players Stay in Designated Areas',
    description: 'HUMAN PLAYERS must remain in designated HUMAN PLAYER STATIONS during the MATCH.',
    penalty: 'FOUL, TECH FOUL if affecting gameplay',
  },
  {
    id: 'G431',
    category: 'Human Player & Drive Team Conduct',
    title: 'No Throwing Game Pieces at Robots',
    description: 'HUMAN PLAYERS may not throw GAME PIECES directly at ROBOTS or in a manner intended to interfere.',
    penalty: 'TECH FOUL per violation',
  },
  {
    id: 'G432',
    category: 'Human Player & Drive Team Conduct',
    title: 'Drive Team Conduct',
    description: 'DRIVE TEAM members must demonstrate professional behavior. Abuse of REFEREES, FIELD STAFF, or other teams is prohibited.',
    penalty: 'YELLOW CARD or RED CARD',
  },
  {
    id: 'G433',
    category: 'Human Player & Drive Team Conduct',
    title: 'No Coaching During Match',
    description: 'Only designated DRIVE TEAM members may communicate with DRIVERS during the MATCH.',
    penalty: 'FOUL per instance',
  },
  // Inspection & Robot Legality
  {
    id: 'R101',
    category: 'Inspection & Robot Legality',
    title: 'Robot Size Limits',
    description: 'ROBOTS must start the MATCH within the STARTING CONFIGURATION (frame perimeter, height restrictions per game manual).',
    penalty: 'ROBOT not allowed to compete until corrected',
  },
  {
    id: 'R102',
    category: 'Inspection & Robot Legality',
    title: 'Weight Limit',
    description: 'ROBOT weight may not exceed the maximum weight specified in the game manual (typically 125 lbs without battery/bumpers).',
    penalty: 'ROBOT not allowed to compete until corrected',
  },
  {
    id: 'R103',
    category: 'Inspection & Robot Legality',
    title: 'Bumper Requirements',
    description: 'BUMPERS must meet all requirements for construction, height, color, and team number display.',
    penalty: 'FOUL if non-compliant during MATCH, may be disabled',
  },
  // Match Timing & Referee Authority
  {
    id: 'G440',
    category: 'Match Timing & Referee Authority',
    title: 'Referee Calls Are Final',
    description: 'All REFEREE decisions are final. Teams may request clarification but may not dispute calls on the field.',
    penalty: 'YELLOW CARD for persistent arguing',
  },
  {
    id: 'G441',
    category: 'Match Timing & Referee Authority',
    title: 'Match Replay Authority',
    description: 'Only the HEAD REFEREE may authorize a MATCH replay due to FIELD FAULT or other extenuating circumstances.',
    penalty: 'N/A - procedural rule',
  },
  {
    id: 'G442',
    category: 'Match Timing & Referee Authority',
    title: 'Late Arrival',
    description: 'DRIVE TEAMS must be queued and ready before their MATCH. Failure to be ready may result in forfeiture.',
    penalty: 'Possible MATCH forfeiture',
  },
  {
    id: 'G443',
    category: 'Match Timing & Referee Authority',
    title: 'E-Stop Usage',
    description: 'DRIVE TEAMS must use E-STOP if ROBOT poses a safety hazard. E-STOP disabled ROBOTS may not re-enter that MATCH.',
    penalty: 'ROBOT removed from MATCH',
  },
  {
    id: 'G444',
    category: 'Match Timing & Referee Authority',
    title: 'Score Correction Window',
    description: 'Teams have until the end of the next MATCH to request score correction review.',
    penalty: 'N/A - procedural rule',
  },
];

// Categories for filtering
const CATEGORIES = [
  'All Categories',
  'Robot-to-Robot Contact',
  'Defense & Blocking',
  'Protected Zones / Endgame',
  'Human Player & Drive Team Conduct',
  'Inspection & Robot Legality',
  'Match Timing & Referee Authority',
];

// Category icons for visual distinction
const CATEGORY_ICONS = {
  'Robot-to-Robot Contact': '🤖',
  'Defense & Blocking': '🛡️',
  'Protected Zones / Endgame': '🏁',
  'Human Player & Drive Team Conduct': '👥',
  'Inspection & Robot Legality': '📋',
  'Match Timing & Referee Authority': '⏱️',
};

export default function RulesReference() {
  const [expandedRule, setExpandedRule] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('All Categories');

  // Filter rules by selected category
  const filteredRules = selectedCategory === 'All Categories'
    ? RULES_DATA
    : RULES_DATA.filter(rule => rule.category === selectedCategory);

  // Toggle rule expansion
  const toggleRule = (ruleId) => {
    setExpandedRule(expandedRule === ruleId ? null : ruleId);
  };

  return (
    <>
      <Helmet>
        <title>Rules & Match Reference - PinkScout</title>
        <meta name="description" content="FRC 2026 REBUILT critical rules reference for drivers, coaches, and strategists" />
      </Helmet>

      {/* Header Section */}
      <header className="page-header" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>📖 FRC 2026 Rules & Match Reference</h1>
        <p style={{ fontSize: '1rem', opacity: 0.9, marginBottom: '1rem' }}>
          Critical rules that can make or break a match
        </p>
        <a
          href="https://firstfrc.blob.core.windows.net/frc2026/Manual/2026GameManual.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
          style={{ fontSize: '1rem', padding: '0.75rem 1.5rem' }}
        >
          📄 Open Official 2026 Game Manual
        </a>
      </header>

      {/* Category Filter */}
      <div className="content-card" style={{ marginBottom: '1rem', padding: '1rem' }}>
        <label htmlFor="category-filter" style={{ fontWeight: '600', marginRight: '0.75rem' }}>
          Filter by Category:
        </label>
        <select
          id="category-filter"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          style={{
            padding: '0.5rem 1rem',
            fontSize: '1rem',
            borderRadius: '8px',
            border: '1px solid var(--border-color, #ddd)',
            backgroundColor: 'var(--surface-color, #fff)',
            cursor: 'pointer',
            minWidth: '200px',
          }}
        >
          {CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <span style={{ marginLeft: '1rem', opacity: 0.7 }}>
          Showing {filteredRules.length} rule{filteredRules.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Rules List */}
      <div className="rules-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {filteredRules.map(rule => (
          <div
            key={rule.id}
            className="content-card"
            style={{
              padding: '0',
              overflow: 'hidden',
              cursor: 'pointer',
              transition: 'box-shadow 0.2s',
            }}
          >
            {/* Rule Header - Always Visible */}
            <div
              onClick={() => toggleRule(rule.id)}
              style={{
                padding: '1rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: expandedRule === rule.id ? 'var(--primary-color, #e91e63)' : 'transparent',
                color: expandedRule === rule.id ? 'white' : 'inherit',
                transition: 'background-color 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                <span style={{ fontSize: '1.25rem' }}>{CATEGORY_ICONS[rule.category]}</span>
                <div>
                  <span style={{
                    fontWeight: '700',
                    fontSize: '1.1rem',
                    marginRight: '0.75rem',
                    fontFamily: 'monospace',
                  }}>
                    {rule.id}
                  </span>
                  <span style={{ fontWeight: '600', fontSize: '1rem' }}>
                    {rule.title}
                  </span>
                </div>
              </div>
              <span style={{ fontSize: '1.25rem', opacity: 0.7 }}>
                {expandedRule === rule.id ? '▼' : '▶'}
              </span>
            </div>

            {/* Rule Details - Expanded */}
            {expandedRule === rule.id && (
              <div style={{
                padding: '1.25rem',
                borderTop: '1px solid var(--border-color, #ddd)',
                backgroundColor: 'var(--surface-color, #fff)',
              }}>
                <div style={{ marginBottom: '1rem' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '0.25rem 0.5rem',
                    backgroundColor: 'var(--primary-light, #fce4ec)',
                    color: 'var(--primary-color, #e91e63)',
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                    fontWeight: '500',
                    marginBottom: '0.5rem',
                  }}>
                    {rule.category}
                  </span>
                </div>
                <p style={{
                  fontSize: '1.05rem',
                  lineHeight: '1.6',
                  marginBottom: '1rem',
                  color: 'var(--text-color, #333)',
                }}>
                  {rule.description}
                </p>
                <div style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: 'var(--warning-bg, #fff3e0)',
                  borderLeft: '4px solid var(--warning-color, #ff9800)',
                  borderRadius: '4px',
                }}>
                  <strong style={{ marginRight: '0.5rem' }}>⚠️ Penalty:</strong>
                  <span style={{ fontSize: '1rem' }}>{rule.penalty}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer Disclaimer */}
      <footer style={{
        marginTop: '2rem',
        padding: '1.5rem',
        backgroundColor: 'var(--surface-secondary, #f5f5f5)',
        borderRadius: '8px',
        textAlign: 'center',
        fontSize: '0.95rem',
        color: 'var(--text-secondary, #666)',
      }}>
        <p style={{ marginBottom: '0.5rem' }}>
          <strong>⚖️ Disclaimer:</strong> Referee calls are final.
        </p>
        <p>
          This page is a reference tool only and does not override Head Referee decisions.
          Always reference the latest <a
            href="https://firstfrc.blob.core.windows.net/frc2026/Manual/2026GameManual.pdf"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--primary-color, #e91e63)', textDecoration: 'underline' }}
          >Team Update</a>.
        </p>
      </footer>
    </>
  );
}

