import type { TrackPoint } from './api';

/**
 * Position d'une unité à un instant donné : le dernier point connu, avec
 * interpolation vers le suivant. Sans elle, les unités sauteraient d'un
 * relevé à l'autre au lieu de glisser.
 *
 * Avant son premier point et après le dernier, l'unité n'est pas sur la
 * carte — elle n'était pas encore là, ou plus.
 */
export function positionAt(
  track: TrackPoint[],
  t: number,
): { lat: number; lng: number } | null {
  if (track.length === 0) return null;
  if (t < track[0].t || t > track[track.length - 1].t) return null;

  let low = 0;
  let high = track.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (track[mid].t <= t) low = mid;
    else high = mid;
  }
  const a = track[low];
  const b = track[high];
  if (b.t === a.t) return { lat: a.lat, lng: a.lng };
  const ratio = (t - a.t) / (b.t - a.t);
  return {
    lat: a.lat + (b.lat - a.lat) * ratio,
    lng: a.lng + (b.lng - a.lng) * ratio,
  };
}

