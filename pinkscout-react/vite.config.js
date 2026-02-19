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
        // Runtime caching for API requests
        runtimeCaching: [
          {
            // Cache Blue Alliance API responses
            urlPattern: /^https:\/\/www\.thebluealliance\.com\/api\/v3\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tba-api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 // 1 hour
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // Cache Statbotics API responses
            urlPattern: /^https:\/\/api\.statbotics\.io\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'statbotics-api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 // 1 hour
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // Network-first for Supabase (we need fresh data)
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5 // 5 minutes
              },
              networkTimeoutSeconds: 10
            }
          }
        ]
      }
    })
  ],

  // Build configuration for Vercel deployment
  build: {
    outDir: 'dist',
    // Disable sourcemaps in production for security
    sourcemap: mode === 'development',
    // Strip console and debugger statements in production
    minify: 'esbuild',
    // esbuild options for production optimization
    target: 'es2020'
  },

  // esbuild options - strip console/debugger in production
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : []
  },

  // Development server configuration
  server: {
    port: 3000,
    open: true
  }
}))

