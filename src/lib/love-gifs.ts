/* GIFs for the easter egg page 🌷
   - Every image dropped into src/assets/love/ is picked up automatically.
     Files with "sad" in the name show when she presses "Not interested"; all others show as love / kiss GIFs.
   - Bubu & Dudu GIFs are also pulled from GIPHY (key below; VITE_GIPHY_KEY overrides it). */
import { useEffect, useState } from 'react';
import { dayNumber } from './love';

export type GifKind = 'love' | 'kiss' | 'sad';
export type Gif = { src: string; alt: string; giphy?: boolean };

const files = import.meta.glob<string>('../assets/love/*.{gif,webp,png,jpg,jpeg}', { eager: true, query: '?url', import: 'default' });
const local = Object.entries(files).map(([path, src]) => ({ src, name: path.split('/').pop()!.toLowerCase() }));
const toGif = (f: (typeof local)[number]): Gif => ({ src: f.src, alt: f.name.replace(/\.\w+$/, '').replace(/[-_]+/g, ' ') });
const LOCAL: Record<GifKind, Gif[]> = {
  love: local.filter((f) => !f.name.includes('sad')).map(toGif),
  kiss: local.filter((f) => !f.name.includes('sad')).map(toGif),
  sad: local.filter((f) => f.name.includes('sad')).map(toGif),
};

// GIPHY keys are public by design (they ship in the browser bundle either way)
const KEY = (import.meta.env.VITE_GIPHY_KEY as string | undefined) || '2YMas2UrcEy1gaGkG3cgg4zFl8hkEsTs';
// GIPHY's mood searches ("bubu dudu kiss") mostly return other characters, so only keep GIFs
// from the Bubu & Dudu artist's own GIPHY channel. "bubu dudu" alone returns 100+ of theirs.
const ARTIST = 'durback';
type Search = { q: string; offset: number };
const SEARCHES: Record<GifKind, Search[]> = {
  love: [
    { q: 'bubu dudu', offset: 0 },
    { q: 'bubu dudu', offset: 50 },
  ],
  kiss: [
    { q: 'bubu dudu', offset: 0 },
    { q: 'bubu dudu', offset: 50 },
  ],
  sad: [
    { q: 'bubu dudu sad', offset: 0 },
    { q: 'bubu dudu miss you', offset: 0 },
  ],
};

type Cached = { day: number; gifs: Gif[] };
const cacheKey = (s: Search) => `love-gifs:${s.q}:${s.offset}`;

function cachedSearch(s: Search): Gif[] | null {
  try {
    const c = JSON.parse(localStorage.getItem(cacheKey(s)) ?? 'null') as Cached | null;
    return c?.day === dayNumber() ? c.gifs : null;
  } catch {
    return null;
  }
}

/** Today's cached GIPHY GIFs for this kind, or null if any search still needs fetching. */
function cached(kind: GifKind): Gif[] | null {
  const lists = SEARCHES[kind].map(cachedSearch);
  return lists.every(Boolean) ? dedupe(lists.flat() as Gif[]) : null;
}

const dedupe = (gifs: Gif[]) => [...new Map(gifs.map((g) => [g.src, g])).values()];

interface GiphyResponse {
  data: { title?: string; username?: string; images: { downsized?: { url: string }; fixed_height: { url: string } } }[];
}

// each search runs once a day at most (cached), so a free GIPHY key is plenty
async function runSearch(s: Search): Promise<Gif[]> {
  const hit = cachedSearch(s);
  if (hit) return hit;
  const qs = new URLSearchParams({ api_key: KEY!, q: s.q, limit: '50', offset: String(s.offset), rating: 'g', lang: 'en' });
  const res = await fetch(`https://api.giphy.com/v1/gifs/search?${qs}`);
  if (!res.ok) throw new Error(`GIPHY ${res.status}`);
  const { data } = (await res.json()) as GiphyResponse;
  const gifs = data
    .filter((g) => g.username === ARTIST)
    .map((g) => ({ src: g.images.downsized?.url || g.images.fixed_height.url, alt: 'Bubu and Dudu', giphy: true }));
  try {
    localStorage.setItem(cacheKey(s), JSON.stringify({ day: dayNumber(), gifs } satisfies Cached));
  } catch {
    /* storage blocked — just don't cache */
  }
  return gifs;
}

const searchGiphy = async (kind: GifKind) => dedupe((await Promise.all(SEARCHES[kind].map(runSearch))).flat());

// the "love" GIF changes once a day like the note; kiss / sad are a surprise every time
function pick(pool: Gif[], kind: GifKind): Gif | null {
  if (!pool.length) return null;
  const i = kind === 'love' ? dayNumber() : Math.floor(Math.random() * pool.length);
  return pool[i % pool.length];
}

/** A GIF for the given moment. `null` while GIPHY is loading, or when there's nothing to show. */
export function useLoveGif(kind: GifKind): Gif | null {
  const [gif, setGif] = useState<Gif | null>(() => {
    if (!KEY) return pick(LOCAL[kind], kind);
    const hit = cached(kind);
    return hit ? pick([...LOCAL[kind], ...hit], kind) : null;
  });

  useEffect(() => {
    if (!KEY || gif) return;
    let alive = true;
    searchGiphy(kind)
      .then((g) => alive && setGif(pick([...LOCAL[kind], ...g], kind)))
      .catch(() => alive && setGif(pick(LOCAL[kind], kind)));
    return () => {
      alive = false;
    };
  }, [kind]); // fetch once per kind

  return gif;
}
