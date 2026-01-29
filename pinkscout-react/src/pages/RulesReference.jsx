/**
 * =============================================================================
 * RULESREFERENCE.JSX - FRC 2026 Rules & Match Reference
 * =============================================================================
 *
 * PURPOSE:
 * Driver Coach & Strategist reference for the most match-impactful FRC 2026 rules.
 * This page is not educational and not a summary — it is a fast dispute and
 * verification tool for use during events.
 *
 * ACCESSIBILITY:
 * - Publicly accessible (no login required)
 * - No team number requirement
 * - Mobile-first layout, fast load, no animations
 *
 * =============================================================================
 */

import { useState } from 'react';
import { Helmet } from 'react-helmet-async';

// =============================================================================
// FRC 2026 REBUILT - TOP 20 CRITICAL RULES (EXACT CONTENT)
// =============================================================================

const RULES_DATA = [
  // 🤖 Robot Contact
  {
    id: 'G401',
    category: 'Robot Contact',
    title: 'No Damaging Contact',
    description: 'Robots may not deliberately or recklessly cause damage to an opponent robot. Damage includes bent frames, broken mechanisms, or loss of function.',
    penalty: 'Major FOUL; YELLOW CARD if damage is significant or repeated; RED CARD if an opponent is disabled.',
    whyItMatters: 'This rule can swing eliminations instantly if misapplied.',
  },
  {
    id: 'G402',
    category: 'Robot Contact',
    title: 'No Pinning Over 3 Seconds',
    description: 'A robot may not pin an opponent for more than 3 seconds. A pin ends when the pinned robot can move at least 6 feet away.',
    penalty: 'FOUL per additional 3 seconds.',
    whyItMatters: 'Common defense disputes; timing errors lead to bad calls.',
  },
  {
    id: 'G403',
    category: 'Robot Contact',
    title: 'No Tipping or Entanglement',
    description: 'Robots may not intentionally tip, lift, or entangle an opponent.',
    penalty: 'Major FOUL; possible YELLOW or RED CARD.',
    whyItMatters: 'Determines whether contact was strategic or illegal.',
  },
  // 🛡️ Defense
  {
    id: 'G410',
    category: 'Defense',
    title: 'Defense Must Be Legal',
    description: 'Defensive contact must be within bumper-to-bumper interaction and may not violate safety or protected zone rules.',
    penalty: 'FOUL or Major FOUL depending on severity.',
    whyItMatters: 'Clean defense vs illegal hits is subjective.',
  },
  {
    id: 'G411',
    category: 'Defense',
    title: 'No Blocking Opponent Access to Their Elements',
    description: 'Robots may not completely block opponent access to their scoring elements or loading areas for extended periods.',
    penalty: 'Major FOUL per violation.',
    whyItMatters: 'Used to stop zone denial strategies.',
  },
  // 🏁 Protected / Endgame
  {
    id: 'G420',
    category: 'Protected / Endgame',
    title: 'Protected Zones',
    description: 'Robots contacting opponents fully inside protected zones commit a violation.',
    penalty: 'Major FOUL.',
    whyItMatters: 'One bad call can hand over endgame points.',
  },
  {
    id: 'G421',
    category: 'Protected / Endgame',
    title: 'Endgame Protection',
    description: 'During endgame, robots interacting with endgame structures are protected from contact.',
    penalty: 'Major FOUL + awarded endgame credit.',
    whyItMatters: 'Decides climbs and ranking points.',
  },
  {
    id: 'G422',
    category: 'Protected / Endgame',
    title: 'No Interference with Climbing Robots',
    description: 'Robots may not contact or disturb an opponent that is actively climbing or latched.',
    penalty: 'Major FOUL; possible YELLOW CARD.',
    whyItMatters: 'Often miscalled in chaotic endgames.',
  },
  // 👥 Human Player & Drive Team
  {
    id: 'G430',
    category: 'Human Player & Drive Team',
    title: 'Human Players Stay in Designated Areas',
    description: 'Human Players must remain fully inside their assigned zone.',
    penalty: 'FOUL; escalation for repeat offenses.',
    whyItMatters: 'Easy to verify and overturn if wrong.',
  },
  {
    id: 'G431',
    category: 'Human Player & Drive Team',
    title: 'No Throwing Game Pieces at Robots',
    description: 'Game pieces may not be thrown directly at robots.',
    penalty: 'FOUL or Major FOUL.',
    whyItMatters: 'Prevents unsafe scoring attempts.',
  },
  {
    id: 'G432',
    category: 'Human Player & Drive Team',
    title: 'Drive Team Conduct',
    description: 'Drive Teams must act respectfully and follow referee instructions.',
    penalty: 'YELLOW CARD; RED CARD for egregious behavior.',
    whyItMatters: 'Impacts alliance penalties.',
  },
  {
    id: 'G433',
    category: 'Human Player & Drive Team',
    title: 'No Coaching During Match',
    description: 'Only designated Drive Team members may communicate during a match.',
    penalty: 'FOUL or YELLOW CARD.',
    whyItMatters: 'Often violated unintentionally.',
  },
  // 📋 Robot Legality
  {
    id: 'R101',
    category: 'Robot Legality',
    title: 'Robot Size Limits',
    description: 'Robots must remain within size constraints except during legal extension.',
    penalty: 'DISABLED if illegal during match.',
    whyItMatters: 'Instant match loss if violated.',
  },
  {
    id: 'R102',
    category: 'Robot Legality',
    title: 'Weight Limit',
    description: 'Robots may not exceed the maximum allowed weight including bumpers and battery.',
    penalty: 'Fails inspection; may not compete.',
    whyItMatters: 'Can invalidate match results.',
  },
  {
    id: 'R103',
    category: 'Robot Legality',
    title: 'Bumper Requirements',
    description: 'Bumpers must meet construction, coverage, and height rules.',
    penalty: 'Inspection failure or DISABLED.',
    whyItMatters: 'Contact legality depends on bumpers.',
  },
  // ⏱️ Match Authority & Timing
  {
    id: 'G440',
    category: 'Match Authority & Timing',
    title: 'Referee Calls Are Final',
    description: 'All referee decisions are final and not subject to video review.',
    penalty: 'Ends disputes immediately.',
    whyItMatters: 'N/A - procedural rule.',
  },
  {
    id: 'G441',
    category: 'Match Authority & Timing',
    title: 'Match Replay Authority',
    description: 'Only the Head Referee may authorize a match replay due to field or timing faults.',
    penalty: 'Prevents improper replay demands.',
    whyItMatters: 'N/A - procedural rule.',
  },
  {
    id: 'G442',
    category: 'Match Authority & Timing',
    title: 'Late Arrival',
    description: 'Teams not present at match start may be bypassed or disabled.',
    penalty: 'Zero contribution to alliance score.',
    whyItMatters: 'N/A - procedural rule.',
  },
  {
    id: 'G443',
    category: 'Match Authority & Timing',
    title: 'E-Stop Usage',
    description: 'Emergency Stop disables the robot for the remainder of the match.',
    penalty: 'Irreversible match consequence.',
    whyItMatters: 'N/A - procedural rule.',
  },
  {
    id: 'G444',
    category: 'Match Authority & Timing',
    title: 'Score Correction Window',
    description: 'Score discrepancies must be raised within the allowed review window before the next match.',
    penalty: 'Missed window = score locked.',
    whyItMatters: 'N/A - procedural rule.',
  },
];

