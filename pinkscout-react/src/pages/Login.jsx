/**
 * =============================================================================
 * LOGIN.JSX - Authentication Page Component
 * =============================================================================
 * 
 * WHAT IS THIS PAGE?
 * Handles user authentication:
 * - Sign In: Email + Password for existing users
 * - Sign Up: Email + Password + Confirm + Username + secure invite token
 * 
 * ON SUCCESS:
 * - Auth trigger creates a minimal profile; team membership is server-managed
 * - Redirects to dashboard
 * 
 * NO SIDEBAR:
 * This page renders without the sidebar for a clean auth experience
 * 
 * =============================================================================
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  // ==========================================================================
  // STATE
  // ==========================================================================
  
  // Toggle between sign-in and sign-up modes
  const [isLoginMode, setIsLoginMode] = useState(true);

  // Account type: 'member' (default) or 'teamLead'
  const [accountType, setAccountType] = useState('member');

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [username, setUsername] = useState('');
  const [signupCode, setSignupCode] = useState('');
  const [teamNumber, setTeamNumber] = useState('');

  // UI state
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [postAuthRoute, setPostAuthRoute] = useState(null);
  
  // Hooks
  const { user, login, signup, signInWithGoogle, signInWithDiscord, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // ==========================================================================
  // REDIRECT IF ALREADY LOGGED IN
  // ==========================================================================

  useEffect(() => {
    // Only redirect after auth state is determined (not during loading)
    if (!authLoading && user) {
      navigate(postAuthRoute || '/dashboard', { replace: true });
    }
  }, [user, authLoading, postAuthRoute, navigate]);

  // ==========================================================================
  // SHOW LOADING WHILE AUTH STATE IS BEING DETERMINED
  // ==========================================================================
  // This prevents blank page when duplicating tabs

  if (authLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  // ==========================================================================
  // TOGGLE MODE HANDLER
  // ==========================================================================
  
  const toggleMode = () => {
    setIsLoginMode(!isLoginMode);
    setAccountType('member'); // Reset to member when toggling
    setPostAuthRoute(null);
    setError('');
    setSuccess('');
  };

  // ==========================================================================
  // FORM SUBMISSION HANDLER
  // ==========================================================================

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (isLoginMode) {
        // ====== SIGN IN ======
        setPostAuthRoute('/dashboard');
        await login(email, password);
        // Navigation handled by useEffect above

      } else {
        // ====== SIGN UP ======

        // Validate passwords match
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }

        // Validate password length
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }

        // Validate username
        if (username.length < 2) {
          throw new Error('Username must be at least 2 characters.');
        }

        const isTeamLead = accountType === 'teamLead';
        setPostAuthRoute(isTeamLead ? '/profile' : '/dashboard');

        // Signup with appropriate account type
        const result = await signup(
          email,
          password,
          username,
          signupCode,
          teamNumber || null,
          isTeamLead
        );

        if (result.requiresEmailConfirmation) {
          setSuccess(isTeamLead
            ? 'Account created. Confirm your email, then sign in to finish creating your team and set up MFA before inviting scouts.'
            : 'Account created. Confirm your email, then sign in to finish joining your team.');
        } else {
          setSuccess(isTeamLead
            ? 'Team created. Redirecting to set up manager MFA...'
            : 'Account created! Redirecting...');

          // Short delay to show success
          setTimeout(() => {
            navigate(isTeamLead ? '/profile' : '/dashboard', { replace: true });
          }, 1000);
        }
      }
    } catch (err) {
      // Convert Supabase error codes to user-friendly messages
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // ==========================================================================
  // ERROR MESSAGE HELPER
  // ==========================================================================
  
  const getErrorMessage = (error) => {
    const code = error.code || '';
    const message = error.message || '';

    // Check for rate limiting errors (Supabase returns these in various formats)
    if (message.includes('rate limit') ||
        message.includes('email rate limit') ||
        message.includes('Too many signup') ||
        error.status === 429) {
      return 'Email rate limit reached. Please wait 5-10 minutes and try again. If you continue to have issues, contact your team lead.';
    }

    // Check for "already exists" errors
    if (message.includes('already registered') ||
        message.includes('already exists') ||
        code === 'auth/email-already-in-use') {
      return 'An account with this email already exists. Please sign in instead.';
    }

    switch (code) {
      case 'auth/user-not-found':
        return 'No account found with this email.';
      case 'auth/wrong-password':
        return 'Incorrect password.';
      case 'auth/weak-password':
        return 'Password should be at least 6 characters.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/invalid-credential':
        return 'Invalid email or password.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later.';
      default:
        return message || 'An error occurred. Please try again.';
    }
  };

  // ==========================================================================
  // GOOGLE SIGN IN HANDLER
  // ==========================================================================

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithGoogle();
      // Note: User will be redirected by OAuth flow
    } catch (err) {
      setError(err.message || 'Failed to sign in with Google. Please try again.');
      setLoading(false);
    }
  };

  // ==========================================================================
  // DISCORD SIGN IN HANDLER
  // ==========================================================================

  const handleDiscordSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      await signInWithDiscord();
      // Note: User will be redirected by OAuth flow
    } catch (err) {
      setError(err.message || 'Failed to sign in with Discord. Please try again.');
      setLoading(false);
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  
  return (
    <>
      {/* SEO Meta Tags */}
      <Helmet>
        <title>Login - PinkScout | FRC Team Scouting Tool</title>
        <meta name="description" content="PinkScout - Official scouting application for FIRST Robotics Competition teams. Securely track match data and team performance." />
      </Helmet>

      <div className="auth-container">
        <div className="auth-card auth-card-large">
          {/* Security Badge */}
          <div className="security-badge">
            🔒 Secure Login • Powered by Supabase Authentication
          </div>

          {/* Header */}
          <div className="auth-header">
            <h1>🤖 PinkScout</h1>
            <p className="auth-subtitle">
              <strong>FIRST Robotics Competition Scouting Tool</strong>
            </p>
            <p className="auth-description">
              {isLoginMode
                ? 'Sign in to access your team\'s scouting dashboard'
                : 'Create a team account to start scouting matches'}
            </p>
          </div>

          {/* FRC Disclaimer */}
          <div className="frc-notice">
            <span className="frc-icon">🤖</span>
            <span>Built for FRC teams to track robot performance at competitions</span>
          </div>

          {/* Success Message */}
          {success && <div className="auth-success show">{success}</div>}

          {/* Error Message */}
          {error && <div className="auth-error show">{error}</div>}

          {/* Form */}
          <form className="auth-form" onSubmit={handleSubmit}>
            {/* Email Field */}
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
              />
            </div>

            {/* Password Field */}
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder={isLoginMode ? 'Your password' : 'Min 6 characters'}
                minLength={6}
              />
            </div>

            {/* Sign Up Only Fields */}
            {!isLoginMode && (
              <>
                {/* Account Type Selection */}
                <div className="form-group">
                  <label>Account Type</label>
                  <div className="account-type-toggle" style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className={`btn ${accountType === 'member' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setAccountType('member')}
                      style={{ flex: 1 }}
                    >
                      👤 Member
                    </button>
                    <button
                      type="button"
                      className={`btn ${accountType === 'teamLead' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setAccountType('teamLead')}
                      style={{ flex: 1 }}
                    >
                      👑 Team Owner
                    </button>
                  </div>
                  <small className="form-hint">
                    {accountType === 'teamLead'
                      ? 'Create a team and issue a secure one-time invite'
                      : 'Join an existing team with an invite token from an owner'}
                  </small>
                </div>

                {/* Confirm Password */}
                <div className="form-group">
                  <label htmlFor="confirmPassword">Confirm Password</label>
                  <input
                    type="password"
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Confirm password"
                    minLength={6}
                  />
                </div>

                {/* Username */}
                <div className="form-group">
                  <label htmlFor="username">Username (Display Name)</label>
                  <input
                    type="text"
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    placeholder="Your scouter name"
                    minLength={2}
                    maxLength={30}
                  />
                </div>

                {/* Team Number */}
                <div className="form-group">
                  <label htmlFor="teamNumber">Your FRC Team Number (optional)</label>
                  <input
                    type="number"
                    id="teamNumber"
                    value={teamNumber}
                    onChange={(e) => setTeamNumber(e.target.value)}
                    placeholder="e.g. 1551"
                    min={1}
                    max={99999}
                  />
                  <small className="form-hint">This enables the "My Matches" feature</small>
                </div>

                {/* Invite token - only for members; it is redeemed after auth. */}
                {accountType === 'member' && (
                  <div className="form-group">
                    <label htmlFor="signupCode">Team Invite Token</label>
                    <input
                      type="text"
                      id="signupCode"
                      value={signupCode}
                      onChange={(e) => setSignupCode(e.target.value.trim())}
                      required
                      placeholder="Paste 64-character invite token"
                      maxLength={64}
                      autoComplete="off"
                      spellCheck="false"
                      style={{ fontFamily: 'monospace', letterSpacing: '0.04em' }}
                    />
                    <small className="form-hint">Get this private token from a team owner. It is single-use and expires.</small>
                  </div>
                )}

              </>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={loading}
            >
              {loading
                ? (isLoginMode ? 'Signing in...' : 'Creating account...')
                : (isLoginMode ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          {/* Divider */}
          <div className="auth-divider">
            <span>or</span>
          </div>

          {/* Google Sign In Button */}
          <button
            type="button"
            className="btn btn-google btn-full"
            onClick={handleGoogleSignIn}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              backgroundColor: '#fff',
              color: '#333',
              border: '1px solid #ddd',
              padding: '12px 20px',
              fontSize: '16px',
              fontWeight: '500',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              marginBottom: '16px'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {loading ? 'Connecting...' : 'Continue with Google'}
          </button>

          {/* Discord Sign In Button */}
          <button
            type="button"
            className="btn btn-discord btn-full"
            onClick={handleDiscordSignIn}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              backgroundColor: '#5865F2',
              color: '#fff',
              border: 'none',
              padding: '12px 20px',
              fontSize: '16px',
              fontWeight: '500',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              marginBottom: '16px'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            {loading ? 'Connecting...' : 'Continue with Discord'}
          </button>

          {/* Toggle Mode Link */}
          <div className="auth-switch">
            <span>
              {isLoginMode ? "Don't have an account?" : 'Already have an account?'}
            </span>
            <a href="#" onClick={(e) => { e.preventDefault(); toggleMode(); }}>
              {isLoginMode ? 'Create one' : 'Sign in'}
            </a>
          </div>

          {/* Privacy Footer */}
          <div className="privacy-footer">
            <div className="privacy-info">
              <span className="privacy-icon">🛡️</span>
              <div className="privacy-text">
                <strong>Your Privacy Matters</strong>
                <p>PinkScout only collects data necessary for FRC match scouting. Your information is stored securely using Supabase and is never shared with third parties.</p>
              </div>
            </div>
            <div className="data-notice">
              <p><strong>Data We Collect:</strong> Email, display name, team number, and match scouting entries you submit.</p>
              <p><strong>Purpose:</strong> To help your FRC team track robot performance at competitions.</p>
            </div>
          </div>
        </div>

        {/* External Footer */}
        <div className="auth-external-footer">
          <p>© 2026 PinkScout • Created for FIRST® Robotics Competition Teams</p>
          <p className="frc-disclaimer">
            FIRST® and FIRST Robotics Competition are registered trademarks of For Inspiration and Recognition of Science and Technology (FIRST).
            PinkScout is not affiliated with or endorsed by FIRST.
          </p>
        </div>
      </div>
    </>
  );
}
