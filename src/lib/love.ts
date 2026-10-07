/* Easter egg 🌷 — unlocked from the egg on the dashboard. Edit freely. */

/** Only this date of birth unlocks the surprise (1 November 2003). */
export const SECRET_DOB = '2003-11-01';

export const HER_NAME = 'Sree';

export const QUESTION = 'Will you be mine, forever?';

/** One note per day — a new one shows up every day, then the list starts over. */
export const LOVE_NOTES: string[] = [
  'You are the best thing that has ever happened to my life. Nothing else even comes close.',
  'Before you, I didn’t know a heart could feel this full. Now mine overflows every single day.',
  'If I had to choose between breathing and loving you, I would use my last breath to say I love you.',
  'You walked into my life and suddenly everything made sense.',
  'Every love song I hear now is secretly about you.',
  'I don’t need a lucky charm. I have you, and that is more luck than I deserve.',
  'Your smile is my favourite place in the whole world.',
  'In a room full of people, my eyes will always look for you.',
  'You are my today and every one of my tomorrows.',
  'I fall for you a little more every day — even on the days I think that’s impossible.',
  'Home isn’t a place anymore. Home is wherever you are.',
  'You are the answer to every prayer I never knew I was making.',
  'I would choose you in every lifetime, in every world, in every version of me.',
  'The best part of my day is any part with you in it.',
  'You make ordinary moments feel like magic.',
  'My heart was a quiet place until you came and filled it with music.',
  'I love you more than yesterday, and less than I will tomorrow.',
  'You are my calm in every storm and my sunshine on every grey day.',
  'Of all the beautiful things in this world, you are my favourite.',
  'If kisses were stars, I would give you the whole sky.',
  'Thank you for being you — the kindest, loveliest, most wonderful person I know.',
  'Loving you is the easiest thing I have ever done.',
  'You are my best friend, my peace, my happiness and my forever.',
  'When I count my blessings, I count you twice.',
  'I didn’t believe in fairy tales until I met you.',
  'You are the reason I smile at my phone like a fool.',
  'Every time I see you, I fall in love all over again.',
  'With you, I have everything. Without you, nothing feels complete.',
  'You hold my heart in your hands — and there is nowhere safer for it to be.',
  'If I could give you one thing, it would be the ability to see yourself through my eyes. Then you’d know how special you are.',
  'My favourite fairy tale is our love story.',
  'You make me want to be a better person, every single day.',
  'I love the way you laugh, the way you think, the way you are. I love all of you.',
  'You are my sweetest dream that came true.',
  'No matter where life takes us, my heart will always find its way back to you.',
  'You are not just the love of my life — you are my life.',
  'Like tulips that open for the sun, my heart opens only for you. 🌷',
  'Some people search their whole life for what I found in you.',
  'Being yours is my favourite thing to be.',
  'Today, tomorrow and always — it’s you. It will always be you.',
];

/** Same note all day, a different one tomorrow. */
export function noteOfTheDay(d = new Date()) {
  const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
  return LOVE_NOTES[day % LOVE_NOTES.length];
}
