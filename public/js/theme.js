/**
 * THEME.JS - Dark/Light Mode Toggle
 * Handles theme switching between light and dark modes.
 */

(function() {
  const THEME_KEY = 'pinkscout_theme';
  
  // Get saved theme or default to light
  function getTheme() {
    return localStorage.getItem(THEME_KEY) || 'light';
  }
  
  // Apply theme to document
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    updateToggleUI(theme);
  }
  
  // Update toggle button UI
  function updateToggleUI(theme) {
    const icon = document.getElementById('themeToggleIcon');
    const label = document.getElementById('themeToggleLabel');
    if (icon && label) {
      if (theme === 'dark') {
        icon.textContent = '🌙';
        label.textContent = 'Dark Mode';
      } else {
        icon.textContent = '☀️';
        label.textContent = 'Light Mode';
      }
    }
  }
  
  // Toggle between themes
  function toggleTheme() {
    const current = getTheme();
    const next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
  }
  
  // Apply theme immediately on page load
  applyTheme(getTheme());
  
  // Set up toggle button when DOM is ready
  document.addEventListener('DOMContentLoaded', function() {
    const toggle = document.getElementById('themeToggle');
    if (toggle) {
      toggle.addEventListener('click', toggleTheme);
    }
    updateToggleUI(getTheme());
  });
})();

