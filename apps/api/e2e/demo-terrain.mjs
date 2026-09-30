// Monte une partie de démonstration PEUPLÉE, pour regarder la carte plutôt
// qu'une liste vide : deux camps, une escouade avec sa fréquence radio, des
// hommes détachés étiquetés, des structures, des points d'ordre, des
// contacts hostiles, un axe, une zone, deux drapeaux et les perks.
//
// Usage : node e2e/demo-terrain.mjs ["<nom>"]
//
// Tout est posé autour de 48.404 / 2.632 (Fontainebleau), là où l'émulateur
// croit se trouver : la carte s'ouvre donc directement sur l'action.
import { io } from 'socket.io-client';

const SUPABASE = 'https://rcgrwhayagadsaqnjufj.supabase.co';
const KEY = 'sb_publishable_1tA1CkejeoRzHqvXqnLgwA_nZ3eadsb';
const API = 'http://localhost:3000/v1';
const PASSWORD = process.env.E2E_PASSWORD;
if (!PASSWORD) {
  throw new Error(
    'E2E_PASSWORD manquant. Ces scripts ouvrent de vrais comptes sur le ' +
      'projet Supabase de test : le mot de passe ne vit pas dans le dépôt. ' +
      'Voir README, section « Tests E2E ».',
  );
}
const CENTRE = { lat: 48.404, lng: 2.632 };
const nom = process.argv[2] ?? 'Op Franchard';

