import { detectFormat, LayerParseError, parseLayer } from './parse';

describe('lecture des préparations externes (§7.10)', () => {
  describe('reconnaissance du format', () => {
    it('reconnaît le GeoJSON et le KML sans se fier à l’extension', () => {
      expect(detectFormat('  {"type":"FeatureCollection"}')).toBe('geojson');
      expect(detectFormat('<?xml version="1.0"?><kml></kml>')).toBe('kml');
      expect(detectFormat('<kml xmlns="http://x"></kml>')).toBe('kml');
      expect(() => detectFormat('nom;lat;lng')).toThrow(LayerParseError);
    });
  });

  describe('GeoJSON', () => {
    it('traduit chaque géométrie dans le bon type d’objet', () => {
      const features = parseLayer(
        JSON.stringify({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { name: 'Point de départ', 'marker-color': '#FF0000' },
              geometry: { type: 'Point', coordinates: [2.632, 48.404] },
            },
            {
              type: 'Feature',
              properties: { name: 'Axe de progression', stroke: '#2196F3' },
              geometry: {
                type: 'LineString',
                coordinates: [
                  [2.63, 48.4],
                  [2.64, 48.41],
                ],
              },
            },
            {
              type: 'Feature',
              properties: { name: 'Zone de jeu' },
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [2.62, 48.4],
                    [2.65, 48.4],
                    [2.65, 48.42],
                    [2.62, 48.4],
                  ],
                ],
              },
            },
          ],
        }),
        'geojson',
      );

      expect(features.map((f) => f.kind)).toEqual(['marker', 'line', 'zone']);
      expect(features[0]).toMatchObject({
        lat: 48.404,
        lng: 2.632,
        label: 'Point de départ',
        color: '#FF0000',
        geometry: null,
      });
      // Le point de référence d'une ligne est son premier sommet.
      expect(features[1]).toMatchObject({ lat: 48.4, lng: 2.63 });
      expect(features[1].geometry).toEqual({
        type: 'LineString',
        coordinates: [
          [2.63, 48.4],
          [2.64, 48.41],
        ],
      });
      expect(features[2].label).toBe('Zone de jeu');
    });

    it('éclate les géométries multiples en entités distinctes', () => {
      const features = parseLayer(
        JSON.stringify({
          type: 'Feature',
          properties: { name: 'Trois postes' },
          geometry: {
            type: 'MultiPoint',
            coordinates: [
              [2.6, 48.4],
              [2.61, 48.41],
              [2.62, 48.42],
            ],
          },
        }),
        'geojson',
      );
      expect(features).toHaveLength(3);
      expect(features.every((f) => f.kind === 'marker')).toBe(true);
      expect(features.every((f) => f.label === 'Trois postes')).toBe(true);
    });

    it('ignore ce qui n’est pas exploitable plutôt que de tout refuser', () => {
      const features = parseLayer(
        JSON.stringify({
          type: 'FeatureCollection',
          features: [
            // Ligne d'un seul point : inutilisable, écartée.
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: [[2.6, 48.4]] },
            },
            {
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: [2.6, 48.4] },
            },
          ],
        }),
        'geojson',
      );
      expect(features).toHaveLength(1);
      expect(features[0].kind).toBe('marker');
    });

    it('refuse un JSON illisible et un fichier sans géométrie', () => {
      expect(() => parseLayer('{ pas du json', 'geojson')).toThrow(
        LayerParseError,
      );
      expect(() =>
        parseLayer('{"type":"FeatureCollection","features":[]}', 'geojson'),
      ).toThrow(LayerParseError);
    });
  });

  describe('KML', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
      <kml xmlns="http://www.opengis.net/kml/2.2">
        <Document>
          <Style id="rouge">
            <LineStyle><color>ff0000ff</color></LineStyle>
          </Style>
          <Placemark>
            <name>Objectif Alpha</name>
            <Point><coordinates>2.632,48.4065,0</coordinates></Point>
          </Placemark>
          <Placemark>
            <name>Limite ouest</name>
            <styleUrl>#rouge</styleUrl>
            <LineString>
              <coordinates>2.62,48.40,0 2.62,48.41,0</coordinates>
            </LineString>
          </Placemark>
          <Placemark>
            <name>Zone interdite</name>
            <Polygon><outerBoundaryIs><LinearRing>
              <coordinates>
                2.62,48.40 2.65,48.40 2.65,48.42 2.62,48.40
              </coordinates>
            </LinearRing></outerBoundaryIs></Polygon>
          </Placemark>
        </Document>
      </kml>`;

    it('lit points, lignes et polygones avec leurs noms', () => {
      const features = parseLayer(kml, 'kml');
      expect(features.map((f) => f.kind).sort()).toEqual([
        'line',
        'marker',
        'zone',
      ]);
      const point = features.find((f) => f.kind === 'marker')!;
      expect(point.label).toBe('Objectif Alpha');
      expect(point.lat).toBeCloseTo(48.4065);
      expect(point.lng).toBeCloseTo(2.632);
    });

    it('convertit la couleur KML (aabbggrr) vers le web (#rrggbb)', () => {
      const line = parseLayer(kml, 'kml').find((f) => f.kind === 'line')!;
      // ff0000ff = alpha ff, bleu 00, vert 00, rouge ff → rouge pur.
      expect(line.color).toBe('#FF0000');
    });

    it('accepte les coordonnées étalées sur plusieurs lignes', () => {
      const zone = parseLayer(kml, 'kml').find((f) => f.kind === 'zone')!;
      const ring = (zone.geometry as { coordinates: number[][][] })
        .coordinates[0];
      expect(ring).toHaveLength(4);
      expect(ring[0]).toEqual([2.62, 48.4]);
    });

    it('éclate une MultiGeometry', () => {
      const features = parseLayer(
        `<kml><Document><Placemark><name>Deux postes</name>
           <MultiGeometry>
             <Point><coordinates>2.60,48.40</coordinates></Point>
             <Point><coordinates>2.61,48.41</coordinates></Point>
           </MultiGeometry>
         </Placemark></Document></kml>`,
        'kml',
      );
      expect(features).toHaveLength(2);
      expect(features.every((f) => f.label === 'Deux postes')).toBe(true);
    });
  });
});
