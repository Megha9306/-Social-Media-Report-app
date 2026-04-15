/**
 * Captures a Recharts SVG inside a container element and returns a PNG data URL.
 * Returns null if the chart has not rendered, is in an empty state, or capture fails.
 */
export async function svgToPng(container: HTMLElement): Promise<string | null> {
  const svgEl = container.querySelector('svg');
  if (!svgEl) return null;

  const rect = svgEl.getBoundingClientRect();
  let w = rect.width;
  let h = rect.height;

  // Fall back to SVG attribute dimensions if bounding rect is zero
  if (w === 0) w = parseFloat(svgEl.getAttribute('width') ?? '0');
  if (h === 0) h = parseFloat(svgEl.getAttribute('height') ?? '0');
  if (w === 0 || h === 0) return null;

  // Clone to avoid mutating the live DOM
  const clone = svgEl.cloneNode(true) as SVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));

  // White background rect (Recharts SVGs are transparent by default)
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('width', '100%');
  bg.setAttribute('height', '100%');
  bg.setAttribute('fill', 'white');
  clone.insertBefore(bg, clone.firstChild);

  // Inline font-family on all text nodes — Recharts inherits it from CSS,
  // which is not available once the SVG is serialized and drawn to canvas.
  clone.querySelectorAll('text').forEach(t => {
    (t as SVGTextElement).style.fontFamily = 'Inter, system-ui, Arial, sans-serif';
  });

  const svgStr = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  return new Promise<string | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const dpr = window.devicePixelRatio || 1;
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        const ctx = canvas.getContext('2d')!;
        ctx.scale(dpr, dpr);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/png');
        resolve(dataUrl);
      } catch {
        resolve(null);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
