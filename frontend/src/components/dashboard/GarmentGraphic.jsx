// Self-contained garment preview: an inline SVG silhouette (chosen by category)
// filled with the product colour. Used when a real product photo is unavailable
// (e.g. supplier CDNs that block cross-site hotlinking), so every style still
// shows a recognisable, colour-accurate preview with no external image.

function clampByte(n) { return Math.max(0, Math.min(255, Math.round(n))); }

function parseHex(hex) {
  const v = String(hex || '').replace('#', '').trim();
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  if (!/^[0-9a-f]{6}$/i.test(full)) return [154, 163, 178]; // neutral grey
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16));
}

function toHex([r, g, b]) {
  return `#${[r, g, b].map((x) => clampByte(x).toString(16).padStart(2, '0')).join('')}`;
}

function shade([r, g, b], amt) { return toHex([r + amt, g + amt, b + amt]); }

function garmentType(category) {
  const c = String(category || '').toLowerCase();
  if (/cap|hat|headwear|beanie|visor|bucket/.test(c)) return 'cap';
  if (/hood/.test(c)) return 'hoodie';
  if (/tank/.test(c)) return 'tank';
  if (/polo/.test(c)) return 'polo';
  if (/pant|short|jogger|bottom|legging|sweatpant/.test(c)) return 'pants';
  if (/bag|tote|backpack|pack|towel/.test(c)) return 'bag';
  if (/fleece|sweat|crew|pullover|quarter|zip|jacket|outerwear|long ?sleeve/.test(c)) return 'sweatshirt';
  return 'tee';
}

const SHAPES = {
  tee: (base, dark) => (
    <>
      <path d="M35,14 L20,22 L11,40 L23,47 L30,41 L30,88 L70,88 L70,41 L77,47 L89,40 L80,22 L65,14 C60,24 40,24 35,14 Z" fill={base} />
      <path d="M35,14 C40,24 60,24 65,14 L61,17 C55,23 45,23 39,17 Z" fill={dark} />
      <path d="M20,22 L11,40 L23,47 L26,43 L18,38 L24,25 Z M80,22 L89,40 L77,47 L74,43 L82,38 L76,25 Z" fill={dark} opacity="0.5" />
    </>
  ),
  sweatshirt: (base, dark) => (
    <>
      <path d="M34,15 L18,23 L9,42 L22,50 L29,43 L29,89 L71,89 L71,43 L78,50 L91,42 L82,23 L66,15 C60,25 40,25 34,15 Z" fill={base} />
      <path d="M34,15 C40,25 60,25 66,15 L62,18 C55,24 45,24 38,18 Z" fill={dark} />
      <rect x="29" y="82" width="42" height="7" fill={dark} opacity="0.55" />
    </>
  ),
  hoodie: (base, dark) => (
    <>
      <path d="M34,16 L18,24 L9,43 L22,51 L29,44 L29,90 L71,90 L71,44 L78,51 L91,43 L82,24 L66,16 Z" fill={base} />
      <path d="M38,12 C46,6 54,6 62,12 C66,18 66,24 62,26 C54,20 46,20 38,26 C34,24 34,18 38,12 Z" fill={dark} />
      <rect x="46" y="24" width="3" height="20" fill={dark} />
      <rect x="51" y="24" width="3" height="20" fill={dark} />
      <path d="M36,60 L64,60 L60,74 L40,74 Z" fill={dark} opacity="0.45" />
    </>
  ),
  tank: (base, dark) => (
    <>
      <path d="M38,16 L30,20 L30,88 L70,88 L70,20 L62,16 C58,30 42,30 38,16 Z" fill={base} />
      <path d="M38,16 C42,30 58,30 62,16 L58,18 C54,26 46,26 42,18 Z" fill={dark} />
    </>
  ),
  polo: (base, dark) => (
    <>
      <path d="M35,16 L20,24 L11,42 L23,49 L30,43 L30,88 L70,88 L70,43 L77,49 L89,42 L80,24 L65,16 Z" fill={base} />
      <path d="M42,16 L50,30 L58,16 L52,14 L48,14 Z" fill={dark} />
      <path d="M47,17 L47,34 L53,34 L53,17 Z" fill={base} stroke={dark} strokeWidth="1.2" />
    </>
  ),
  cap: (base, dark) => (
    <>
      <path d="M22,58 C22,34 78,34 78,58 L74,58 C72,40 28,40 26,58 Z" fill={base} />
      <path d="M20,58 L82,58 C90,58 92,66 82,66 L20,66 C16,66 16,58 20,58 Z" fill={dark} />
      <circle cx="50" cy="40" r="3" fill={dark} />
    </>
  ),
  pants: (base, dark) => (
    <>
      <path d="M34,14 L66,14 L68,50 L62,88 L52,88 L50,52 L48,88 L38,88 L32,50 Z" fill={base} />
      <rect x="34" y="14" width="32" height="7" fill={dark} />
      <rect x="49" y="21" width="2" height="60" fill={dark} opacity="0.4" />
    </>
  ),
  bag: (base, dark) => (
    <>
      <path d="M32,34 L68,34 L72,88 L28,88 Z" fill={base} />
      <path d="M40,34 C40,20 60,20 60,34 L56,34 C56,26 44,26 44,34 Z" fill="none" stroke={dark} strokeWidth="3" />
    </>
  ),
};

export default function GarmentGraphic({ category, color, className = 'garment-graphic' }) {
  const rgb = parseHex(color);
  const base = toHex(rgb);
  const dark = shade(rgb, -34);
  const isLight = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) > 225;
  const draw = SHAPES[garmentType(category)] || SHAPES.tee;
  return (
    <svg className={className} viewBox="0 0 100 100" role="img" aria-label={`${category || 'Garment'} preview`}
      style={{ width: '100%', height: '100%' }}>
      {/* Outline keeps near-white garments visible on a light background. */}
      <g stroke={isLight ? '#d1d6de' : 'none'} strokeWidth={isLight ? 1 : 0}>
        {draw(base, dark)}
      </g>
    </svg>
  );
}
