/**
 * =============================================================================
 * EXTERNAL DATA MODULE - FRC Scouting App (Pinkscout)
 * =============================================================================
 *
 * This module handles integration with external FRC data sources:
 * 1. The Blue Alliance (TBA) - Official FRC match data, team lists, events
 * 2. Statbotics - Advanced team performance metrics (OPR, EPA, etc.)
 * 3. FRC Nexus - Additional statistical analysis and percentiles
 *
 * CACHING STRATEGY:
 * - External API calls are cached in Firestore with TTL (Time To Live)
 * - Also uses sessionStorage for immediate page performance
 *
 * =============================================================================
 */

// =============================================================================
// API CONFIGURATION - REPLACE THESE WITH YOUR ACTUAL KEYS!
// =============================================================================

// TBA: Get your key at https://www.thebluealliance.com/account
const TBA_API_KEY = 'bGxLkGYmh9cBfFpmYIe2M09qv2wiV86KzjxiUi26VivhkyguchrZkWkNFEDXPrYU';
const TBA_BASE_URL = 'https://www.thebluealliance.com/api/v3';

// Statbotics: Public API - no key needed!
const STATBOTICS_BASE_URL = 'https://api.statbotics.io/v3';

// FRC Nexus: Request access at https://frc.nexus/
const NEXUS_API_KEY = 'RWxNTz7HLOYxRPwWdwVND193vyk';
const NEXUS_BASE_URL = 'https://frc.nexus/api/v1';

// Cache TTL in ms
const CACHE_TTL = {
  EVENTS: 3600000,   // 1 hour
  TEAMS: 900000,     // 15 min
  MATCHES: 300000,   // 5 min
  RANKINGS: 600000   // 10 min
};

// =============================================================================
// IMPORTS
// =============================================================================

