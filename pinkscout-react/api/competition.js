import { createClient } from '@supabase/supabase-js';

/**
 * Authenticated, allowlisted gateway for public FRC competition data.
 *
 * TBA credentials must exist only in Vercel environment variables.  Do not
 * turn this into a generic URL proxy: every permitted upstream operation is
 * explicitly defined below.
 */

const TBA_BASE_URL = 'https://www.thebluealliance.com/api/v3';
const STATBOTICS_BASE_URL = 'https://api.statbotics.io/v3';
const MAX_RESPONSE_BYTES = 1_500_000;
const REQUEST_TIMEOUT_MS = 8_000;
const DEFAULT_RATE_LIMIT = 90;
const SEARCH_RATE_LIMIT = 5;
const ALLOWED_QUERY_KEYS = new Set(['provider', 'op', 'year', 'teamNumber', 'eventKey', 'limit', 'query']);

const responseCache = new Map();
const requestWindows = new Map();
let authClient;

function serverSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  return { url, key };
}

function getAuthClient() {
  if (authClient) return authClient;

  const { url, key } = serverSupabaseConfig();

  authClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return authClient;
}

function requestScopedSupabase(token) {
  const { url, key } = serverSupabaseConfig();
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
}

function json(res, status, body, headers = {}) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization, Origin');
  for (const [name, value] of Object.entries(headers)) {
    res.setHeader(name, value);
  }
  res.status(status).json(body);
}

function getRequestOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  return host ? `${protocol}://${host}` : null;
}

function hasAllowedOrigin(req) {
  const origin = req.headers.origin;
  return !origin || origin === getRequestOrigin(req);
}

function requireString(value, field, maxLength = 64) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function requireYear(value) {
  const year = Number(value);
  const currentYear = new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 1992 || year > currentYear + 1) {
    throw new Error('Invalid year');
  }
  return year;
}

function requireTeamNumber(value) {
  const teamNumber = Number(value);
  if (!Number.isInteger(teamNumber) || teamNumber < 1 || teamNumber > 99999) {
    throw new Error('Invalid team number');
  }
  return teamNumber;
}

function requireEventKey(value) {
  const eventKey = requireString(value, 'event key', 32).toLowerCase();
  if (!/^\d{4}[a-z0-9]+$/.test(eventKey)) {
    throw new Error('Invalid event key');
  }
  return eventKey;
}

function requireLimit(value, fallback = 20) {
  if (value === undefined) return fallback;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('Invalid limit');
  }
  return limit;
}

function requireSafeQueryShape(query) {
  for (const [key, value] of Object.entries(query)) {
    // Unknown and repeated parameters are rejected before a cache lookup. This
    // keeps an allowlisted request from becoming an unbounded cache-key space.
    if (!ALLOWED_QUERY_KEYS.has(key) || Array.isArray(value) || typeof value !== 'string') {
      throw new Error('Invalid request parameter');
    }
  }
}