const login = async (email) => {
  const body = JSON.stringify({ email, password: PASSWORD });
  const h = { apikey: KEY, 'Content-Type': 'application/json' };
  let r = await fetch(`${SUPABASE}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: h, body,
  });
  if (!r.ok) {
    r = await fetch(`${SUPABASE}/auth/v1/signup`, { method: 'POST', headers: h, body });
  }
  if (!r.ok) throw new Error(`login ${email}: ${r.status}`);
  return (await r.json()).access_token;
};

const call = async (method, path, tok, body) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
};

// Décalage à partir d'un cap (degrés) et d'une distance (mètres) : plus
// lisible que des coordonnées en dur, et le dessin reste cohérent si on
// déplace le centre.
const pos = (capDeg, metres) => {
  const rad = (capDeg * Math.PI) / 180;
  return {
    lat: CENTRE.lat + (metres * Math.cos(rad)) / 111320,
    lng:
      CENTRE.lng +
      (metres * Math.sin(rad)) /
        (111320 * Math.cos((CENTRE.lat * Math.PI) / 180)),
  };
};

const chef = await login('test.e2e@cartoairsoft.dev');
const partie = await call('POST', '/games', chef, { name: nom });
const bleu = await call('POST', `/games/${partie.id}/teams`, chef, {
  name: 'Bleu', color: '#2196F3',
});
await call('POST', `/games/${partie.id}/teams`, chef, {
  name: 'Rouge', color: '#F44336',
});

let membres = await call('GET', `/games/${partie.id}/members`, chef);
const moi = membres[0];
await call(
  'PATCH', `/games/${partie.id}/members/${moi.membershipId}/assignment`, chef,
  { teamId: bleu.id },
);
await call('PATCH', `/games/${partie.id}/members/${moi.membershipId}`, chef, {
  unitType: 'command',
  note: '446.00625',
});

// --- L'escouade ALPHA, serrée, avec la fréquence de son réseau ------------
// La chaîne réelle d'une unité d'infanterie : une section qui contient
// deux groupes de combat.
const section = await call('POST', `/games/${partie.id}/squads`, chef, {
  teamId: bleu.id, name: '1re SECTION', echelon: 'section',
});
await call('PATCH', `/games/${partie.id}/squads/${section.id}`, chef, {
  note: '446.03125',
});
const alpha = await call('POST', `/games/${partie.id}/squads`, chef, {
  teamId: bleu.id, name: 'ALPHA', echelon: 'groupe', parentSquadId: section.id,
});
await call('PATCH', `/games/${partie.id}/squads/${alpha.id}`, chef, {
  note: '446.09375',
});
const bravo = await call('POST', `/games/${partie.id}/squads`, chef, {
  teamId: bleu.id, name: 'BRAVO', echelon: 'groupe', parentSquadId: section.id,
});
await call('PATCH', `/games/${partie.id}/squads/${bravo.id}`, chef, {
  note: '446.15625',
});
// Et une équipe autonome, rattachée directement au commandant : la chaine
// n’oblige personne a passer par un échelon intermediaire.
const autonome = await call('POST', `/games/${partie.id}/squads`, chef, {
  teamId: bleu.id, name: 'RECO', echelon: 'equipe',
});

// Quatre hommes groupés (le marqueur d'escouade les remplace au dézoom) et
// deux détachés porteurs de leur propre étiquette.
// De quoi donner à l'organigramme tous les cas de figure : un capitaine
// qui commande deux escouades, un homme sous ses ordres SANS grade ni
// escouade, un chef d'escouade, et un joueur que rien ne rattache.
const equipe = [
  { compte: 'test.e2e2', insigne: 'command',   grade: 'capitaine',
    cap: 40,  d: 260 },
  { compte: 'test.e2e3', insigne: 'recon',     escouade: 'alpha', chefDe: 'alpha',
    grade: 'chef_escouade', cap: 55,  d: 290 },
  { compte: 'test.e2e4', insigne: 'medical',   escouade: 'alpha', cap: 30,  d: 300 },
  { compte: 'test.e2e5', insigne: 'sniper',    escouade: 'alpha', cap: 48,  d: 330 },
  { compte: 'test.e2e8', insigne: 'infantry',  escouade: 'alpha', cap: 62,  d: 275 },
  { compte: 'test.e2e9', insigne: 'engineer',  escouade: 'bravo', cap: 150, d: 320 },
  { compte: 'test.e2e10', insigne: 'anti_tank', escouade: 'bravo', cap: 165, d: 350 },
  { compte: 'test.e2e6', insigne: 'sf',        sousLesOrdres: true,
    cap: 300, d: 240, note: 'ECLAIREUR' },
  // Volontairement rattaché à rien : l'organigramme doit le faire voir.
  { compte: 'test.e2e7', insigne: 'transport', cap: 200, d: 210,
    note: 'V-12 · 446.5' },
];

const jetons = [];
for (const h of equipe) {
  const invite = await call('POST', `/games/${partie.id}/invites`, chef, {
    role: 'joueur',
  });
  const tok = await login(`${h.compte}@cartoairsoft.dev`);
  await call('POST', '/join', tok, { token: invite.token });
  membres = await call('GET', `/games/${partie.id}/members`, chef);
  const lui = membres.find(
    (m) => m.teamId === null && m.membershipId !== moi.membershipId,
  );
  await call(
    'PATCH', `/games/${partie.id}/members/${lui.membershipId}/assignment`, chef,
    { teamId: bleu.id },
  );
  const escouades = { alpha, bravo };
  if (h.escouade) {
    await call(
      'PATCH', `/games/${partie.id}/members/${lui.membershipId}/assignment`,
      chef, { squadId: escouades[h.escouade].id },
    );
  }
  if (h.grade) {
    await call('PATCH', `/games/${partie.id}/members/${lui.membershipId}`, chef, {
      role: h.grade,
    });
  }
  await call('PATCH', `/games/${partie.id}/members/${lui.membershipId}`, chef, {
    unitType: h.insigne,
    ...(h.note ? { note: h.note } : {}),
  });
  jetons.push({ tok, id: lui.membershipId, ...h });
}

// --- La chaîne de commandement -------------------------------------------
// Le capitaine reçoit les deux escouades, puis prend un homme sous ses
// ordres directs — sans lui donner de grade ni l'enfermer dans un groupe.
const capitaine = jetons.find((j) => j.grade === 'capitaine');
// La section relève du capitaine ; les groupes relèvent de la section.
// L’équipe de reconnaissance, elle, relève du commandant en direct.
await call('PATCH', `/games/${partie.id}/squads/${section.id}`, chef, {
  reportsToMembershipId: capitaine.id,
});
await call('PATCH', `/games/${partie.id}/squads/${autonome.id}`, chef, {
  reportsToMembershipId: moi.membershipId,
});
for (const j of jetons.filter((x) => x.sousLesOrdres)) {
  await call(
    'PATCH', `/games/${partie.id}/members/${j.id}/assignment`, chef,
    { reportsToMembershipId: capitaine.id },
  );
}
// Le chef d'escouade, une fois ses hommes dans le groupe.
for (const j of jetons.filter((x) => x.chefDe)) {
  await call('PATCH', `/games/${partie.id}/squads/${escouadeParNom(j.chefDe).id}`,
    chef, { leaderMembershipId: j.id });
}

function escouadeParNom(nom) {
  return { alpha, bravo }[nom];
}

// --- Ce qui est posé sur la carte ----------------------------------------
const marqueur = (icon, cap, d, props = {}) => ({
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
  kind: 'marker',
  ...pos(cap, d),
  properties: { icon, ...props },
});

const trace = (kind, geometry, properties) => ({
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
  kind,
  geometry,
  properties,
});

const objets = [
  // Structures : amies, hostiles, neutre.
  marqueur('fob_allied', 210, 380, { unitLabel: 'Base avancée', note: 'PC BLEU' }),
  marqueur('bunker_hostile', 95, 520, { unitLabel: 'Bunker hostile' }),
  marqueur('roadblock_hostile', 130, 430, { unitLabel: 'Barrage' }),
  marqueur('outpost_neutral', 340, 400, { unitLabel: 'Poste neutre' }),

  // Points d'ordre : la manœuvre, pas les unités.
  marqueur('rally', 250, 190, { unitLabel: 'Point de ralliement' }),
  marqueur('waypoint', 20, 350, { unitLabel: 'Passage' }),
  marqueur('checkpoint', 70, 450, { unitLabel: 'Contrôle' }),
  marqueur('casualty_collect', 230, 300, {
    unitLabel: 'Ramassage blessés', note: '446.75',
  }),

  // Contacts hostiles repérés — ils portent « ENY » par la norme.
  marqueur('infantry_hostile', 110, 600, { unitLabel: 'Infanterie hostile' }),
  marqueur('armor_hostile', 120, 680, {
    unitLabel: 'Blindé hostile', note: '2 VEH',
  }),
  marqueur('sniper_hostile', 85, 560, { unitLabel: 'Tireur embusqué' }),

  trace(
    'line',
    {
      type: 'LineString',
      coordinates: [
        [pos(250, 190).lng, pos(250, 190).lat],
        [pos(20, 350).lng, pos(20, 350).lat],
        [pos(70, 450).lng, pos(70, 450).lat],
      ],
    },
    { unitLabel: 'Axe de progression', color: '#2196F3' },
  ),
  trace(
    'zone',
    {
      type: 'Polygon',
      coordinates: [[
        [pos(100, 500).lng, pos(100, 500).lat],
        [pos(130, 640).lng, pos(130, 640).lat],
        [pos(80, 700).lng, pos(80, 700).lat],
        [pos(60, 520).lng, pos(60, 520).lat],
        [pos(100, 500).lng, pos(100, 500).lat],
      ]],
    },
    { unitLabel: 'Zone tenue', color: '#F44336' },
  ),
];
await call('POST', `/games/${partie.id}/map-objects/batch`, chef, {
  objects: objets,
});

// --- Objectifs et perks ---------------------------------------------------
const nord = pos(0, 450);
const sud = pos(180, 450);
await call('POST', `/games/${partie.id}/objectives`, chef, {
  name: 'Drapeau Nord', lat: nord.lat, lng: nord.lng, reward: { points: 100 },
});
await call('POST', `/games/${partie.id}/objectives`, chef, {
  name: 'Drapeau Sud', lat: sud.lat, lng: sud.lng, reward: { points: 100 },
});
await call('POST', `/games/${partie.id}/perks`, chef, {
  type: 'drone', radiusMeters: 400, durationSeconds: 120,
  cooldownSeconds: 0, stockPerTeam: 5,
});
await call('POST', `/games/${partie.id}/perks`, chef, {
  type: 'jammer', radiusMeters: 500, durationSeconds: 30, cooldownSeconds: 0,
});

// --- Les positions passent par la passerelle temps réel -------------------
let restants = jetons.length;
for (const j of jetons) {
  const socket = io('http://localhost:3000/game', {
    auth: { token: j.tok }, transports: ['websocket'],
  });
  socket.on('connect', () => {
    socket.emit('game:join', { gameId: partie.id }, () => {
      const p = pos(j.cap, j.d);
      socket.emit('position', { gameId: partie.id, lat: p.lat, lng: p.lng });
      setTimeout(() => {
        socket.close();
        if (--restants === 0) {
          console.log(
            `« ${nom} » prête — ${equipe.length} hommes, 2 escouades, ` +
              `${objets.length} objets, 2 drapeaux, drone + brouilleur`,
          );
          console.log(`id: ${partie.id}`);
          process.exit(0);
        }
      }, 1500);
    });
  });
}
