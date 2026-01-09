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
 * This folder is then deployed to Firebase Hosting.
 * 
 * =============================================================================
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  
  // Build configuration for Firebase Hosting
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  
  // Development server configuration
  server: {
    port: 3000,
    open: true
  }
})

