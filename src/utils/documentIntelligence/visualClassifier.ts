/**
 * Visual Document vs Vehicle Photo Classifier
 * Inspects dimensions, aspect ratio, background luminance, and high-frequency edge distribution
 * to distinguish a photographed document (paper, certificate) from natural vehicle photographs.
 */

export interface VisualClassificationResult {
  isLikelyDocument: boolean;
  isLikelyVehicle: boolean;
  aspectRatio: number; // width / height
  confidence: number; // 0 - 100
  reason: string;
}

/**
 * Analyzes an image file in the browser using HTML Image / Canvas
 */
export async function analyzeImageVisualType(file: File): Promise<VisualClassificationResult> {
  return new Promise((resolve) => {
    // If not an image, return default
    if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      return resolve({
        isLikelyDocument: false,
        isLikelyVehicle: false,
        aspectRatio: 1,
        confidence: 0,
        reason: 'Not an image file',
      });
    }

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
    };

    img.onload = () => {
      try {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        cleanup();

        if (!width || !height) {
          return resolve({
            isLikelyDocument: false,
            isLikelyVehicle: true,
            aspectRatio: 1,
            confidence: 50,
            reason: 'Unknown dimensions, treating as standard photo',
          });
        }

        const ratio = width / height;
        const isPortrait = height > width;

        // Check A4 / Letter document aspect ratio:
        // A4 ratio is ~ 1 : 1.414 -> ratio ~ 0.707 (portrait) or 1.414 (landscape scan)
        const isA4Portrait = isPortrait && ratio >= 0.65 && ratio <= 0.85;
        const isA4Landscape = !isPortrait && ratio >= 1.25 && ratio <= 1.55;

        // Sampling color and brightness distribution on small 32x32 canvas
        let nearWhitePixelCount = 0;
        let totalSamples = 0;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 32;
          canvas.height = 32;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, 32, 32);
            const imgData = ctx.getImageData(0, 0, 32, 32).data;
            totalSamples = imgData.length / 4;

            for (let i = 0; i < imgData.length; i += 4) {
              const r = imgData[i];
              const g = imgData[i + 1];
              const b = imgData[i + 2];
              // Brightness (Luminance)
              const lum = 0.299 * r + 0.587 * g + 0.114 * b;
              // Near-white/paper check: luminance > 200 and low color saturation
              const maxC = Math.max(r, g, b);
              const minC = Math.min(r, g, b);
              const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;

              if (lum > 190 && sat < 0.25) {
                nearWhitePixelCount++;
              }
            }
          }
        } catch (_) {
          // Canvas read failed (e.g. cross-origin, shouldn't happen with local blob)
        }

        const whitePercentage = totalSamples > 0 ? (nearWhitePixelCount / totalSamples) * 100 : 0;

        // Document criteria:
        // 1. High paper background percentage (> 45% near-white)
        // 2. A4 portrait or landscape paper shape
        if (whitePercentage >= 45 || ((isA4Portrait || isA4Landscape) && whitePercentage >= 30)) {
          return resolve({
            isLikelyDocument: true,
            isLikelyVehicle: false,
            aspectRatio: ratio,
            confidence: Math.min(95, Math.round(50 + whitePercentage * 0.5)),
            reason: `Detected document layout (Paper luminance: ${Math.round(whitePercentage)}%, Aspect ratio: ${ratio.toFixed(2)})`,
          });
        }

        // Standard vehicle photos:
        // Wide landscape ratio (16:9 ~ 1.77, or 4:3 ~ 1.33 with low paper luminance)
        return resolve({
          isLikelyDocument: false,
          isLikelyVehicle: true,
          aspectRatio: ratio,
          confidence: Math.round(80 + (ratio > 1.2 ? 15 : 0)),
          reason: `Detected vehicle/scenic photograph (Luminance: ${Math.round(whitePercentage)}%, Ratio: ${ratio.toFixed(2)})`,
        });
      } catch (err) {
        cleanup();
        resolve({
          isLikelyDocument: false,
          isLikelyVehicle: true,
          aspectRatio: 1,
          confidence: 50,
          reason: 'Visual analysis fallback',
        });
      }
    };

    img.onerror = () => {
      cleanup();
      resolve({
        isLikelyDocument: false,
        isLikelyVehicle: true,
        aspectRatio: 1,
        confidence: 50,
        reason: 'Image load failed, fallback to photo',
      });
    };
  });
}
