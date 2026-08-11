/**
 * Authenticated client for PinkScout's allowlisted competition-data gateway.
 *
 * Provider credentials never belong in browser code.  The Vercel function
 * validates the user's Supabase access token, validates every operation and
 * parameter, and applies the authoritative upstream cache/rate limits.
 */

import { supabase } from './supabase';

function requestError(response, payload) {
  const message = typeof payload?.error === 'string'
    ? payload.error
    : `Competition data request failed (${response.status})`;
  return new Error(message);
}

/**
 * Retrieve an allowlisted competition-data response through the same-origin
 * API. This intentionally accepts an operation name rather than a URL.
 *
 * @param {'tba'|'statbotics'} provider
 * @param {string} operation
 * @param {Record<string, string|number|undefined|null>} params
 * @returns {Promise<unknown>}
 */
export async function getCompetitionData(provider, operation, params = {}) {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw new Error('Please sign in to load competition data.');
  }

  const query = new URLSearchParams({ provider, op: operation });
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      query.set(key, String(value));
    }
  }

  let response;
  try {
    response = await fetch(`/api/competition?${query.toString()}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${session.access_token}`
      }
    });
  } catch {
    throw new Error('Competition data service is unavailable. Check your connection and try again.');
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Keep the user-facing failure generic; upstream details must not be
    // reflected by the browser gateway.
  }

  if (!response.ok) {
    throw requestError(response, payload);
  }

  return payload?.data;
}
