import {
  affiliationFromCotType,
  argbFromHex,
  buildCotDocument,
  buildCotEvent,
  cotTypeFor,
  hexFromArgb,
  looksLikeCot,
  parseCot,
} from './cot';

describe('interopérabilité CoT (§3)', () => {
  describe('types et affiliations', () => {
    it('superpose nos camps sur les affiliations CoT', () => {
      expect(cotTypeFor('marker', 'allied', 'unit')).toBe('a-f-G-U-C');
      expect(cotTypeFor('marker', 'hostile', 'unit')).toBe('a-h-G-U-C');
      expect(cotTypeFor('marker', 'neutral', 'unit')).toBe('a-n-G-U-C');
      expect(cotTypeFor('marker', 'unknown', 'unit')).toBe('a-u-G-U-C');
    });

    it('distingue unité, installation, point de passage et tracé', () => {
      expect(cotTypeFor('marker', 'hostile', 'structure')).toBe('a-h-G-I');
      expect(cotTypeFor('marker', null, 'point')).toBe('b-m-p-w');
      expect(cotTypeFor('line', 'allied', 'unit')).toBe('u-d-f');
      expect(cotTypeFor('zone', 'allied', 'unit')).toBe('u-d-f');
    });

    it('relit l’affiliation d’un type venu d’ailleurs', () => {
      expect(affiliationFromCotType('a-f-G-U-C')).toBe('allied');
      expect(affiliationFromCotType('a-h-G-U-C-I')).toBe('hostile');
      expect(affiliationFromCotType('a-n-G')).toBe('neutral');
      // Suspect et faux-ami se rangent du côté hostile : sur le terrain on
      // préfère traiter un doute comme une menace.
      expect(affiliationFromCotType('a-s-G')).toBe('hostile');
      expect(affiliationFromCotType('a-k-G')).toBe('hostile');
      // Ce qui n'est pas une « atome » n'a pas d'affiliation.
      expect(affiliationFromCotType('b-m-p-w')).toBe('unknown');
      expect(affiliationFromCotType('u-d-f')).toBe('unknown');
    });
  });

  describe('écriture', () => {
    const base = {
      uid: 'carto-1',
      type: 'a-f-G-U-C',
      time: new Date('2026-08-27T10:00:00.000Z'),
      start: new Date('2026-08-27T10:00:00.000Z'),
      stale: new Date('2026-08-27T10:02:00.000Z'),
      how: 'm-g',
      point: { lat: 48.404, lon: 2.632 },
    };

    it('produit un événement avec ses trois dates et son point', () => {
      const xml = buildCotEvent({ ...base, callsign: 'Loup-01' });
      expect(xml).toContain('uid="carto-1"');
      expect(xml).toContain('type="a-f-G-U-C"');
      expect(xml).toContain('stale="2026-08-27T10:02:00.000Z"');
      expect(xml).toContain('lat="48.404"');
      expect(xml).toContain('lon="2.632"');
      expect(xml).toContain('callsign="Loup-01"');
      // Les valeurs inconnues suivent la convention CoT.
      expect(xml).toContain('hae="9999999"');
    });

    it('écrit les sommets d’un tracé en <link>', () => {
      const xml = buildCotEvent({
        ...base,
        type: 'u-d-f',
        links: [
          [48.4, 2.63],
          [48.41, 2.64],
        ],
      });
      expect(xml).toContain('point="48.4,2.63"');
      expect(xml).toContain('point="48.41,2.64"');
    });

    it('emballe un lot dans un document relisible', () => {
      const doc = buildCotDocument([base, { ...base, uid: 'carto-2' }]);
      expect(doc).toContain('<?xml');
      expect(parseCot(doc)).toHaveLength(2);
    });
  });

  describe('lecture', () => {
    const atak = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <event version="2.0" uid="ANDROID-352" type="a-h-G-U-C"
             time="2026-08-27T10:00:00Z" start="2026-08-27T10:00:00Z"
             stale="2026-08-27T10:05:00Z" how="h-e">
        <point lat="48.4065" lon="2.6320" hae="9999999" ce="9999999" le="9999999"/>
        <detail>
          <contact callsign="ENI-01"/>
          <__group name="Red" role="Team Member"/>
          <remarks>section repérée</remarks>
        </detail>
      </event>`;

    it('reconnaît un flux CoT', () => {
      expect(looksLikeCot(atak)).toBe(true);
      expect(looksLikeCot('{"type":"FeatureCollection"}')).toBe(false);
    });

    it('relit un événement produit par un client TAK', () => {
      const [event] = parseCot(atak);
      expect(event.uid).toBe('ANDROID-352');
      expect(event.type).toBe('a-h-G-U-C');
      expect(event.point.lat).toBeCloseTo(48.4065);
      expect(event.point.lon).toBeCloseTo(2.632);
      expect(event.callsign).toBe('ENI-01');
      expect(event.remarks).toBe('section repérée');
      expect(event.group).toEqual({ name: 'Red', role: 'Team Member' });
      expect(event.stale.toISOString()).toBe('2026-08-27T10:05:00.000Z');
      // Les 9999999 sont une convention d'inconnu, pas une altitude.
      expect(event.point.hae).toBeUndefined();
    });

    it('relit un tracé et ses sommets', () => {
      const [event] = parseCot(`<events><event uid="t1" type="u-d-f"
          time="2026-08-27T10:00:00Z" start="2026-08-27T10:00:00Z"
          stale="2026-08-27T11:00:00Z" how="h-e">
          <point lat="48.40" lon="2.62"/>
          <detail>
            <strokeColor value="-65536"/>
            <link point="48.40,2.62"/>
            <link point="48.41,2.63"/>
            <link point="48.42,2.62"/>
          </detail>
        </event></events>`);
      expect(event.links).toEqual([
        [48.4, 2.62],
        [48.41, 2.63],
        [48.42, 2.62],
      ]);
      expect(event.color).toBe('#FF0000');
    });

    it('écarte un événement sans point exploitable', () => {
      expect(
        parseCot('<events><event uid="x" type="a-f-G"/></events>'),
      ).toHaveLength(0);
    });

    it('fait l’aller-retour sans rien perdre d’essentiel', () => {
      const original = {
        uid: 'carto-42',
        type: 'a-h-G-U-C',
        time: new Date('2026-08-27T10:00:00.000Z'),
        start: new Date('2026-08-27T10:00:00.000Z'),
        stale: new Date('2026-08-27T10:10:00.000Z'),
        how: 'h-e',
        point: { lat: 48.404, lon: 2.632 },
        callsign: 'Position ennemie',
        cartoIcon: 'mortar_hostile',
      };
      const [relu] = parseCot(buildCotEvent(original));
      expect(relu.uid).toBe(original.uid);
      expect(relu.type).toBe(original.type);
      expect(relu.callsign).toBe(original.callsign);
      // L'extension maison survit à l'aller-retour : on retrouve l'insigne
      // exact plutôt qu'un équivalent approché.
      expect(relu.cartoIcon).toBe('mortar_hostile');
      expect(relu.stale.toISOString()).toBe(original.stale.toISOString());
    });
  });

  describe('couleurs', () => {
    it('convertit dans les deux sens l’entier signé ARGB de TAK', () => {
      expect(argbFromHex('#FF0000')).toBe(-65536);
      expect(hexFromArgb('-65536')).toBe('#FF0000');
      expect(argbFromHex('#FFFFFF')).toBe(-1);
      expect(hexFromArgb('-1')).toBe('#FFFFFF');
      expect(hexFromArgb('pas un nombre')).toBeUndefined();
    });
  });
});
