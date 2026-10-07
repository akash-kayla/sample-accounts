import { X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '../components/ui';
import { HER_NAME, noteOfTheDay, QUESTION } from '../lib/love';

const TULIPS = ['🌷'];
const LOVE = ['🌷', '😘', '♥️', '💋'];

/** how many times "Not interested" runs away before it gives up */
const DODGES = 12;
const NO_LABELS = [
  'Not interested',
  'Are you sure? 🤨',
  'Think again 🥺',
  'Really really?',
  'Can’t catch me 😜',
  'Pleeease? 🌷',
  'I’ll cry 😭',
  'Nope, try Accept',
  'Look how big Accept is 👀',
  'You don’t mean it 🙈',
  'Okay, last chance…',
  'Still no? 💔',
];

type Phase = 'ask' | 'yes' | 'no';

/** Emoji rain. `pour` starts every drop from the top instead of mid-fall. */
function Rain({ emojis, count, speed = 1, pour }: { emojis: string[]; count: number; speed?: number; pour?: boolean }) {
  const drops = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const dur = (7 + Math.random() * 7) / speed;
        return {
          e: emojis[i % emojis.length],
          left: Math.random() * 100,
          size: 18 + Math.random() * 24,
          dur,
          delay: pour ? Math.random() * 3 : -Math.random() * dur,
          drift: (Math.random() - 0.5) * 140,
          spin: (Math.random() - 0.5) * 540,
          y: Math.random() * 100,
        };
      }),
    [emojis, count, speed, pour],
  );
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {drops.map((d, i) => (
        <span
          key={i}
          className="love-drop"
          style={
            {
              left: `${d.left}%`,
              fontSize: d.size,
              animationDuration: `${d.dur}s`,
              animationDelay: `${d.delay}s`,
              '--drift': `${d.drift}px`,
              '--spin': `${d.spin}deg`,
              '--y': `${d.y}vh`,
            } as CSSProperties
          }
        >
          {d.e}
        </span>
      ))}
    </div>
  );
}

