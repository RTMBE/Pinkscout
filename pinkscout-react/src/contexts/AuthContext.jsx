/**
 * =============================================================================
 * AUTHCONTEXT.JSX - Firebase Authentication Context Provider
 * =============================================================================
 * 
 * WHAT IS THIS FILE?
 * Provides global authentication state throughout the React app using Context API.
 * 
 * FEATURES:
 * - Tracks current user state
 * - Provides login, signup, logout functions
 * - Checks admin rights
 * - Stores user profile in Firestore on signup
 * 
 * USAGE:
 * 1. Wrap your app with <AuthProvider>
 * 2. Use the useAuth() hook in any component to access auth state/functions
 * 
 * EXAMPLE:
 *   const { user, login, logout, isAdmin } = useAuth();
 *   if (!user) return <Navigate to="/login" />;
 * 
 * =============================================================================
 */

import { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from 'firebase/firestore';
import { auth, db, PRIMARY_ADMIN_EMAIL } from '../services/firebase';

// =============================================================================
// CREATE CONTEXT
// =============================================================================

const AuthContext = createContext(null);

// =============================================================================
// VALID SIGNUP CODE
// =============================================================================
// Users must enter this code to create an account

const VALID_SIGNUP_CODE = '1551';

// =============================================================================
// AUTH PROVIDER COMPONENT
// =============================================================================

export function AuthProvider({ children }) {
  // Current authenticated user (null if not logged in)
  const [user, setUser] = useState(null);
  
  // Loading state while checking auth
  const [loading, setLoading] = useState(true);
  
  // Is current user an admin?
  const [isAdmin, setIsAdmin] = useState(false);
  
  // User profile from Firestore
  const [userProfile, setUserProfile] = useState(null);

  // =========================================================================
  // AUTH STATE LISTENER
  // =========================================================================
  // Listens for Firebase auth state changes and updates context
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        // Check admin rights
        const adminStatus = await checkAdminRights(firebaseUser);
        setIsAdmin(adminStatus);
        
        // Load user profile
        try {
          const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (profileDoc.exists()) {
            setUserProfile(profileDoc.data());
          }
        } catch (error) {
          console.error('Error loading user profile:', error);
        }
      } else {
        setIsAdmin(false);
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return unsubscribe;
  }, []);

  // =========================================================================
  // CHECK ADMIN RIGHTS
  // =========================================================================
  
  async function checkAdminRights(user) {
    if (!user) return false;
    
    // Primary admin always has access
    if (user.email === PRIMARY_ADMIN_EMAIL) return true;
    
    // Check Firestore admin list
    try {
      const adminsDoc = await getDoc(doc(db, 'settings', 'admins'));
      if (adminsDoc.exists()) {
        const adminEmails = adminsDoc.data().emails || [];
        return adminEmails.includes(user.email);
      }
    } catch (error) {
      console.error('Error checking admin rights:', error);
    }
    
    return false;
  }

  // =========================================================================
  // LOGIN FUNCTION
  // =========================================================================
  
  async function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  // =========================================================================
  // SIGNUP FUNCTION
  // =========================================================================

  async function signup(email, password, username, signupCode, teamNumber = null) {
    // Validate signup code
    if (signupCode !== VALID_SIGNUP_CODE) {
      throw new Error('Invalid sign-up code. Please contact your team lead.');
    }

    // Create user in Firebase Auth
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const newUser = userCredential.user;

    // Update display name
    await updateProfile(newUser, { displayName: username });

    // Create user profile in Firestore
    const profileData = {
      email: newUser.email,
      displayName: username,
      role: 'scouter',
      createdAt: serverTimestamp()
    };

    // Add team number if provided
    if (teamNumber) {
      profileData.teamNumber = parseInt(teamNumber, 10);
    }

    await setDoc(doc(db, 'users', newUser.uid), profileData);

    return userCredential;
  }

  // =========================================================================
  // UPDATE USER PROFILE
  // =========================================================================

  async function updateUserProfile(updates) {
    if (!user) throw new Error('No user logged in');

    await setDoc(doc(db, 'users', user.uid), updates, { merge: true });

    // Update local profile state
    setUserProfile(prev => ({ ...prev, ...updates }));

    return true;
  }

  // =========================================================================
  // LOGOUT FUNCTION
  // =========================================================================

  async function logout() {
    return signOut(auth);
  }

  // =========================================================================
  // CONTEXT VALUE
  // =========================================================================
  // All values and functions exposed to consumers

  const value = {
    user,               // Current Firebase user object
    userProfile,        // User profile from Firestore
    isAdmin,            // Boolean: is user an admin?
    loading,            // Boolean: is auth state being checked?
    login,              // Function: login(email, password)
    signup,             // Function: signup(email, password, username, signupCode, teamNumber)
    logout,             // Function: logout()
    updateUserProfile   // Function: updateUserProfile(updates)
  };

  // Don't render children until auth state is determined
  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

// =============================================================================
// USE AUTH HOOK
// =============================================================================
// Custom hook to access auth context from any component

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

