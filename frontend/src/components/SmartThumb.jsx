import { useState, useEffect } from 'react';

// Renders an image, but falls back to a placeholder glyph if the URL is missing
// or fails to load (e.g. supplier CDNs that block cross-site hotlinking).
export default function SmartThumb({ src, alt = '', className = '', fallback = '👕' }) {
  const [ok, setOk] = useState(Boolean(src));
  useEffect(() => { setOk(Boolean(src)); }, [src]);
  if (!src || !ok) return <span className={`thumb-fallback ${className}`.trim()}>{fallback}</span>;
  return <img className={className} src={src} alt={alt} onError={() => setOk(false)} />;
}