function endpoint(provider, operation, query) {
  const year = () => requireYear(query.year);
  const team = () => requireTeamNumber(query.teamNumber);
  const event = () => requireEventKey(query.eventKey);

  if (provider === 'tba') {
    switch (operation) {
      case 'events': return { url: `${TBA_BASE_URL}/events/${year()}`, ttl: 60 * 60 };
      case 'event': return { url: `${TBA_BASE_URL}/event/${event()}`, ttl: 5 * 60 };
      case 'eventTeams': return { url: `${TBA_BASE_URL}/event/${event()}/teams`, ttl: 30 * 60 };
      case 'eventMatches': return { url: `${TBA_BASE_URL}/event/${event()}/matches`, ttl: 15 };
      case 'eventRankings': return { url: `${TBA_BASE_URL}/event/${event()}/rankings`, ttl: 30 };
      case 'eventAwards': return { url: `${TBA_BASE_URL}/event/${event()}/awards`, ttl: 30 * 60 };
      case 'team': return { url: `${TBA_BASE_URL}/team/frc${team()}`, ttl: 6 * 60 * 60 };
      case 'teamEvents': return { url: `${TBA_BASE_URL}/team/frc${team()}/events/${year()}`, ttl: 60 * 60 };
      case 'teamEventMatches': return { url: `${TBA_BASE_URL}/team/frc${team()}/event/${event()}/matches`, ttl: 15 };
      case 'teamAwardsForYear': return { url: `${TBA_BASE_URL}/team/frc${team()}/awards/${year()}`, ttl: 6 * 60 * 60 };
      case 'teamAllAwards': return { url: `${TBA_BASE_URL}/team/frc${team()}/awards`, ttl: 24 * 60 * 60 };
      case 'teamMatchesForYear': return { url: `${TBA_BASE_URL}/team/frc${team()}/matches/${year()}`, ttl: 60 * 60 };
      case 'teamYearsParticipated': return { url: `${TBA_BASE_URL}/team/frc${team()}/years_participated`, ttl: 24 * 60 * 60 };
      case 'status': return { url: `${TBA_BASE_URL}/status`, ttl: 60 };
      default: throw new Error('Unsupported operation');
    }
  }

  if (provider === 'statbotics') {
    switch (operation) {
      case 'team': return { url: `${STATBOTICS_BASE_URL}/team/${team()}`, ttl: 30 * 60 };
      case 'teamEvent': return { url: `${STATBOTICS_BASE_URL}/team_event/${team()}/${event()}`, ttl: 5 * 60 };
      case 'eventTeamStats': return { url: `${STATBOTICS_BASE_URL}/team_events?event=${encodeURIComponent(event())}`, ttl: 10 * 60 };
      case 'teamYear': return { url: `${STATBOTICS_BASE_URL}/team_year/${team()}/${year()}`, ttl: 60 * 60 };
      case 'topTeams': {
        const limit = requireLimit(query.limit);
        return {
          url: `${STATBOTICS_BASE_URL}/team_years?year=${year()}&limit=${limit}&metric=epa_end&ascending=false`,
          ttl: 30 * 60
        };
      }
      default: throw new Error('Unsupported operation');
    }
  }

  throw new Error('Unsupported provider');
}

async function fetchJson(url, headers) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', ...headers },
      redirect: 'error',
      signal: controller.signal
    });

    if (response.status === 404) return { status: 404, data: null };
    if (response.status === 429) return { status: 429, data: null };
    if (!response.ok) return { status: 502, data: null };

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_RESPONSE_BYTES) return { status: 502, data: null };

    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) return { status: 502, data: null };
    return { status: 200, data: JSON.parse(text) };
  } catch (error) {
    return { status: error.name === 'AbortError' ? 504 : 502, data: null };
  } finally {
    clearTimeout(timeout);
  }
}

function consumeInMemoryRateLimit(userId, operation) {
  const now = Date.now();
  const bucketKey = `${userId}:${operation}`;
  const max = operation === 'searchTeams' ? SEARCH_RATE_LIMIT : DEFAULT_RATE_LIMIT;
  const windowStart = Math.floor(now / 60_000) * 60_000;

  // The Redis limiter is durable when configured. Keep the outage fallback
  // bounded as well: expired per-user windows have no value after one minute.
  if (requestWindows.size >= 2_000) {
    for (const [key, value] of requestWindows) {
      if (value.windowStart !== windowStart) requestWindows.delete(key);
      if (requestWindows.size < 1_000) break;
    }
  }

  const current = requestWindows.get(bucketKey);

  if (!current || current.windowStart !== windowStart) {
    requestWindows.set(bucketKey, { windowStart, count: 1 });
    return { allowed: true };
  }

  if (current.count >= max) {
    return { allowed: false, retryAfter: Math.ceil((windowStart + 60_000 - now) / 1000) };
  }

  current.count += 1;
  return { allowed: true };
}

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

async function redisCommand(command) {
  const config = redisConfig();
  if (!config) return undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(command),
      signal: controller.signal
    });
    if (!response.ok) return undefined;
    const payload = await response.json();
    return payload?.result;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

