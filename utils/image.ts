// Downscale an image (File or data URL) to a JPEG data URL, capped at `maxEdge`
// on the longest side. Full-resolution phone photos can be 5-10MB, which blows
// past the serverless request-body limit (Vercel ~4.5MB → 413). ~1568px also
// matches the vision model's own working size, so we lose nothing for OCR.
export function downscaleImage(
  src: File | string,
  maxEdge = 1568,
  quality = 0.85,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = typeof src === 'string' ? src : URL.createObjectURL(src);
    const revoke = () => { if (typeof src !== 'string') URL.revokeObjectURL(url); };
    const img = new Image();
    img.onload = () => {
      revoke();
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas unavailable')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { revoke(); reject(new Error('Could not read image')); };
    img.src = url;
  });
}
