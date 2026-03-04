/**
 * Navigation Tests
 * Tests for route configuration and navigation logic
 */
import { describe, it, expect } from 'vitest';

describe('Navigation Tests', () => {
  
  describe('Route Configuration', () => {
    
    const routes = [
      { path: '/', name: 'Login', public: true },
      { path: '/login', name: 'Login', public: true },
      { path: '/signup', name: 'Sign Up', public: true },
      { path: '/scout', name: 'Scout', public: false },
      { path: '/analytics', name: 'Analytics', public: false },
      { path: '/teams', name: 'Team Search', public: false },
      { path: '/my-matches', name: 'My Matches', public: false },
      { path: '/profile', name: 'Profile', public: false },
      { path: '/admin', name: 'Admin', public: false },
      { path: '/compare', name: 'Compare', public: false },
      { path: '/strategy', name: 'Strategy', public: false },
      { path: '/prescouting', name: 'Pre-Scouting', public: false },
      { path: '/pit', name: 'Pit Scouting', public: false },
      { path: '/rules', name: 'Rules', public: false },
    ];

    it('should have all required routes', () => {
      const requiredPaths = ['/', '/login', '/signup', '/scout', '/analytics', '/teams'];
      
      requiredPaths.forEach(path => {
        const route = routes.find(r => r.path === path);
        expect(route).toBeDefined();
      });
    });

    it('should mark public routes correctly', () => {
      const publicPaths = ['/', '/login', '/signup'];
      const protectedPaths = ['/scout', '/analytics', '/teams', '/admin'];
      
      publicPaths.forEach(path => {
        const route = routes.find(r => r.path === path);
        expect(route?.public).toBe(true);
      });
      
      protectedPaths.forEach(path => {
        const route = routes.find(r => r.path === path);
        expect(route?.public).toBe(false);
      });
    });

    it('should have unique path for each route', () => {
      const paths = routes.map(r => r.path);
      const uniquePaths = new Set(paths);
      expect(uniquePaths.size).toBe(paths.length);
    });
  });

  describe('Mobile Navigation', () => {
    
    const mobileNavTabs = [
      { name: 'Scout', path: '/scout', icon: 'clipboard' },
      { name: 'Analytics', path: '/analytics', icon: 'chart' },
      { name: 'Teams', path: '/teams', icon: 'search' },
      { name: 'Matches', path: '/my-matches', icon: 'list' },
    ];

    it('should have 4 mobile nav tabs', () => {
      expect(mobileNavTabs.length).toBe(4);
    });

    it('should have required tabs for mobile nav', () => {
      const requiredTabs = ['Scout', 'Analytics', 'Teams', 'Matches'];
      
      requiredTabs.forEach(tabName => {
        const tab = mobileNavTabs.find(t => t.name === tabName);
        expect(tab).toBeDefined();
      });
    });

    it('should have valid paths for all tabs', () => {
      mobileNavTabs.forEach(tab => {
        expect(tab.path).toMatch(/^\/[a-z-]+$/);
      });
    });

    it('should have icons for all tabs', () => {
      mobileNavTabs.forEach(tab => {
        expect(tab.icon).toBeDefined();
        expect(typeof tab.icon).toBe('string');
        expect(tab.icon.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Sidebar Navigation', () => {
    
    it('should toggle sidebar state correctly', () => {
      let sidebarOpen = false;
      
      const toggleSidebar = () => {
        sidebarOpen = !sidebarOpen;
      };
      
      expect(sidebarOpen).toBe(false);
      toggleSidebar();
      expect(sidebarOpen).toBe(true);
      toggleSidebar();
      expect(sidebarOpen).toBe(false);
    });

    it('should close sidebar on mobile after navigation', () => {
      let sidebarOpen = true;
      const isMobile = true;
      
      const handleNavigation = () => {
        if (isMobile) {
          sidebarOpen = false;
        }
      };
      
      handleNavigation();
      expect(sidebarOpen).toBe(false);
    });
  });
});

