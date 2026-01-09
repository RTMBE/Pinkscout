/**
 * ThemeToggle.jsx - Light/Dark Mode Toggle Component
 * 
 * Toggles between light and dark themes by setting data-theme attribute
 * on the document root. Persists preference to localStorage.
 */

import { useState, useEffect } from 'react';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    // Check localStorage first
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    // Default to light theme (matching original PinkScout)
    return false;
  });

  useEffect(() => {
    // Apply theme to document
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  return (
    <button 
      className="theme-toggle-btn"
      onClick={() => setIsDark(!isDark)}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
    >
      <span className="theme-icon">{isDark ? '☀️' : '🌙'}</span>
      <span className="theme-label">{isDark ? 'Light' : 'Dark'}</span>
    </button>
  );
}

