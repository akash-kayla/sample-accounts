import type { Settings } from '../lib/types';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').slice(0, 120);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export interface LogoImage {
  dataUrl: string;
  width: number;
  height: number;
}

/** Any image (png/jpg/webp/svg data URL or path) → PNG data URL + size, via canvas */
export async function toPng(src: string, maxW = 800): Promise<LogoImage> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  await img.decode();
  const scale = Math.min(1, maxW / img.naturalWidth);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')!.drawImage(img, 0, 0, w, h);
  return { dataUrl: c.toDataURL('image/png'), width: w, height: h };
}

const logoCache = new Map<string, Promise<LogoImage | null>>();

export function loadLogo(settings: Settings): Promise<LogoImage | null> {
  const src = settings.company.logo || '/logo.png';
  let p = logoCache.get(src);
  if (!p) {
    p = (async () => {
      try {
        if (src.startsWith('data:')) return await toPng(src);
        const blob = await (await fetch(src)).blob();
        return await toPng(await blobToDataUrl(blob));
      } catch {
        return null;
      }
    })();
    logoCache.set(src, p);
  }
  return p;
}

export function companyLines(s: Settings): string[] {
  const c = s.company;
  return [
    c.address,
    [c.city, c.state, c.country].filter(Boolean).join(', ') + (c.pincode ? ` ${c.pincode}` : ''),
    [c.phone && `Ph: ${c.phone}`, c.email].filter(Boolean).join('  ·  '),
    c.gstin ? `GSTIN: ${c.gstin}` : '',
  ].filter((x) => x && x.trim());
}
