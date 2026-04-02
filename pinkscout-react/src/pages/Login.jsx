/**
 * =============================================================================
 * LOGIN.JSX - Authentication Page Component
 * =============================================================================
 * 
 * WHAT IS THIS PAGE?
 * Handles user authentication:
 * - Sign In: Email + Password for existing users
 * - Sign Up: Email + Password + Confirm + Username + Sign-Up Code
 * 
 * SIGNUP CODE VALIDATION:
 * The signup code must be exactly "1551"
 * If incorrect, show clear error message
 * 
 * ON SUCCESS:
 * - Stores user profile in Supabase (profiles table)
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

  // Generated team code for Team Lead signup
  const [generatedCode, setGeneratedCode] = useState('');
  
  // UI state
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Hooks
  const { user, login, signup, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // ==========================================================================
  // REDIRECT IF ALREADY LOGGED IN
  // ==========================================================================

  useEffect(() => {
    // Only redirect after auth state is determined (not during loading)
    if (!authLoading && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, authLoading, navigate]);

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
    setGeneratedCode('');
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
    setGeneratedCode('');
    setLoading(true);

    try {
      if (isLoginMode) {
        // ====== SIGN IN ======
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

        // Signup with appropriate account type
        const result = await signup(
          email,
          password,
          username,
          signupCode,
          teamNumber || null,
          isTeamLead
        );

        if (isTeamLead && result.teamCode) {
          // Show the generated code to Team Lead
          setGeneratedCode(result.teamCode);
          setSuccess(`Team Lead account created! Your team code is: ${result.teamCode}`);

          // Longer delay to allow user to see and copy code
          setTimeout(() => {
            navigate('/dashboard', { replace: true });
          }, 3000);
        } else {
          setSuccess('Account created! Redirecting...');

          // Short delay to show success
          setTimeout(() => {
            navigate('/dashboard', { replace: true });
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
                      👑 Team Lead
                    </button>
                  </div>
                  <small className="form-hint">
                    {accountType === 'teamLead'
                      ? 'Create a team and invite members with your code'
                      : 'Join an existing team with a code from your Team Lead'}
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

                {/* Team Code - Only for Members */}
                {accountType === 'member' && (
                  <div className="form-group">
                    <label htmlFor="signupCode">Team Code</label>
                    <input
                      type="text"
                      id="signupCode"
                      value={signupCode}
                      onChange={(e) => setSignupCode(e.target.value.toUpperCase())}
                      required
                      placeholder="Enter 6-character code"
                      maxLength={6}
                      style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}
                    />
                    <small className="form-hint">Get this code from your Team Lead</small>
                  </div>
                )}

                {/* Generated Code Display - After Team Lead signup */}
                {generatedCode && (
                  <div className="form-group" style={{
                    background: 'var(--success-bg, #d4edda)',
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    border: '2px solid var(--success, #28a745)'
                  }}>
                    <label style={{ color: 'var(--success, #155724)', fontWeight: 'bold' }}>
                      🎉 Your Team Code
                    </label>
                    <div style={{
                      fontSize: '1.5rem',
                      fontWeight: 'bold',
                      letterSpacing: '0.2em',
                      textAlign: 'center',
                      padding: '0.5rem',
                      background: 'white',
                      borderRadius: '0.25rem',
                      marginTop: '0.5rem'
                    }}>
                      {generatedCode}
                    </div>
                    <small style={{ color: 'var(--success, #155724)' }}>
                      Share this code with your team members so they can join!
                    </small>
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

