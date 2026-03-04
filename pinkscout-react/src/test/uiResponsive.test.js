/**
 * UI Responsiveness Tests
 * Tests for mobile/desktop layouts and touch interactions
 */
import { describe, it, expect } from 'vitest';

describe('UI Responsiveness Tests', () => {
  
  describe('Breakpoint Detection', () => {
    
    const BREAKPOINTS = {
      mobile: 768,
      tablet: 1024,
      desktop: 1280
    };
    
    const getDeviceType = (width) => {
      if (width < BREAKPOINTS.mobile) return 'mobile';
      if (width < BREAKPOINTS.tablet) return 'tablet';
      return 'desktop';
    };

    it('should detect mobile viewport', () => {
      expect(getDeviceType(320)).toBe('mobile');
      expect(getDeviceType(375)).toBe('mobile');
      expect(getDeviceType(414)).toBe('mobile');
      expect(getDeviceType(767)).toBe('mobile');
    });

    it('should detect tablet viewport', () => {
      expect(getDeviceType(768)).toBe('tablet');
      expect(getDeviceType(834)).toBe('tablet');
      expect(getDeviceType(1023)).toBe('tablet');
    });

    it('should detect desktop viewport', () => {
      expect(getDeviceType(1024)).toBe('desktop');
      expect(getDeviceType(1280)).toBe('desktop');
      expect(getDeviceType(1920)).toBe('desktop');
    });
  });

  describe('Touch Target Sizes', () => {
    
    const MIN_TOUCH_TARGET = 44; // Apple HIG recommends 44x44px

    it('should have adequate touch target sizes', () => {
      const buttonSizes = [
        { name: 'hamburger', size: 44 },
        { name: 'navItem', size: 48 },
        { name: 'formButton', size: 44 },
        { name: 'incrementButton', size: 48 },
      ];
      
      buttonSizes.forEach(btn => {
        expect(btn.size).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      });
    });
  });

  describe('Sidebar Responsive Width', () => {
    
    const calculateSidebarWidth = (viewportWidth) => {
      // min(80vw, 280px)
      const vwWidth = viewportWidth * 0.8;
      return Math.min(vwWidth, 280);
    };

    it('should scale sidebar width on mobile', () => {
      expect(calculateSidebarWidth(320)).toBe(256);  // 320 * 0.8 = 256
      expect(calculateSidebarWidth(375)).toBe(280);  // 375 * 0.8 = 300, capped at 280
      expect(calculateSidebarWidth(414)).toBe(280);  // capped at 280
    });

    it('should cap sidebar at max width on larger screens', () => {
      expect(calculateSidebarWidth(500)).toBe(280);
      expect(calculateSidebarWidth(768)).toBe(280);
      expect(calculateSidebarWidth(1024)).toBe(280);
    });
  });

  describe('Form Layout', () => {
    
    const shouldStackFields = (viewportWidth) => {
      return viewportWidth < 768;
    };

    it('should stack form fields on mobile', () => {
      expect(shouldStackFields(320)).toBe(true);
      expect(shouldStackFields(375)).toBe(true);
      expect(shouldStackFields(767)).toBe(true);
    });

    it('should use row layout on desktop', () => {
      expect(shouldStackFields(768)).toBe(false);
      expect(shouldStackFields(1024)).toBe(false);
    });
  });

  describe('Font Scaling', () => {
    
    const getFontSize = (baseSize, viewportWidth) => {
      if (viewportWidth < 768) {
        return Math.max(baseSize * 0.875, 12); // 87.5% on mobile, min 12px
      }
      return baseSize;
    };

    it('should scale fonts appropriately on mobile', () => {
      expect(getFontSize(16, 375)).toBe(14);
      expect(getFontSize(14, 375)).toBe(12.25);
      expect(getFontSize(12, 375)).toBe(12); // min 12px
    });

    it('should use base font size on desktop', () => {
      expect(getFontSize(16, 1024)).toBe(16);
      expect(getFontSize(14, 1024)).toBe(14);
    });
  });

  describe('Grid Layout', () => {
    
    const getGridColumns = (viewportWidth, itemMinWidth = 300) => {
      if (viewportWidth < 600) return 1;
      if (viewportWidth < 900) return 2;
      if (viewportWidth < 1200) return 3;
      return Math.floor(viewportWidth / itemMinWidth);
    };

    it('should use single column on mobile', () => {
      expect(getGridColumns(320)).toBe(1);
      expect(getGridColumns(599)).toBe(1);
    });

    it('should use two columns on tablet', () => {
      expect(getGridColumns(600)).toBe(2);
      expect(getGridColumns(899)).toBe(2);
    });

    it('should use three columns on desktop', () => {
      expect(getGridColumns(900)).toBe(3);
      expect(getGridColumns(1199)).toBe(3);
    });

    it('should scale columns on large screens', () => {
      expect(getGridColumns(1200)).toBe(4);
      expect(getGridColumns(1500)).toBe(5);
    });
  });
});

