/**
 * =============================================================================
 * ALLIANCE COMPATIBILITY UTILITY
 * =============================================================================
 *
 * Calculates compatibility scores between teams based on:
 * - Role specialization (shooter, cycler, defense, hybrid)
 * - Auto path diversity (non-conflicting starting positions)
 * - Climb synergy (complementary climb strategies)
 * - Defense balance (optimal defense count)
 *
 * =============================================================================
 */

/**
 * Role compatibility matrix (how well roles work together)
 * Higher score = better compatibility
 */
const ROLE_COMPATIBILITY = {
  Shooter: {
    Shooter: 0.7,    // Multiple shooters can work but less ideal
    Cycler: 1.0,     // Best combo - cycler feeds shooter
    Defense: 0.85,   // Good - defense protects shooter
    Hybrid: 0.85     // Good flexibility
  },
  Cycler: {
    Shooter: 1.0,    // Best combo
    Cycler: 0.75,    // Multiple cyclers possible
    Defense: 0.8,    // Okay - cycler can be disrupted
    Hybrid: 0.9      // Good flexibility
  },
  Defense: {
    Shooter: 0.85,
    Cycler: 0.8,
    Defense: 0.5,    // Two defenders is usually too many
    Hybrid: 0.75
  },
  Hybrid: {
    Shooter: 0.85,
    Cycler: 0.9,
    Defense: 0.75,
    Hybrid: 0.8      // Works but may lack specialization
  }
};

/**
 * Starting position compatibility (for auto paths)
 * Same position = conflict, different = synergy
 */
const STARTING_POSITIONS = ['Left', 'Center', 'Right'];

/**
 * Calculate role compatibility score (0-100)
 * @param {Array} teamRoles - Array of team role objects [{teamNumber, role}]
 * @returns {number} Role compatibility score
 */
export function calculateRoleCompatibility(teamRoles) {
  if (!teamRoles || teamRoles.length < 2) return 100;

  let totalScore = 0;
  let comparisons = 0;

  for (let i = 0; i < teamRoles.length; i++) {
    for (let j = i + 1; j < teamRoles.length; j++) {
      const role1 = teamRoles[i].role || 'Hybrid';
      const role2 = teamRoles[j].role || 'Hybrid';
      totalScore += ROLE_COMPATIBILITY[role1]?.[role2] || 0.8;
      comparisons++;
    }
  }

  return Math.round((totalScore / comparisons) * 100);
}

/**
 * Calculate auto path compatibility (0-100)
 * Different starting positions = higher score
 * @param {Array} teamPositions - Array of {teamNumber, startingPosition}
 * @returns {number} Auto path compatibility score
 */
export function calculateAutoPathCompatibility(teamPositions) {
  if (!teamPositions || teamPositions.length < 2) return 100;

  const positions = teamPositions.map(t => t.startingPosition).filter(Boolean);
  if (positions.length < 2) return 100;

  const uniquePositions = new Set(positions).size;
  const totalTeams = positions.length;

  // Full diversity = 100%, all same = lower score
  // With 3 teams: 3 unique = 100%, 2 unique = 67%, 1 unique = 33%
  return Math.round((uniquePositions / totalTeams) * 100);
}

/**
 * Calculate climb synergy (0-100)
 * Complementary climb strategies = higher score
 * @param {Array} teamClimbs - Array of {teamNumber, climbLevel, climbSuccess}
 * @returns {number} Climb synergy score
 */
export function calculateClimbSynergy(teamClimbs) {
  if (!teamClimbs || teamClimbs.length < 2) return 100;

  // Check for climb diversity (L1, L2, L3)
  const climbs = teamClimbs.map(t => ({
    level: t.climbLevel || 0,
    success: t.climbSuccess || 0
  }));

  // Count climbers at each level
  const levels = climbs.map(c => c.level);
  const l3Count = levels.filter(l => l >= 3).length;
  const l2Count = levels.filter(l => l === 2).length;
  const l1Count = levels.filter(l => l === 1).length;

  // Ideal: mix of climb levels, not all trying same hard climb
  let synergyScore = 100;

  // Penalty for all teams trying L3 (competition for spots)
  if (l3Count === 3) synergyScore -= 15;
  // Bonus for diverse climb levels
  if (l3Count === 1 && l2Count >= 1) synergyScore += 5;

  // Factor in average success rate
  const avgSuccess = climbs.reduce((sum, c) => sum + c.success, 0) / climbs.length;
  synergyScore = synergyScore * (0.7 + 0.3 * (avgSuccess / 100));

  return Math.min(100, Math.max(0, Math.round(synergyScore)));
}

