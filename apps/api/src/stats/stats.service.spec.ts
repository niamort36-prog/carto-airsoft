import { trackDistance } from './stats.service';

describe('distance d’une trace', () => {
  it('mesure un déplacement connu', () => {
    // Un centième de degré de latitude ≈ 1112 m.
    const distance = trackDistance([
      { t: 0, lat: 48.4, lng: 2.632 },
      { t: 10_000, lat: 48.41, lng: 2.632 },
    ]);
    expect(distance).toBeCloseTo(1112, -1);
  });

  it('cumule les segments successifs', () => {
    const aller = trackDistance([
      { t: 0, lat: 48.4, lng: 2.632 },
      { t: 1, lat: 48.41, lng: 2.632 },
    ]);
    const allerRetour = trackDistance([
      { t: 0, lat: 48.4, lng: 2.632 },
      { t: 1, lat: 48.41, lng: 2.632 },
      { t: 2, lat: 48.4, lng: 2.632 },
    ]);
    // Revenir sur ses pas ajoute de la distance, ne l'annule pas.
    expect(allerRetour).toBeCloseTo(aller * 2, 0);
  });

  it('rend zéro pour une trace trop courte ou immobile', () => {
    expect(trackDistance([])).toBe(0);
    expect(trackDistance([{ t: 0, lat: 48.4, lng: 2.632 }])).toBe(0);
    expect(
      trackDistance([
        { t: 0, lat: 48.4, lng: 2.632 },
        { t: 1, lat: 48.4, lng: 2.632 },
      ]),
    ).toBe(0);
  });
});