// Categories for filtering (matching user spec exactly)
const CATEGORIES = [
  'All Categories',
  'Robot Contact',
  'Defense',
  'Protected / Endgame',
  'Human Player & Drive Team',
  'Robot Legality',
  'Match Authority & Timing',
];

// Category icons for visual distinction
const CATEGORY_ICONS = {
  'Robot Contact': '🤖',
  'Defense': '🛡️',
  'Protected / Endgame': '🏁',
  'Human Player & Drive Team': '👥',
  'Robot Legality': '📋',
  'Match Authority & Timing': '⏱️',
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
          High-impact rules that can decide matches
        </p>
        <a
          href="https://firstfrc.blob.core.windows.net/frc2026/Manual/TeamUpdates/REBUILT_TeamUpdate-Combined.pdf"
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
                  marginBottom: '1rem',
                }}>
                  <strong style={{ marginRight: '0.5rem' }}>⚠️ Penalty / Match Impact:</strong>
                  <span style={{ fontSize: '1rem' }}>{rule.penalty}</span>
                </div>
                <div style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: 'var(--info-bg, #e3f2fd)',
                  borderLeft: '4px solid var(--info-color, #2196f3)',
                  borderRadius: '4px',
                }}>
                  <strong style={{ marginRight: '0.5rem' }}>💡 Why it matters:</strong>
                  <span style={{ fontSize: '1rem' }}>{rule.whyItMatters}</span>
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
        <p>
          This page is a reference tool. Referee calls are final. Always defer to the Head Referee and the latest{' '}
          <a
            href="https://firstfrc.blob.core.windows.net/frc2026/Manual/TeamUpdates/REBUILT_TeamUpdate-Combined.pdf"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--primary-color, #e91e63)', textDecoration: 'underline' }}
          >Team Update</a>.
        </p>
      </footer>
    </>
  );
}

