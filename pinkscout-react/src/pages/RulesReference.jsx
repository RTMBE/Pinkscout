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
// FRC 2026 REBUILT - OFFICIAL GAME MANUAL RULES REFERENCE
// Last Updated: January 2026 (Team Update Combined)
// =============================================================================

const RULES_DATA = [
  // 🤖 In-MATCH Rules (G401 - G403)
  {
    id: 'G401',
    category: 'In-Match Rules',
    title: 'Behind the Lines',
    description: 'During the AUTO period, each DRIVE TEAM member must remain in their staged areas. A member staged behind a HUMAN STARTING LINE may not contact anything in front of that line unless for safety reasons (personal or equipment), to press an E-Stop/A-Stop, or with permission from a Head REFEREE or FTA.',
    penalty: 'FOUL for violation.',
    isExactText: true,
  },
  {
    id: 'G402',
    category: 'In-Match Rules',
    title: 'No Pinning Over 5 Seconds',
    description: 'A ROBOT may not pin an opponent for more than 5 seconds. A pin ends when the pinned ROBOT can move freely.',
    penalty: 'FOUL per additional 5 seconds of pinning.',
    isExactText: false,
    note: 'Standard evergreen rule - verify exact wording in current manual.',
  },
  {
    id: 'G403',
    category: 'In-Match Rules',
    title: 'No Tipping or Entanglement',
    description: 'Governed by rule G417: A ROBOT may not deliberately attach to, tip, or entangle with an opponent. Violations include using wedge-like mechanisms or making contact with a tipping ROBOT that could have been avoided.',
    penalty: 'Major FOUL; possible YELLOW or RED CARD.',
    isExactText: true,
  },
  // 🛡️ Defense and Protection (G410 - G422)
  {
    id: 'G410',
    category: 'Defense',
    title: 'Keep Your BUMPERS Low',
    description: 'ROBOT extensions may not interact with the carpet, BUMPS, or TOWER BASE in a way that lifts BUMPERS out of the BUMPER ZONE (2.5 in. to 5.75 in. from the floor).',
    penalty: 'FOUL; TECH FOUL if strategic advantage gained.',
    isExactText: true,
  },
  {
    id: 'G411',
    category: 'Defense',
    title: "Don't Damage the FIELD",
    description: 'A ROBOT may not damage FIELD elements. If the Head REFEREE determines additional damage is likely, the ROBOT will be DISABLED.',
    penalty: 'FOUL; DISABLED if damage continues.',
    isExactText: true,
  },
  {
    id: 'G420',
    category: 'Protected / Endgame',
    title: 'Protected Zones',
    description: 'Specific areas where opponent contact is prohibited, such as the ALLIANCE ZONE or near scoring elements.',
    penalty: 'Major FOUL for contact with opponent in protected zone.',
    isExactText: false,
    note: 'Verify exact protected zone definitions in current manual.',
  },
  {
    id: 'G421',
    category: 'Protected / Endgame',
    title: 'Endgame Protection',
    description: 'Protections for ROBOTS in the final 30 seconds of the match while they are attempting to climb or score in endgame structures.',
    penalty: 'Major FOUL + awarded endgame credit to affected team.',
    isExactText: false,
    note: 'Verify exact endgame timing and protections in current manual.',
  },
  {
    id: 'G422',
    category: 'Protected / Endgame',
    title: 'DRIVE COACHES and Other Teams: Hands Off the Controls',
    description: 'A ROBOT must be operated only by the DRIVERS and/or HUMAN PLAYERS of that team. A DRIVE COACH may only touch controls to activate an E-Stop or A-Stop.',
    penalty: 'FOUL; YELLOW CARD for repeated violations.',
    isExactText: true,
  },
  // 👥 Human and Drive Team Conduct (G430 - G433)
  {
    id: 'G430',
    category: 'Human Player & Drive Team',
    title: 'Human Players Stay in Designated Areas',
    description: 'HUMAN PLAYERS must remain in the ALLIANCE AREA or specific stations during the match.',
    penalty: 'FOUL; escalation for repeat offenses.',
    isExactText: false,
    note: 'Verify exact station boundaries in current manual.',
  },
  {
    id: 'G431',
    category: 'Human Player & Drive Team',
    title: 'No Throwing Game Pieces at Robots',
    description: 'Standard safety rule preventing HUMAN PLAYERS from targeting ROBOTS with scoring elements.',
    penalty: 'FOUL or Major FOUL depending on severity.',
    isExactText: false,
    note: 'Verify exact wording in current manual.',
  },
  {
    id: 'G432',
    category: 'Human Player & Drive Team',
    title: 'Drive Team Conduct',
    description: 'Governed by G201: All teams must be civil and respectful to everyone and to equipment. Prohibits offensive language, bullying, and harassment.',
    penalty: 'YELLOW CARD; RED CARD for egregious behavior.',
    isExactText: true,
  },
  {
    id: 'G433',
    category: 'Human Player & Drive Team',
    title: 'No External Coaching During Match',
    description: 'Prevents external assistance from the stands or non-DRIVE TEAM members during the match.',
    penalty: 'FOUL or YELLOW CARD.',
    isExactText: false,
    note: 'Verify exact wording in current manual.',
  },
  // 📋 Robot Construction (R101 - R103)
  {
    id: 'R101',
    category: 'Robot Legality',
    title: 'Robot Size Limits',
    description: 'Specifies the maximum horizontal dimensions a ROBOT can have at start of match.',
    penalty: 'Fails inspection; DISABLED if illegal during match.',
    isExactText: false,
    note: 'Verify exact dimensions in current manual.',
  },
  {
    id: 'R102',
    category: 'Robot Legality',
    title: 'Weight Limit',
    description: 'At the time of inspection, the ROBOT must not exceed 150.0 lbs (68.04 kg). This includes all mechanisms and configurations but excludes the OPERATOR CONSOLE and specific exceptions like bumpers.',
    penalty: 'Fails inspection; may not compete until corrected.',
    isExactText: true,
  },
  {
    id: 'R103',
    category: 'Robot Legality',
    title: 'Bumper Requirements',
    description: 'Governs the construction, materials, and placement of bumpers within the BUMPER ZONE.',
    penalty: 'Inspection failure or DISABLED.',
    isExactText: false,
    note: 'Verify exact bumper specifications in current manual.',
  },
  // ⏱️ Match Logistics (G440 - G444)
  {
    id: 'G440',
    category: 'Match Authority & Timing',
    title: 'Referee Calls Are Final',
    description: 'Match results and penalties assigned by referees cannot be contested after the match is finalized.',
    penalty: 'N/A - procedural rule.',
    isExactText: false,
    note: 'Standard procedural rule.',
  },
  {
    id: 'G441',
    category: 'Match Authority & Timing',
    title: 'Match Replay Authority',
    description: 'Governed by section 10.2: Only the Head REFEREE and FTA have the authority to order a MATCH replay for reasons like ARENA faults.',
    penalty: 'N/A - procedural rule.',
    isExactText: true,
  },
  {
    id: 'G442',
    category: 'Match Authority & Timing',
    title: 'Late Arrival',
    description: 'Teams must be staged and ready at the field at their appointed time; failure to do so may result in the match starting without them.',
    penalty: 'Match may start without team; zero contribution.',
    isExactText: false,
    note: 'Verify exact timing requirements in current manual.',
  },
  {
    id: 'G443',
    category: 'Match Authority & Timing',
    title: 'E-Stop Usage',
    description: 'Governs the emergency stop system used to disable a ROBOT if it becomes a safety hazard.',
    penalty: 'ROBOT disabled for remainder of match.',
    isExactText: false,
    note: 'Verify exact E-Stop procedures in current manual.',
  },
  {
    id: 'G444',
    category: 'Match Authority & Timing',
    title: 'Score Correction Window',
    description: 'The specific timeframe in which scoring errors can be addressed before the score becomes official.',
    penalty: 'Missed window = score locked.',
    isExactText: false,
    note: 'Verify exact window timing in current manual.',
  },
];

