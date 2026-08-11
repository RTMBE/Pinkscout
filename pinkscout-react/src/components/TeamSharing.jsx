/**
 * Cross-team sharing is intentionally unavailable until the database migration
 * and server-side, sanitized aggregate sharing API are deployed.
 */
export default function TeamSharing() {
  return (
    <div className="content-card" style={{ marginBottom: '1.5rem' }}>
      <h2 style={{ marginBottom: '0.75rem' }}>🔒 Team Data Sharing</h2>
      <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
        Cross-team sharing is paused while PinkScout moves to team-scoped,
        auditable permissions. Your raw scouting records remain visible only to
        your own team.
      </p>
    </div>
  );
}
