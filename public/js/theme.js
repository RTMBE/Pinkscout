/**
 * =============================================================================
 * THEME.JS - Dark/Light Mode Toggle Handler
 * =============================================================================
 *
 * WHAT IS THIS FILE?
 * Handles theme switching between light and dark modes.
 * - Saves preference to localStorage
 * - Respects system preference (prefers-color-scheme)
 * - Provides smooth transitions between themes
 *
 * THEME OPTIONS:
 * - 'light': Force light mode
 * - 'dark': Force dark mode
 * - 'system': Follow system preference (default)
 *
 * =============================================================================
 */

// =============================================================================
// CONSTANTS
// =============================================================================

const THEME_KEY = 'pinkscout_theme';
const THEMES = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system'
};


// =============================================================================
// THEME FUNCTIONS
// =============================================================================

/**
 * GET CURRENT THEME
 * -----------------
 * Returns the current theme preference from localStorage.
 * Defaults to 'system' if not set.
 */
function getThemePreference() {
  return localStorage.getItem(THEME_KEY) || THEMES.SYSTEM;
}


/**
 * SET THEME
 * ---------
 * Sets the theme and saves preference to localStorage.
 *
 * @param {string} theme - 'light', 'dark', or 'system'
 */
function setTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
  updateToggleUI();
}


/**
 * APPLY THEME
 * -----------
 * Applies the theme to the document.
 *
 * @param {string} theme - The theme to apply
 */
function applyTheme(theme) {
  const root = document.documentElement;
  
  if (theme === THEMES.SYSTEM) {
    // Remove data-theme to let CSS media query handle it
    root.removeAttribute('data-theme');
  } else {
    // Set specific theme
    root.setAttribute('data-theme', theme);
  }
}


/**
 * TOGGLE THEME
 * ------------
 * Cycles through themes: light -> dark -> system -> light
 */
function toggleTheme() {
  const current = getThemePreference();
  let next;
  
  if (current === THEMES.LIGHT) {
    next = THEMES.DARK;
  } else if (current === THEMES.DARK) {
    next = THEMES.SYSTEM;
  } else {
    next = THEMES.LIGHT;
  }
  
  setTheme(next);
}


/**
 * GET EFFECTIVE THEME
 * -------------------
 * Returns the actual theme being displayed (resolves 'system' to light/dark).
 */
function getEffectiveTheme() {
  const preference = getThemePreference();
  
  if (preference === THEMES.SYSTEM) {
    // Check system preference
    return window.matchMedia('(prefers-color-scheme: dark)').matches 
      ? THEMES.DARK 
      : THEMES.LIGHT;
  }
  
  return preference;
}


/**
 * UPDATE TOGGLE UI
 * ----------------
 * Updates the theme toggle button appearance.
 */
function updateToggleUI() {
  const toggleIcon = document.getElementById('themeToggleIcon');
  const toggleLabel = document.getElementById('themeToggleLabel');
  const toggleSwitch = document.querySelector('.toggle-switch');
  
  if (!toggleIcon) return;
  
  const preference = getThemePreference();
  const effective = getEffectiveTheme();
  
  // Update icon
  if (preference === THEMES.SYSTEM) {
    toggleIcon.textContent = '💻';
  } else if (effective === THEMES.DARK) {
    toggleIcon.textContent = '🌙';
  } else {
    toggleIcon.textContent = '☀️';
  }
  
  // Update label
  if (toggleLabel) {
    const labels = {
      [THEMES.LIGHT]: 'Light Mode',
      [THEMES.DARK]: 'Dark Mode',
      [THEMES.SYSTEM]: 'Auto'
    };
    toggleLabel.textContent = labels[preference];
  }
  
  // Update switch
  if (toggleSwitch) {
    toggleSwitch.classList.toggle('active', effective === THEMES.DARK);
  }
}


// =============================================================================
// INITIALIZATION
// =============================================================================

// Apply theme on page load (before DOM is ready to prevent flash)
applyTheme(getThemePreference());

// Set up event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  updateToggleUI();
  
  // Theme toggle click handler
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
  
  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemePreference() === THEMES.SYSTEM) {
      updateToggleUI();
    }
  });
});

console.log('🎨 Theme module loaded');