function redisKey(namespace, key) {
  return `pinkscout:competition:${namespace}:${encodeURIComponent(key)}`;
}

async function consumeRateLimit(userId, operation) {
  const now = Date.now();
  const max = operation === 'searchTeams' ? SEARCH_RATE_LIMIT : DEFAULT_RATE_LIMIT;
  const windowStart = Math.floor(now / 60_000) * 60_000;
  const key = redisKey('rate', `${userId}:${operation}:${windowStart}`);
  const count = Number(await redisCommand(['INCR', key]));

  if (Number.isInteger(count) && count >= 1) {
    if (count === 1) await redisCommand(['EXPIRE', key, 60]);
    if (count <= max) return { allowed: true };
    return { allowed: false, retryAfter: Math.ceil((windowStart + 60_000 - now) / 1000) };
  }

  // Redis is recommended for cross-instance enforcement. Preserve a local
  // backstop during an outage instead of turning the gateway into an open proxy.
  return consumeInMemoryRateLimit(userId, operation);
}

function rememberCache(key, record) {
  if (responseCache.size >= 500) {
    const now = Date.now();
    for (const [cacheKey, value] of responseCache) {
      if (value.staleAt <= now || responseCache.size >= 500) responseCache.delete(cacheKey);
    }
  }
  responseCache.set(key, record);
}

async function getCachedResponse(key) {
  const local = responseCache.get(key);
  if (local) return local;

  const raw = await redisCommand(['GET', redisKey('cache', key)]);
  if (typeof raw !== 'string') return null;
  try {
    const record = JSON.parse(raw);
    if (!record || typeof record.expiresAt !== 'number' || typeof record.staleAt !== 'number') return null;
    if (record.staleAt <= Date.now()) return null;
    rememberCache(key, record);
    return record;
  } catch {
    return null;
  }
}

async function cacheResponse(key, data, ttlSeconds, staleSeconds = 24 * 60 * 60) {
  const now = Date.now();
  const record = {
    data,
    expiresAt: now + ttlSeconds * 1000,
    staleAt: now + staleSeconds * 1000
  };
  rememberCache(key, record);

  const serialized = JSON.stringify(record);
  // Avoid unexpectedly large Redis values; the in-instance cache remains a
  // bounded fallback for unusually large upstream responses.
  if (serialized.length <= 900_000) {
    await redisCommand([
      'SET',
      redisKey('cache', key),
      serialized,
      'EX',
      Math.max(1, Math.ceil(staleSeconds))
    ]);
  }
  return record;
}

function cacheKey(provider, operation, canonicalUrl) {
  // The URL is built only from validated, normalized endpoint arguments. Never
  // include raw browser query data in a provider cache key.
  return `${provider}:${operation}:${canonicalUrl}`;
}

function validateTeamSearchRequest(query) {
  requireYear(query.year || new Date().getUTCFullYear());
  requireString(query.query, 'search query', 50);
}

