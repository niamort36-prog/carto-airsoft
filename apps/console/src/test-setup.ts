import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

/**
 * MapLibre ne tourne pas dans jsdom : il réclame WebGL, que jsdom n'a pas.
 * On le remplace par une coquille — ces tests portent sur les BOUTONS et
 * sur ce qu'ils déclenchent, pas sur le rendu de la carte, qui se vérifie
 * à l'œil dans un vrai navigateur.
 */
vi.mock('maplibre-gl', () => {
  class FausseCarte {
    addControl() {}
    on(_e: string, cb?: () => void) {
      // `load` doit se déclencher, sinon le composant reste en attente.
      if (_e === 'load' && cb) setTimeout(cb, 0);
    }
    once() {}
    addSource() {}
    addLayer() {}
    getSource() {
      return { setData() {} };
    }
    isStyleLoaded() {
      return true;
    }
    setStyle() {}
    getCenter() {
      return { lat: 48.4, lng: 2.6 };
    }
    getZoom() {
      return 13;
    }
    remove() {}
  }
  class FauxMarqueur {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  }
  return {
    default: {
      Map: FausseCarte,
      NavigationControl: class {},
      Marker: FauxMarqueur,
    },
  };
});

vi.mock('qrcode', () => ({
  default: { toCanvas: vi.fn().mockResolvedValue(undefined) },
}));
