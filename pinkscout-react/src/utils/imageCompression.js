/**
 * =============================================================================
 * IMAGE COMPRESSION UTILITY
 * =============================================================================
 * 
 * PURPOSE:
 * Compresses images before upload to reduce file size and upload time.
 * Uses native Canvas API - no external dependencies.
 * 
 * COMPRESSION STRATEGY:
 * 1. Resize to max dimension (1200px) if larger
 * 2. Convert to JPEG with quality setting
 * 3. Target file size under 500KB
 * 
 * =============================================================================
 */

/**
 * Compress an image file
 * @param {File} file - The image file to compress
 * @param {Object} options - Compression options
 * @param {number} options.maxWidth - Max width in pixels (default: 1200)
 * @param {number} options.maxHeight - Max height in pixels (default: 1200)
 * @param {number} options.quality - JPEG quality 0-1 (default: 0.8)
 * @returns {Promise<File>} - Compressed image file
 */
export async function compressImage(file, options = {}) {
  const {
    maxWidth = 1200,
    maxHeight = 1200,
    quality = 0.8
  } = options;

  // If file is already small enough, return as-is
  const TARGET_SIZE = 500 * 1024; // 500KB
  if (file.size <= TARGET_SIZE) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        // Calculate new dimensions
        let { width, height } = img;
        
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF'; // White background for transparency
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }

            // Create new file with same name but .jpg extension
            const compressedFile = new File(
              [blob],
              file.name.replace(/\.[^.]+$/, '.jpg'),
              { type: 'image/jpeg' }
            );

            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Get estimated compressed size (for UI feedback)
 * @param {number} originalSize - Original file size in bytes
 * @returns {string} - Human-readable estimated size
 */
export function estimateCompressedSize(originalSize) {
  // Rough estimation: compression typically achieves 50-80% reduction
  const estimated = originalSize * 0.3;
  
  if (estimated < 1024) {
    return `~${Math.round(estimated)} B`;
  } else if (estimated < 1024 * 1024) {
    return `~${Math.round(estimated / 1024)} KB`;
  } else {
    return `~${(estimated / (1024 * 1024)).toFixed(1)} MB`;
  }
}

/**
 * Format file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} - Human-readable size
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