function LoveScene() {
  const nav = useNavigate();
  const note = useMemo(() => noteOfTheDay(), []);
  const [phase, setPhase] = useState<Phase>('ask');
  const [dodges, setDodges] = useState(0);
  const [noPos, setNoPos] = useState<{ x: number; y: number } | null>(null);
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([]);
  const noRef = useRef<HTMLButtonElement>(null);
  const yesRef = useRef<HTMLButtonElement>(null);
  const caught = dodges >= DODGES;

  // full-screen: no page scroll behind, Escape goes back to the books
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && nav('/');
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [nav]);

  // jump somewhere random on screen — far from where it was and never on top of Accept
  const dodge = () => {
    const b = noRef.current;
    if (!b || caught) return;
    const pad = 16;
    const w = Math.min(Math.max(b.offsetWidth, 230), window.innerWidth - pad * 2);
    const h = b.offsetHeight;
    const cur = b.getBoundingClientRect();
    const yes = yesRef.current?.getBoundingClientRect();
    let x = pad;
    let y = pad;
    for (let i = 0; i < 30; i++) {
      x = pad + Math.random() * Math.max(0, window.innerWidth - w - pad * 2);
      y = pad + Math.random() * Math.max(0, window.innerHeight - h - pad * 2);
      const far = Math.hypot(x - cur.left, y - cur.top) > 140;
      const clearOfYes = !yes || x + w < yes.left - 16 || x > yes.right + 16 || y + h < yes.top - 16 || y > yes.bottom + 16;
      if (far && clearOfYes) break;
    }
    setNoPos({ x, y });
    setDodges((d) => d + 1);
  };

  const sprinkle = (e: PointerEvent) => {
    const id = performance.now() + Math.random();
    setBursts((b) => [...b.slice(-5), { id, x: e.clientX, y: e.clientY }]);
    setTimeout(() => setBursts((b) => b.filter((p) => p.id !== id)), 1000);
  };

  const reset = () => {
    setPhase('ask');
    setDodges(0);
    setNoPos(null);
  };

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className={cn('love-page fixed inset-0 z-[70] overflow-y-auto overflow-x-hidden', phase === 'no' && 'is-sad')} onPointerDown={sprinkle}>
      <Rain emojis={TULIPS} count={phase === 'yes' ? 18 : 32} />
      {phase === 'yes' && <Rain emojis={LOVE} count={70} speed={1.6} pour />}

      {bursts.map((b) => (
        <span key={b.id} aria-hidden className="pointer-events-none fixed z-[80]" style={{ left: b.x, top: b.y }}>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            const r = 50 + (i % 3) * 18;
            return (
              <span key={i} className="love-pop" style={{ '--dx': `${Math.cos(a) * r}px`, '--dy': `${Math.sin(a) * r}px` } as CSSProperties}>
                {phase === 'yes' ? LOVE[i % LOVE.length] : '🌷'}
              </span>
            );
          })}
        </span>
      ))}

      <button
        type="button"
        aria-label="Back to the books"
        onClick={() => nav('/')}
        onPointerDown={(e) => e.stopPropagation()}
        className="fixed right-4 top-4 z-[90] inline-flex size-10 items-center justify-center rounded-full bg-white/70 text-rose-800 shadow-md backdrop-blur transition hover:bg-white"
      >
        <X className="size-5" />
      </button>

      <main className="relative z-10 flex min-h-full flex-col items-center justify-center px-4 py-16 text-center" aria-live="polite">
        {phase === 'ask' && (
          <div key="ask" className="love-in flex w-full max-w-xl flex-col items-center">
            <p className="rounded-full bg-white/60 px-4 py-1.5 text-xs font-semibold text-rose-700 shadow-sm backdrop-blur">
              🌷 Today’s note for {HER_NAME} · {today}
            </p>
            <figure className="mt-6 w-full rounded-3xl border border-white/70 bg-white/55 px-6 py-8 shadow-xl shadow-rose-300/30 backdrop-blur-md sm:px-10 sm:py-10">
              <span aria-hidden className="block font-serif text-6xl leading-none text-rose-300">
                “
              </span>
              <blockquote className="-mt-3 font-serif text-2xl italic leading-snug text-rose-950 text-balance sm:text-[32px]">{note}</blockquote>
              <figcaption className="mt-6 text-sm font-medium text-rose-700">— yours, always 💗</figcaption>
            </figure>

            <h1 className="mt-10 text-2xl font-bold tracking-tight text-rose-900 sm:text-3xl">{QUESTION}</h1>
            <div className="mt-6 flex items-center justify-center gap-4">
              <button
                ref={yesRef}
                type="button"
                onClick={() => setPhase('yes')}
                style={{ transform: `scale(${1 + dodges * 0.05})` }}
                className="h-12 whitespace-nowrap rounded-full bg-rose-600 px-8 text-base font-bold text-white shadow-lg shadow-rose-500/40 transition-[transform,background] duration-300 hover:bg-rose-700"
              >
                Accept 💗
              </button>
              <button
                ref={noRef}
                type="button"
                onPointerEnter={(e) => e.pointerType === 'mouse' && dodge()}
                onClick={() => (caught ? setPhase('no') : dodge())}
                style={noPos ? { position: 'fixed', left: noPos.x, top: noPos.y, zIndex: 85 } : undefined}
                className="h-12 whitespace-nowrap rounded-full border border-rose-200 bg-white/85 px-6 text-base font-semibold text-rose-700 shadow-md transition-[left,top] duration-200 ease-out"
              >
                {NO_LABELS[Math.min(dodges, NO_LABELS.length - 1)]}
              </button>
            </div>
          </div>
        )}

        {phase === 'yes' && (
          <div key="yes" className="love-in flex max-w-xl flex-col items-center">
            <span aria-hidden className="love-beat text-8xl">
              ❤️
            </span>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-rose-900 sm:text-5xl">Yaaay! 🥰</h1>
            <p className="mt-4 text-lg text-rose-800 text-balance sm:text-xl">
              You just made me the happiest person alive. I love you, {HER_NAME} — today, tomorrow and always. 😘💋
            </p>
            <p className="mt-8 max-w-md font-serif text-base italic text-rose-700/90 text-balance">“{note}”</p>
          </div>
        )}

        {phase === 'no' && (
          <div key="no" className="love-in flex max-w-md flex-col items-center">
            <span aria-hidden className="love-wobble text-[120px] leading-none">
              😢
            </span>
            <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-800">Okay… that broke my heart a little 💔</h1>
            <p className="mt-3 text-base text-slate-600 text-balance">I’ll still be right here, loving you anyway.</p>
            <button
              type="button"
              onClick={reset}
              onPointerDown={(e) => e.stopPropagation()}
              className="mt-8 h-12 rounded-full bg-rose-600 px-7 font-semibold text-white shadow-lg shadow-rose-500/30 transition hover:bg-rose-700"
            >
              Wait, I changed my mind 🌷
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

/** Only reachable by unlocking the egg on the dashboard. */
export default function ForYou() {
  const loc = useLocation();
  if (!(loc.state as { unlocked?: boolean } | null)?.unlocked) return <Navigate to="/" replace />;
  return <LoveScene />;
}