/**
 * Calculate defense balance (0-100)
 * Optimal: 0-1 defenders. 2+ is too many
 * @param {Array} teamRoles - Array of {teamNumber, role, defenseRating}
 * @returns {number} Defense balance score
 */
export function calculateDefenseBalance(teamRoles) {
  if (!teamRoles || teamRoles.length === 0) return 100;

  const defenders = teamRoles.filter(t => 
    t.role === 'Defense' || (t.defenseRating && t.defenseRating >= 3)
  ).length;

  // 0 defenders: okay (full offense)
  // 1 defender: optimal
  // 2+ defenders: suboptimal
  if (defenders === 0) return 90;
  if (defenders === 1) return 100;
  if (defenders === 2) return 70;
  return 50; // 3 defenders
}

/**
 * Calculate overall alliance compatibility score (0-100)
 * Weighted combination of all factors
 * @param {Array} teams - Array of team data objects
 * @returns {Object} { overall, roleCompatibility, autoPath, climbSynergy, defenseBalance, grade }
 */
export function calculateAllianceCompatibility(teams) {
  if (!teams || teams.length < 2) {
    return {
      overall: 0,
      roleCompatibility: 0,
      autoPath: 0,
      climbSynergy: 0,
      defenseBalance: 0,
      grade: 'N/A'
    };
  }

  // Extract relevant data from team objects
  const teamRoles = teams.map(t => ({
    teamNumber: t.teamNumber || t.team_number,
    role: t.role || t.primaryRole || 'Hybrid',
    defenseRating: t.defenseRating || t.defense_rating || 0
  }));

  const teamPositions = teams.map(t => ({
    teamNumber: t.teamNumber || t.team_number,
    startingPosition: t.startingPosition || t.starting_position || t.autoPosition
  }));

  const teamClimbs = teams.map(t => ({
    teamNumber: t.teamNumber || t.team_number,
    climbLevel: t.climbLevel || t.climb_level || t.endgameClimb || 0,
    climbSuccess: t.climbSuccess || t.climb_success || t.climbSuccessRate || 100
  }));

  // Calculate individual scores
  const roleCompatibility = calculateRoleCompatibility(teamRoles);
  const autoPath = calculateAutoPathCompatibility(teamPositions);
  const climbSynergy = calculateClimbSynergy(teamClimbs);
  const defenseBalance = calculateDefenseBalance(teamRoles);

  // Weighted average (role and auto are most important)
  const weights = {
    role: 0.35,
    auto: 0.30,
    climb: 0.20,
    defense: 0.15
  };

  const overall = Math.round(
    roleCompatibility * weights.role +
    autoPath * weights.auto +
    climbSynergy * weights.climb +
    defenseBalance * weights.defense
  );

  // Convert to letter grade
  const grade = getCompatibilityGrade(overall);

  return {
    overall,
    roleCompatibility,
    autoPath,
    climbSynergy,
    defenseBalance,
    grade
  };
}

/**
 * Get letter grade for compatibility score
 * @param {number} score - Compatibility score (0-100)
 * @returns {string} Letter grade with emoji
 */
function getCompatibilityGrade(score) {
  if (score >= 95) return 'S+ 🏆';
  if (score >= 90) return 'A+ ⭐';
  if (score >= 85) return 'A 🌟';
  if (score >= 80) return 'B+ ✨';
  if (score >= 75) return 'B 👍';
  if (score >= 70) return 'C+ 👌';
  if (score >= 65) return 'C 🤔';
  if (score >= 55) return 'D 😬';
  return 'F ❌';
}

/**
 * Get compatibility breakdown description
 * @param {Object} compatibility - Result from calculateAllianceCompatibility
 * @returns {Array} Array of {label, value, status} for display
 */
export function getCompatibilityBreakdown(compatibility) {
  const getStatus = (score) => {
    if (score >= 85) return 'excellent';
    if (score >= 70) return 'good';
    if (score >= 55) return 'okay';
    return 'poor';
  };

  return [
    {
      label: 'Role Synergy',
      value: compatibility.roleCompatibility,
      status: getStatus(compatibility.roleCompatibility),
      icon: '🎯'
    },
    {
      label: 'Auto Diversity',
      value: compatibility.autoPath,
      status: getStatus(compatibility.autoPath),
      icon: '🚗'
    },
    {
      label: 'Climb Synergy',
      value: compatibility.climbSynergy,
      status: getStatus(compatibility.climbSynergy),
      icon: '🧗'
    },
    {
      label: 'Defense Balance',
      value: compatibility.defenseBalance,
      status: getStatus(compatibility.defenseBalance),
      icon: '🛡️'
    }
  ];
}

