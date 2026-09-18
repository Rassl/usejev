// Generates the shared Open Graph image at public/og.png (1200x630).
// Run with `npm run og` after changing the design. Uses sharp, which ships with Astro.
import sharp from 'sharp';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#f6f3ea"/>
  <rect x="0" y="0" width="24" height="630" fill="#1d5a41"/>
  <rect x="96" y="96" width="120" height="96" rx="14" fill="#f4d35e"/>
  <text x="156" y="166" font-family="Menlo, Consolas, monospace" font-size="64" font-weight="700" text-anchor="middle" fill="#1b1d1f">?:</text>
  <text x="244" y="164" font-family="Menlo, Consolas, monospace" font-size="56" font-weight="700" fill="#1b1d1f">usejev<tspan fill="#55595e">.dev</tspan></text>
  <text x="96" y="320" font-family="Helvetica, Arial, sans-serif" font-size="76" font-weight="700" fill="#1b1d1f">Practical Jev use cases,</text>
  <text x="96" y="410" font-family="Helvetica, Arial, sans-serif" font-size="76" font-weight="700" fill="#1d5a41">with working code</text>
  <text x="96" y="520" font-family="Menlo, Consolas, monospace" font-size="30" fill="#55595e">Choice · Score · Noul · confidence gating · cost math</text>
  <text x="96" y="572" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#55595e">Unofficial community resource. Not affiliated with TypeSafe AI.</text>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile('public/og.png');
console.log('Wrote public/og.png');
