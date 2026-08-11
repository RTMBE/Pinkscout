/**
 * =============================================================================
 * VITE.CONFIG.JS - Vite Build Configuration
 * =============================================================================
 *
 * WHAT IS VITE?
 * Vite is a modern build tool that provides fast development server
 * and optimized production builds for React applications.
 *
 * BUILD OUTPUT:
 * When you run 'npm run build', Vite outputs to the 'dist' folder.
 * This folder is then deployed to Vercel.
 *
 * SECURITY:
 * - Console statements are stripped in production builds
 * - Sourcemaps are disabled in production to prevent code exposure
 *
 * PWA:
 * - Service worker for offline support
 * - Asset caching for instant reloads
 * - Offline scouting data queued for sync
 *
 * =============================================================================
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'PinkScout - FRC Scouting App',
        short_name: 'PinkScout',
        description: 'FRC Team Scouting Application for FIRST Robotics Competition',
        theme_color: '#e91e63',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        // Cache all static assets
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
        // Do not cache API responses in the browser. Supabase responses and
        // offline scouting records can be private, especially on shared FRC
        // tablets. The server-side competition gateway owns public-data cache.
        runtimeCaching: []
      }
    })
  ],

  // Build configuration for Vercel deployment
  build: {
    outDir: 'dist',
    // Disable sourcemaps in production for security
    sourcemap: mode === 'development',
    // Vite 8 uses Rolldown/Oxc. Keep production diagnostics out of the
    // shipped bundle without relying on Vite's deprecated esbuild setting.
    minify: 'oxc',
    target: 'es2020',
    rolldownOptions: {
      output: {
        minify: {
          compress: {
            dropConsole: mode === 'production',
            dropDebugger: mode === 'production'
          }
        }
      }
    }
  },

  // Development server configuration
  server: {
    port: 3000,
    open: true
  },

  // Test configuration for Vitest
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/']
    }
  }
}))
