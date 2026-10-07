import { describe, expect, it } from 'vitest';
import { LOVE_NOTES, noteOfTheDay } from './love';

describe('love notes', () => {
  it('has no duplicate notes', () => {
    expect(new Set(LOVE_NOTES).size).toBe(LOVE_NOTES.length);
  });

  it('shows a different note on consecutive days, same note all day', () => {
    expect(noteOfTheDay(new Date(2026, 9, 7, 0, 5))).toBe(noteOfTheDay(new Date(2026, 9, 7, 23, 55)));
    for (let d = 1; d < 400; d++) {
      expect(noteOfTheDay(new Date(2026, 0, d))).not.toBe(noteOfTheDay(new Date(2026, 0, d + 1)));
    }
  });
});
