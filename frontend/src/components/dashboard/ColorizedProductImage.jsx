import { useEffect, useRef, useState } from 'react';

function parseHex(hex) {
  const value = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value)) return [35, 35, 35];
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16));
}

function recolorNeutralGarment(imageData, color) {
  const pixels = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const [targetR, targetG, targetB] = parseHex(color);
  const mask = new Uint8Array(width * height);
  const histogram = new Uint32Array(256);
  let candidateCount = 0;
  const cornerColors = [
    [0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1],
  ].map(([x, y]) => {
    const i = (y * width + x) * 4;
    return [pixels[i], pixels[i + 1], pixels[i + 2]];
  });

  for (let i = 0, pixel = 0; i < pixels.length; i += 4, pixel += 1) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    const isBackground = cornerColors.some(([cr, cg, cb]) => {
      const dr = r - cr;
      const dg = g - cg;
      const db = b - cb;
      return (dr * dr) + (dg * dg) + (db * db) < 900;
    });

    // Catalog garments are neutral black/grey product shots. Keep backgrounds,
    // skin, labels and coloured artwork intact; tint only neutral garment pixels.
    if (pixels[i + 3] < 10 || isBackground || chroma > 48) continue;

    const luminance = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    mask[pixel] = 1;
    histogram[luminance] += 1;
    candidateCount += 1;
  }

  if (!candidateCount) return;
  const percentile = (fraction) => {
    const target = candidateCount * fraction;
    let seen = 0;
    for (let value = 0; value < histogram.length; value += 1) {
      seen += histogram[value];
      if (seen >= target) return value;
    }
    return 255;
  };
  const low = percentile(0.05);
  const high = Math.max(low + 12, percentile(0.95));

  for (let i = 0, pixel = 0; i < pixels.length; i += 4, pixel += 1) {
    if (!mask[pixel]) continue;

    const luminance = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
    const tone = Math.max(0, Math.min(1, (luminance - low) / (high - low)));
    const shade = 0.32 + (0.68 * tone);
    const highlight = Math.pow(tone, 2) * 18;
    pixels[i] = Math.min(255, (targetR * shade) + highlight);
    pixels[i + 1] = Math.min(255, (targetG * shade) + highlight);
    pixels[i + 2] = Math.min(255, (targetB * shade) + highlight);
  }
}

export default function ColorizedProductImage({ src, color, alt }) {
  const canvasRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (cancelled || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      context.drawImage(image, 0, 0);

      try {
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        recolorNeutralGarment(imageData, color);
        context.putImageData(imageData, 0, 0);
        setFailed(false);
      } catch {
        setFailed(true);
      }
    };
    image.onerror = () => !cancelled && setFailed(true);
    image.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, color]);

  if (failed) return <img className="pv-hero-img" src={src} alt={alt} />;

  return (
    <canvas
      ref={canvasRef}
      className="pv-colorized-img"
      role="img"
      aria-label={alt}
    />
  );
}