// Categories for filtering
const CATEGORIES = [
  'All Categories',
  'In-Match Rules',
  'Defense',
  'Protected / Endgame',
  'Human Player & Drive Team',
  'Robot Legality',
  'Match Authority & Timing',
];

// Category icons for visual distinction
const CATEGORY_ICONS = {
  'In-Match Rules': '🤖',
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
        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>📖 FRC 2026 Official Rule Reference</h1>
        <p style={{ fontSize: '1rem', opacity: 0.9, marginBottom: '0.5rem' }}>
          Exact wording from the 2026 REBUILT Game Manual
        </p>
        <p style={{ fontSize: '0.9rem', opacity: 0.7, marginBottom: '1rem' }}>
          ✅ = Exact manual text &nbsp;|&nbsp; 📝 = Summary (verify in manual)
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
                    marginRight: '0.5rem',
                    fontFamily: 'monospace',
                  }}>
                    {rule.id}
                  </span>
                  <span style={{ marginRight: '0.5rem', fontSize: '0.9rem' }} title={rule.isExactText ? 'Exact manual text' : 'Summary - verify in manual'}>
                    {rule.isExactText ? '✅' : '📝'}
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
                <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '0.25rem 0.5rem',
                    backgroundColor: 'var(--primary-light, #fce4ec)',
                    color: 'var(--primary-color, #e91e63)',
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                    fontWeight: '500',
                  }}>
                    {rule.category}
                  </span>
                  <span style={{
                    display: 'inline-block',
                    padding: '0.25rem 0.5rem',
                    backgroundColor: rule.isExactText ? '#e8f5e9' : '#fff8e1',
                    color: rule.isExactText ? '#2e7d32' : '#f57c00',
                    borderRadius: '4px',
                    fontSize: '0.85rem',
                    fontWeight: '500',
                  }}>
                    {rule.isExactText ? '✅ Exact Manual Text' : '📝 Summary'}
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
                {rule.note && (
                  <div style={{
                    padding: '0.5rem 0.75rem',
                    backgroundColor: '#fff8e1',
                    borderLeft: '3px solid #ffc107',
                    borderRadius: '4px',
                    marginBottom: '1rem',
                    fontSize: '0.9rem',
                    fontStyle: 'italic',
                  }}>
                    📌 {rule.note}
                  </div>
                )}
                <div style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: 'var(--warning-bg, #fff3e0)',
                  borderLeft: '4px solid var(--warning-color, #ff9800)',
                  borderRadius: '4px',
                }}>
                  <strong style={{ marginRight: '0.5rem' }}>⚠️ Penalty / Match Impact:</strong>
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
        <p style={{ marginBottom: '0.75rem' }}>
          This page is a reference tool. Referee calls are final. Always defer to the Head Referee and the latest{' '}
          <a
            href="https://firstfrc.blob.core.windows.net/frc2026/Manual/2026GameManual.pdf"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--primary-color, #e91e63)', textDecoration: 'underline' }}
          >Game Manual</a>.
        </p>
        <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>
          <strong>Last Updated:</strong> January 2026 — Based on 2026 REBUILT Game Manual (Team Update Combined)
        </p>
      </footer>
    </>
  );
}

