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
 * =============================================================================
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],

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