async function getTeamSearchIndex(year, tbaHeaders) {
  const key = `tba:team-search-index:${year}`;
  const cached = await getCachedResponse(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const pages = await Promise.all(
    Array.from({ length: 20 }, (_, page) => fetchJson(`${TBA_BASE_URL}/teams/${year}/${page}`, tbaHeaders))
  );
  const data = pages.flatMap((page) => page.status === 200 && Array.isArray(page.data) ? page.data : []);
  if (data.length === 0) throw new Error('Unable to load team search index');

  await cacheResponse(key, data, 24 * 60 * 60, 48 * 60 * 60);
  return data;
}

function searchTeams(teams, query) {
  const needle = requireString(query, 'search query', 50).trim().toLowerCase();
  if (needle.length < 1) throw new Error('Invalid search query');
  const numeric = /^\d+$/.test(needle);

  return teams
    .map((team) => {
      const teamNumber = String(team.team_number || '').trim();
      const nickname = String(team.nickname || '');
      const normalizedName = nickname.toLowerCase();
      let score = 0;

      if (numeric) {
        if (teamNumber === needle) score = 100;
        else if (teamNumber.startsWith(needle)) score = 80;
        else if (teamNumber.includes(needle)) score = 60;
      } else if (normalizedName === needle) score = 90;
      else if (normalizedName.startsWith(needle)) score = 70;
      else if (normalizedName.includes(needle)) score = 50;

      return score > 0 ? { teamNumber, nickname, score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || Number(a.teamNumber) - Number(b.teamNumber))
    .slice(0, 10);
}

function bearerToken(req) {
  return req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1] || null;
}

async function authenticatedUser(token) {
  if (!token) return null;

  const { data, error } = await getAuthClient().auth.getUser(token);
  return error ? null : data.user;
}

async function membershipContext(token) {
  const { data, error } = await requestScopedSupabase(token).rpc('get_my_team');
  return error ? null : data;
}

export default async function handler(req, res) {
  if (!hasAllowedOrigin(req)) {
    return json(res, 403, { error: 'Forbidden' });
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, OPTIONS' });

  // Reject malformed and unsupported requests before they cause an Auth or
  // membership round trip. These values also become the only possible rate
  // bucket names later in the request.
  const provider = typeof req.query.provider === 'string' ? req.query.provider : '';
  const operation = typeof req.query.op === 'string' ? req.query.op : '';
  let target;
  try {
    requireSafeQueryShape(req.query);
    if (provider === 'tba' && operation === 'searchTeams') {
      validateTeamSearchRequest(req.query);
    } else {
      target = endpoint(provider, operation, req.query);
    }
  } catch {
    return json(res, 400, { error: 'Invalid competition data request' });
  }

  const token = bearerToken(req);
  let user;
  try {
    user = await authenticatedUser(token);
  } catch {
    return json(res, 503, { error: 'Competition data service is unavailable' });
  }
  if (!user) return json(res, 401, { error: 'Authentication required' });

  try {
    const context = await membershipContext(token);
    if (!context?.team_id && context?.is_platform_admin !== true) {
      return json(res, 403, { error: 'Active team membership required' });
    }
  } catch {
    return json(res, 503, { error: 'Competition data service is unavailable' });
  }

  const limit = await consumeRateLimit(user.id, operation);
  if (!limit.allowed) {
    return json(res, 429, { error: 'Too many requests' }, { 'Retry-After': String(limit.retryAfter) });
  }

  const tbaHeaders = process.env.TBA_API_KEY ? { 'X-TBA-Auth-Key': process.env.TBA_API_KEY } : null;
  if (provider === 'tba' && !tbaHeaders) {
    return json(res, 503, { error: 'Competition data service is unavailable' });
  }

  try {
    if (provider === 'tba' && operation === 'searchTeams') {
      const year = requireYear(req.query.year || new Date().getUTCFullYear());
      const teams = await getTeamSearchIndex(year, tbaHeaders);
      return json(res, 200, { data: searchTeams(teams, req.query.query), meta: { source: 'tba', cached: false } });
    }

    const key = cacheKey(provider, operation, target.url);
    const cached = await getCachedResponse(key);
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      return json(res, 200, { data: cached.data, meta: { source: provider, cached: true } });
    }

    const result = await fetchJson(target.url, provider === 'tba' ? tbaHeaders : undefined);
    if (result.status === 200) {
      await cacheResponse(key, result.data, target.ttl);
      return json(res, 200, { data: result.data, meta: { source: provider, cached: false } });
    }

    if (cached && cached.staleAt > now) {
      return json(res, 200, { data: cached.data, meta: { source: provider, cached: true, stale: true } });
    }
    if (result.status === 404) return json(res, 404, { error: 'Not found' });
    if (result.status === 429) return json(res, 429, { error: 'Competition source rate limited' });
    return json(res, result.status, { error: 'Competition data service is unavailable' });
  } catch {
    return json(res, 400, { error: 'Invalid competition data request' });
  }
}
