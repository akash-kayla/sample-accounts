import { useEffect } from 'react';
import { toast } from 'sonner';

const KEY = 'bananads-water-break';
const EVERY = 30 * 60_000; // remind after this much active use
const SNOOZE = 5 * 60_000;
const IDLE = 5 * 60_000; // no clicks / keys / scrolling for this long → not using the app
const AWAY = 15 * 60_000; // gone this long → that was the break, start counting again
const TICK = 15_000;

const SIPS = ['🥛', '💧', '🧊', '🥤', '🫗', '🍋', '🧃', '🚰'];

const MESSAGES = [
  { title: 'Sip sip, hooray! 💧', body: '30 minutes of hard work — your brain deserves a big glass of water 🥛' },
  { title: 'Hydration station! 🚰', body: 'Pause, stretch those arms up high, and drink some water 💦' },
  { title: 'Water you doing? 😄', body: 'Still here? Grab a glass of water and rest your eyes for a bit 👀' },
  { title: 'Glass half empty? 🥛', body: 'Let’s make it full! Time for a quick water break 💧' },
  { title: 'Psst… your plants drink more than you 🌱', body: 'Grab some water and take a 2-minute break 🧊' },
  { title: 'Break time! ⏰', body: 'Look away from the screen, roll your shoulders, sip sip 🥤' },
  { title: 'Stay cool, stay hydrated 😎', body: 'A glass of water + a little stretch = a happy you 💙' },
  { title: 'Ding ding! 🔔', body: 'The numbers can wait. A glass of water can’t 🫗' },
];

type Usage = { used: number; at: number; n: number };

// in-memory copy for when browser storage is blocked
let mem: Usage | null = null;

function read(now: number): Usage {
  let u = mem;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) u = JSON.parse(raw) as Usage;
  } catch {
    /* storage blocked — fall back to memory */
  }
  if (!u || typeof u.used !== 'number') u = { used: 0, at: now, n: 0 };
  return now - u.at > AWAY ? { ...u, used: 0, at: now } : { ...u };
}

function write(u: Usage) {
  mem = u;
  try {
    localStorage.setItem(KEY, JSON.stringify(u));
  } catch {
    /* storage blocked */
  }
}

/** Cute glass of water with a face, a straw, a wobbly wave and bubbles. */
function WaterGlass({ className }: { className?: string }) {
  const glass = 'M8 8 H56 L50.5 75 Q50 81 44 81 H20 Q14 81 13.5 75 Z';
  const wave = (y: number) => `M-32 ${y} q8 -3.5 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 V84 H-32 Z`;
  return (
    <svg viewBox="0 0 64 84" className={className} aria-hidden>
      <defs>
        <clipPath id="water-glass-clip">
          <path d={glass} />
        </clipPath>
      </defs>
      <path d="M45 1 L37 52" stroke="#f472b6" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M45 1 L37 52" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeDasharray="3 5" opacity="0.7" />
      <g clipPath="url(#water-glass-clip)">
        <rect width="64" height="84" fill="#e0f2fe" opacity="0.55" />
        <g className="water-wave-back">
          <path d={wave(29)} fill="#38bdf8" opacity="0.5" />
        </g>
        <g className="water-wave">
          <path d={wave(32)} fill="#7dd3fc" />
        </g>
        <rect className="water-ice" x="18" y="33" width="12" height="12" rx="3" fill="#fff" opacity="0.8" />
        <circle className="water-bubble" cx="24" cy="76" r="1.6" fill="#fff" />
        <circle className="water-bubble" cx="40" cy="78" r="2" fill="#fff" style={{ animationDelay: '0.7s' }} />
        <circle className="water-bubble" cx="32" cy="77" r="1.3" fill="#fff" style={{ animationDelay: '1.4s' }} />
      </g>
      <path d={glass} fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M15.5 15 L19.5 66" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.75" />
      <circle cx="26" cy="55" r="2.5" fill="#0c4a6e" />
      <circle cx="38" cy="55" r="2.5" fill="#0c4a6e" />
      <circle cx="26.8" cy="54.2" r="0.8" fill="#fff" />
      <circle cx="38.8" cy="54.2" r="0.8" fill="#fff" />
      <path d="M28 61 Q32 65 36 61" stroke="#0c4a6e" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="21.5" cy="60" rx="3" ry="1.8" fill="#f9a8d4" opacity="0.85" />
      <ellipse cx="42.5" cy="60" rx="3" ry="1.8" fill="#f9a8d4" opacity="0.85" />
    </svg>
  );
}

function WaterToast({ title, body, onDone, onSnooze }: { title: string; body: string; onDone: () => void; onSnooze: () => void }) {
  return (
    <div className="relative w-[356px] max-w-full overflow-hidden rounded-2xl border border-sky-200 bg-surface p-4 shadow-xl shadow-sky-500/15 dark:border-sky-900">
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-sky-100 dark:bg-sky-950/70" />
      <div className="relative flex gap-3">
        <WaterGlass className="water-bob h-[84px] w-16 shrink-0" />
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[15px] font-bold text-ink">{title}</p>
          <p className="mt-1 text-sm leading-snug text-ink-2">{body}</p>
        </div>
      </div>
      <div aria-hidden className="relative mt-3 flex justify-between px-1 text-xl">
        {SIPS.map((s, i) => (
          <span key={s} className="water-hop" style={{ animationDelay: `${i * 0.1}s` }}>
            {s}
          </span>
        ))}
      </div>
      <div className="relative mt-3 flex gap-2">
        <button
          type="button"
          onClick={onSnooze}
          className="h-9 flex-1 rounded-xl border border-line text-sm font-semibold text-ink-2 transition hover:bg-surface-2 hover:text-ink"
        >
          In 5 min ⏰
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-9 flex-[1.4] rounded-xl bg-sky-700 text-sm font-bold text-white shadow-sm shadow-sky-700/30 transition hover:bg-sky-800"
        >
          Done, I drank! 💧
        </button>
      </div>
    </div>
  );
}

/** Shows the water-break toast (the n-th message, cycling). */
export function showWaterBreak(n = 0) {
  const m = MESSAGES[n % MESSAGES.length];
  toast.custom(
    (id) => (
      <WaterToast
        {...m}
        onSnooze={() => {
          write({ ...read(Date.now()), used: EVERY - SNOOZE });
          toast.dismiss(id);
        }}
        onDone={() => {
          toast.dismiss(id);
          toast('Hydrated & happy! 💙', { icon: '🥛', description: 'Your body says thank you ✨' });
        }}
      />
    ),
    { id: 'water-break', duration: Infinity },
  );
}

/** After 30 minutes of actually using the app, remind to take a break and drink water. */
export function BreakReminder() {
  useEffect(() => {
    let lastInput = Date.now();
    let lastTick = Date.now();
    const onInput = () => {
      lastInput = Date.now();
    };
    const tick = () => {
      const now = Date.now();
      const dt = Math.min(now - lastTick, TICK * 2); // laptop sleep / throttled tabs don't count
      lastTick = now;
      if (document.visibilityState !== 'visible' || now - lastInput > IDLE) return;
      const u = read(now); // re-read so several open tabs share one counter
      u.used += dt;
      u.at = now;
      if (u.used >= EVERY) {
        u.used = 0;
        showWaterBreak(u.n);
        u.n++;
      }
      write(u);
    };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, onInput, { passive: true }));
    const t = window.setInterval(tick, TICK);
    return () => {
      window.clearInterval(t);
      events.forEach((e) => window.removeEventListener(e, onInput));
    };
  }, []);
  return null;
}
