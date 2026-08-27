import { describe, expect, it } from 'vitest';
import { positionAt } from './replay-timeline';
import type { TrackPoint } from './api';

const track: TrackPoint[] = [
  { t: 1000, lat: 48.4, lng: 2.63 },
  { t: 2000, lat: 48.41, lng: 2.63 },
  { t: 4000, lat: 48.41, lng: 2.65 },
];

describe('position d’une unité dans le rejeu', () => {
  it('rend la position exacte sur un relevé', () => {
    expect(positionAt(track, 1000)).toEqual({ lat: 48.4, lng: 2.63 });
    expect(positionAt(track, 2000)).toEqual({ lat: 48.41, lng: 2.63 });
    expect(positionAt(track, 4000)).toEqual({ lat: 48.41, lng: 2.65 });
  });

  it('interpole entre deux relevés', () => {
    // À mi-chemin du premier segment.
    const milieu = positionAt(track, 1500)!;
    expect(milieu.lat).toBeCloseTo(48.405, 6);
    expect(milieu.lng).toBeCloseTo(2.63, 6);

    // Au quart du second, plus long : l'interpolation suit la durée réelle,
    // pas le rang du point.
    const quart = positionAt(track, 2500)!;
    expect(quart.lng).toBeCloseTo(2.635, 6);
  });

  it('ne place pas l’unité avant son arrivée ni après son départ', () => {
    expect(positionAt(track, 999)).toBeNull();
    expect(positionAt(track, 4001)).toBeNull();
  });

  it('supporte une trace vide ou d’un seul point', () => {
    expect(positionAt([], 1000)).toBeNull();
    const seul: TrackPoint[] = [{ t: 1000, lat: 48.4, lng: 2.63 }];
    expect(positionAt(seul, 1000)).toEqual({ lat: 48.4, lng: 2.63 });
    expect(positionAt(seul, 1001)).toBeNull();
  });

  it('reste juste sur une longue trace (recherche dichotomique)', () => {
    const longue: TrackPoint[] = Array.from({ length: 5000 }, (_, i) => ({
      t: i * 1000,
      lat: 48.4 + i * 0.0001,
      lng: 2.63,
    }));
    const milieu = positionAt(longue, 2500 * 1000 + 500)!;
    expect(milieu.lat).toBeCloseTo(48.4 + 2500.5 * 0.0001, 8);
  });
});
