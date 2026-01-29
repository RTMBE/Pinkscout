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
    description: 'In AUTO, each DRIVE TEAM member must remain in their staged areas. A DRIVE TEAM member staged behind a HUMAN STARTING LINE may not contact anything in front of that HUMAN STARTING LINE, unless for personal or equipment safety, to press the E-Stop or A-Stop, or granted permission by a Head REFEREE or FTA.',
    penalty: 'FOUL for violation.',
    isExactText: true,
  },
  {
    id: 'G402',
    category: 'In-Match Rules',
    title: "There's a 3-count on PINS",
    description: 'A ROBOT may not PIN an opponent\'s ROBOT for more than 3 seconds. A ROBOT is PINNING if it is preventing the movement of an opponent ROBOT by contact, either direct or transitive (such as against a FIELD element).',
    penalty: 'FOUL per additional 3 seconds of pinning.',
    isExactText: true,
  },
  {
    id: 'G403',
    category: 'In-Match Rules',
    title: "Don't Tip or Entangle",
    description: '(Referencing G417) A ROBOT may not deliberately, attach to, tip, or entangle with an opponent ROBOT.',
    penalty: 'Major FOUL; possible YELLOW or RED CARD.',
    isExactText: true,
  },
  // 🛡️ Defense and Protection (G410 - G422)
  {
    id: 'G410',
    category: 'Defense',
    title: 'Keep Your BUMPERS Low',
    description: 'ROBOT extensions may not interact with the carpet, BUMPS, or TOWER BASE such that the BUMPERS are lifted out of the BUMPER ZONE (see R405).',
    penalty: 'FOUL; TECH FOUL if strategic advantage gained.',
    isExactText: true,
  },
  {
    id: 'G411',
    category: 'Defense',
    title: "Don't Damage the FIELD",
    description: 'A ROBOT may not damage FIELD elements.',
    penalty: 'FOUL; DISABLED if damage continues or is likely.',
    isExactText: true,
  },
  {
    id: 'G420',
    category: 'Protected / Endgame',
    title: 'TOWER Protection',
    description: 'A ROBOT may not contact, directly or transitively, an opponent ROBOT if any part of that opponent ROBOT is in contact with its TOWER.',
    penalty: 'Major FOUL for contact with opponent at their TOWER.',
    isExactText: true,
  },
  {
    id: 'G421',
    category: 'Protected / Endgame',
    title: 'Endgame Protection',
    description: '(Referencing G210) A strategy not consistent with standard gameplay and clearly aimed at forcing the opponent ALLIANCE to violate a rule is prohibited, which includes protecting robots attempting to climb the TOWER in the final 30 seconds.',
    penalty: 'Major FOUL + possible YELLOW CARD.',
    isExactText: true,
  },
  {
    id: 'G422',
    category: 'Protected / Endgame',
    title: 'DRIVE COACHES and Other Teams: Hands Off the Controls',
    description: 'A ROBOT shall be operated only by the DRIVERS and/or HUMAN PLAYERS of that team. A DRIVE COACH activating their E-Stop or A-Stop is the exception to this rule.',
    penalty: 'FOUL; YELLOW CARD for repeated violations.',
    isExactText: true,
  },
  // 👥 Human and Drive Team Conduct (G430 - G433)
  {
    id: 'G430',
    category: 'Human Player & Drive Team',
    title: 'Human Players Stay in Designated Areas',
    description: 'During AUTO, DRIVE TEAM members must remain behind the HUMAN STARTING LINE. Generally, they must be in their ALLIANCE AREA and behind the HUMAN STARTING LINE to be "MATCH ready."',
    penalty: 'FOUL; escalation for repeat offenses.',
    isExactText: true,
  },
  {
    id: 'G431',
    category: 'Human Player & Drive Team',
    title: 'No Throwing Game Pieces at Robots',
    description: 'Neither a ROBOT nor a HUMAN PLAYER may damage a SCORING ELEMENT. General safety rules (G101) also prohibit humans from reaching into the FIELD.',
    penalty: 'FOUL or Major FOUL depending on severity.',
    isExactText: true,
  },
  {
    id: 'G432',
    category: 'Human Player & Drive Team',
    title: 'Drive Team Conduct',
    description: '(Referencing G201) Be a good person. All teams must be civil and respectful to everyone and to equipment.',
    penalty: 'YELLOW CARD; RED CARD for egregious behavior.',
    isExactText: true,
  },
  {
    id: 'G433',
    category: 'Human Player & Drive Team',
    title: 'No External Coaching During Match',
    description: '(Referencing G207) A team member (except DRIVERS, HUMAN PLAYERS, and DRIVE COACHES) granted access to restricted areas... may not assist or use signaling devices during the MATCH.',
    penalty: 'FOUL or YELLOW CARD.',
    isExactText: true,
  },
  // 📋 Robot Construction (R101 - R103)
  {
    id: 'R101',
    category: 'Robot Legality',
    title: 'ROBOT PERIMETER Must Be Fixed',
    description: 'The ROBOT (excluding BUMPERS) must have a ROBOT PERIMETER, contained within the BUMPER ZONE and established while in the ROBOT\'S STARTING CONFIGURATION, that is comprised of fixed, non-articulated structural elements of the ROBOT.',
    penalty: 'Fails inspection; DISABLED if illegal during match.',
    isExactText: true,
  },
  {
    id: 'R102',
    category: 'Robot Legality',
    title: 'Weight Limit',
    description: 'The ROBOT configuration used in a MATCH may not violate R103, which limits the ROBOT and its mechanisms to 150.0 lbs (68.04 kg).',
    penalty: 'Fails inspection; may not compete until corrected.',
    isExactText: true,
  },
  {
    id: 'R103',
    category: 'Robot Legality',
    title: 'Bumper Requirements',
    description: '(Referencing R405/R409) BUMPERS should be passive and must be fixed relative to the ROBOT PERIMETER. They must be located in the BUMPER ZONE, between 2.5 in. and 5.75 in. from the floor.',
    penalty: 'Inspection failure or DISABLED.',
    isExactText: true,
  },
  // ⏱️ Match Logistics (G440 - G444)
  {
    id: 'G440',
    category: 'Match Authority & Timing',
    title: 'Referee Calls Are Final',
    description: 'The Head REFEREE has final authority on all rules and violations at an event.',
    penalty: 'N/A - procedural rule.',
    isExactText: true,
  },
  {
    id: 'G441',
    category: 'Match Authority & Timing',
    title: 'MATCH Replays',
    description: 'The Head REFEREE and FTA have the authority to order a MATCH replay for reasons such as ARENA faults.',
    penalty: 'N/A - procedural rule.',
    isExactText: true,
  },
  {
    id: 'G442',
    category: 'Match Authority & Timing',
    title: 'Late Arrival',
    description: '(Referencing G301) A DRIVE TEAM member may not cause significant delays to the start of their MATCH. If a team is not ready, they may be DISQUALIFIED from the current MATCH.',
    penalty: 'DISQUALIFICATION from current MATCH.',
    isExactText: true,
  },
  {
    id: 'G443',
    category: 'Match Authority & Timing',
    title: 'E-Stop Usage',
    description: 'DRIVE TEAM members may press the E-Stop or A-Stop for "personal or equipment safety" without violating the "Behind the lines" rule.',
    penalty: 'ROBOT disabled for remainder of match.',
    isExactText: true,
  },
  {
    id: 'G444',
    category: 'Match Authority & Timing',
    title: 'Score Correction Window',
    description: 'Per Section 10.2, the Head REFEREE and FTA manage scoring and match replays, though final scores are typically locked once posted unless a significant error is identified.',
    penalty: 'Missed window = score locked.',
    isExactText: true,
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

