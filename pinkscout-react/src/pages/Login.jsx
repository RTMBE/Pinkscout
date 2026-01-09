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
 * - Stores user profile in Firestore (users/{uid})
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
  
  // Hooks
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();

  // ==========================================================================
  // REDIRECT IF ALREADY LOGGED IN
  // ==========================================================================
  
  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  // ==========================================================================
  // TOGGLE MODE HANDLER
  // ==========================================================================
  
  const toggleMode = () => {
    setIsLoginMode(!isLoginMode);
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
        
        // Signup (includes code validation)
        await signup(email, password, username, signupCode, teamNumber || null);
        setSuccess('Account created! Redirecting...');
        
        // Short delay to show success
        setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 1000);
      }
    } catch (err) {
      // Convert Firebase error codes to user-friendly messages
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
    switch (code) {
      case 'auth/user-not-found':
        return 'No account found with this email.';
      case 'auth/wrong-password':
        return 'Incorrect password.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists.';
      case 'auth/weak-password':
        return 'Password should be at least 6 characters.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/invalid-credential':
        return 'Invalid email or password.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please try again later.';
      default:
        return error.message || 'An error occurred. Please try again.';
    }
  };

  // ==========================================================================
  // RENDER
  // ==========================================================================
  
  return (
    <>
      {/* SEO Meta Tags */}
      <Helmet>
        <title>Login - PinkScout</title>
        <meta name="description" content="Sign in to PinkScout FRC scouting application" />
      </Helmet>

      <div className="auth-container">
        <div className="auth-card auth-card-large">
          {/* Header */}
          <div className="auth-header">
            <h1>🤖 Pinkscout</h1>
            <p>
              {isLoginMode
                ? 'Sign in to access your scouting dashboard'
                : 'Create a new account to start scouting'}
            </p>
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

                {/* Sign Up Code */}
                <div className="form-group">
                  <label htmlFor="signupCode">Sign-Up Code</label>
                  <input
                    type="text"
                    id="signupCode"
                    value={signupCode}
                    onChange={(e) => setSignupCode(e.target.value)}
                    required
                    placeholder="Enter team code"
                  />
                  <small className="form-hint">Ask your team lead for the sign-up code</small>
                </div>
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
        </div>
      </div>
    </>
  );
}