import { db } from './firebase.js';
import {
  collection, doc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// =============================================================================
// SESSION STORAGE CACHE
// =============================================================================

function getSessionCache(key) {
  try {
    const item = sessionStorage.getItem(`ext_${key}`);
    if (!item) return null;
    const { data, expiry } = JSON.parse(item);
    if (Date.now() > expiry) { sessionStorage.removeItem(`ext_${key}`); return null; }
    return data;
  } catch { return null; }
}

function setSessionCache(key, data, ttl) {
  try {
    sessionStorage.setItem(`ext_${key}`, JSON.stringify({ data, expiry: Date.now() + ttl }));
  } catch { /* ignore */ }
}

// =============================================================================
// FIRESTORE CACHE
// =============================================================================

async function getFirestoreCache(source, cacheKey, ttl) {
  try {
    const ref = doc(db, 'external', source, 'cache', cacheKey);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const d = snap.data();
    const age = Date.now() - (d.fetchedAt?.toDate?.()?.getTime() || 0);
    return age > ttl ? null : d.data;
  } catch { return null; }
}

async function setFirestoreCache(source, cacheKey, data) {
  try {
    const ref = doc(db, 'external', source, 'cache', cacheKey);
    await setDoc(ref, { data, fetchedAt: serverTimestamp() });
  } catch { /* ignore */ }
}

// =============================================================================
// TBA API - https://www.thebluealliance.com/apidocs/v3
// =============================================================================

async function fetchTBA(endpoint) {
  if (TBA_API_KEY.includes('PASTE')) { console.warn('TBA key not set'); return null; }
  try {
    const r = await fetch(`${TBA_BASE_URL}${endpoint}`, {
      headers: { 'X-TBA-Auth-Key': TBA_API_KEY }
    });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (e) { console.error('TBA error:', e); return null; }
}

export async function getTBAEvents(year) {
  const k = `tba_events_${year}`;
  let d = getSessionCache(k) || await getFirestoreCache('tba', k, CACHE_TTL.EVENTS);
  if (!d) { d = await fetchTBA(`/events/${year}`); if (d) await setFirestoreCache('tba', k, d); }
  if (d) setSessionCache(k, d, CACHE_TTL.EVENTS);
  return d || [];
}

export async function getTBAEventDetails(eventKey) {
  const k = `tba_ev_${eventKey}`;
  let d = getSessionCache(k) || await getFirestoreCache('tba', k, CACHE_TTL.EVENTS);
  if (!d) { d = await fetchTBA(`/event/${eventKey}`); if (d) await setFirestoreCache('tba', k, d); }
  if (d) setSessionCache(k, d, CACHE_TTL.EVENTS);
  return d;
}

export async function getTBAEventTeams(eventKey) {
  const k = `tba_teams_${eventKey}`;
  let d = getSessionCache(k) || await getFirestoreCache('tba', k, CACHE_TTL.EVENTS);
  if (!d) { d = await fetchTBA(`/event/${eventKey}/teams`); if (d) await setFirestoreCache('tba', k, d); }
  if (d) setSessionCache(k, d, CACHE_TTL.EVENTS);
  return d || [];
}

export async function getTBAEventMatches(eventKey) {
  const k = `tba_matches_${eventKey}`;
  let d = getSessionCache(k) || await getFirestoreCache('tba', k, CACHE_TTL.MATCHES);
  if (!d) { d = await fetchTBA(`/event/${eventKey}/matches`); if (d) await setFirestoreCache('tba', k, d); }
  if (d) setSessionCache(k, d, CACHE_TTL.MATCHES);
  return d || [];
}

export async function getTBAEventRankings(eventKey) {
  const k = `tba_rank_${eventKey}`;
  let d = getSessionCache(k) || await getFirestoreCache('tba', k, CACHE_TTL.RANKINGS);
  if (!d) { d = await fetchTBA(`/event/${eventKey}/rankings`); if (d) await setFirestoreCache('tba', k, d); }
  if (d) setSessionCache(k, d, CACHE_TTL.RANKINGS);
  return d;
}

export async function getTBATeam(teamNum) {
  const k = `tba_team_${teamNum}`;
  let d = getSessionCache(k) || await getFirestoreCache('tba', k, CACHE_TTL.TEAMS);
  if (!d) { d = await fetchTBA(`/team/frc${teamNum}`); if (d) await setFirestoreCache('tba', k, d); }
  if (d) setSessionCache(k, d, CACHE_TTL.TEAMS);
  return d;
}

// =============================================================================
// STATBOTICS API - https://api.statbotics.io/
// Provides OPR, EPA (Expected Points Added), and other advanced metrics
// =============================================================================

async function fetchStatbotics(endpoint) {
  try {
    const r = await fetch(`${STATBOTICS_BASE_URL}${endpoint}`);
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (e) { console.error('Statbotics error:', e); return null; }
}

/**
 * Get team stats from Statbotics for a specific year
 * Returns: { epa, opr, dpr, ccwm, norm_epa, ... }
 */
export async function getStatboticsTeam(teamNum, year = new Date().getFullYear()) {
  const k = `sb_team_${teamNum}_${year}`;
  let d = getSessionCache(k) || await getFirestoreCache('statbotics', k, CACHE_TTL.TEAMS);
  if (!d) {
    d = await fetchStatbotics(`/team_year/${teamNum}/${year}`);
    if (d) await setFirestoreCache('statbotics', k, d);
  }
  if (d) setSessionCache(k, d, CACHE_TTL.TEAMS);
  return d;
}

/**
 * Get all team stats for an event
 */
export async function getStatboticsEventTeams(eventKey) {
  const k = `sb_ev_teams_${eventKey}`;
  let d = getSessionCache(k) || await getFirestoreCache('statbotics', k, CACHE_TTL.TEAMS);
  if (!d) {
    d = await fetchStatbotics(`/team_events?event=${eventKey}`);
    if (d) await setFirestoreCache('statbotics', k, d);
  }
  if (d) setSessionCache(k, d, CACHE_TTL.TEAMS);
  return d || [];
}

/**
 * Get match predictions for an event
 */
export async function getStatboticsMatches(eventKey) {
  const k = `sb_matches_${eventKey}`;
  let d = getSessionCache(k) || await getFirestoreCache('statbotics', k, CACHE_TTL.MATCHES);
  if (!d) {
    d = await fetchStatbotics(`/matches?event=${eventKey}`);
    if (d) await setFirestoreCache('statbotics', k, d);
  }
  if (d) setSessionCache(k, d, CACHE_TTL.MATCHES);
  return d || [];
}

// =============================================================================
// FRC NEXUS API - https://frc.nexus/
// Provides live scoring and field status data
// =============================================================================

async function fetchNexus(endpoint) {
  if (NEXUS_API_KEY.includes('PASTE')) { console.warn('Nexus key not set'); return null; }
  try {
    const r = await fetch(`${NEXUS_BASE_URL}${endpoint}`, {
      headers: { 'Authorization': `Bearer ${NEXUS_API_KEY}` }
    });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (e) { console.error('Nexus error:', e); return null; }
}

/**
 * Get live event data from FRC Nexus
 */
export async function getNexusEventStatus(eventKey) {
  const k = `nexus_status_${eventKey}`;
  let d = getSessionCache(k) || await getFirestoreCache('nexus', k, CACHE_TTL.MATCHES);
  if (!d) {
    d = await fetchNexus(`/event/${eventKey}/status`);
    if (d) await setFirestoreCache('nexus', k, d);
  }
  if (d) setSessionCache(k, d, CACHE_TTL.MATCHES);
  return d;
}

/**
 * Get match announcements/predictions
 */
export async function getNexusAnnouncements(eventKey) {
  const k = `nexus_ann_${eventKey}`;
  let d = getSessionCache(k) || await getFirestoreCache('nexus', k, CACHE_TTL.MATCHES);
  if (!d) {
    d = await fetchNexus(`/event/${eventKey}/announcements`);
    if (d) await setFirestoreCache('nexus', k, d);
  }
  if (d) setSessionCache(k, d, CACHE_TTL.MATCHES);
  return d || [];
}

// =============================================================================
// SYNC ALL EXTERNAL DATA FOR A TEAM
// Combines data from all sources into one object
// =============================================================================

export async function syncAllTeamData(teamNum, year = new Date().getFullYear()) {
  const [tba, statbotics] = await Promise.all([
    getTBATeam(teamNum),
    getStatboticsTeam(teamNum, year)
  ]);

  return {
    teamNumber: teamNum,
    tba: tba || {},
    statbotics: statbotics || {},
    fetchedAt: new Date().toISOString()
  };
}

// =============================================================================
// SYNC ALL EVENT DATA
// =============================================================================

export async function syncAllEventData(eventKey) {
  const [details, teams, matches, rankings, statboticsTeams] = await Promise.all([
    getTBAEventDetails(eventKey),
    getTBAEventTeams(eventKey),
    getTBAEventMatches(eventKey),
    getTBAEventRankings(eventKey),
    getStatboticsEventTeams(eventKey)
  ]);

  return {
    eventKey,
    details: details || {},
    teams: teams || [],
    matches: matches || [],
    rankings: rankings || {},
    statbotics: statboticsTeams || [],
    fetchedAt: new Date().toISOString()
  };
}

// =============================================================================
// CHECK API STATUS
// =============================================================================

export async function checkAPIStatus() {
  const results = { tba: false, statbotics: false, nexus: false };

  try {
    const tba = await fetchTBA('/status');
    results.tba = !!tba;
  } catch {}

  try {
    const sb = await fetchStatbotics('/');
    results.statbotics = !!sb;
  } catch {}

  try {
    const nx = await fetchNexus('/status');
    results.nexus = !!nx;
  } catch {}

  return results;
}

