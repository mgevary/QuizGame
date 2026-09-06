/**
 * map.js — the Expedition screen.
 *
 * This is the answer to "why open it again tomorrow". The map remembers:
 * every landmark the crew claimed stays claimed, forever. Nothing decays. A
 * new region opens on the calendar whether or not anyone played, so coming
 * back after a fortnight away means MORE map, not a pile of guilt. And the
 * places that shimmer are reviews due — an invitation, capped at three.
 */

import { el, clear, button } from '../ui/dom.js';
import { racerSvg } from '../ui/art.js';
import { topbar, section } from './home.js';
import * as Users from '../users/users.js';
import { state as logState } from '../sync/log.js';
import * as M from '../mission/model.js';
import { mapSvg } from '../mission/render.js';
import { regionInfo } from '../mission/regions.js';

/** The family's story mission, with the crew being everyone on this device. */
export function currentMission() {
  var st = logState();
  var ids = Object.keys(st.missions);
  var m = null;
  for (var i = 0; i < ids.length; i++) if (st.missions[ids[i]].kind !== 'goal' && !st.missions[ids[i]].archived) m = st.missions[ids[i]];
  if (!m) return null;
  var copy = {};
  for (var k in m) copy[k] = m[k];
  if (!copy.crew || !copy.crew.length) copy.crew = Users.listUsers().map(function (u) { return u.id; });
  if (!copy.skills) copy.skills = [];
  copy.weeklyTide = copy.weeklyTide !== false;
  return copy;
}

export function mapScreen(nav) {
  var root = el('div', 'screen screen-map');
  root.appendChild(topbar('The Expedition', function () { nav.go('home'); }));

  var mission = currentMission();
  var st = logState();
  if (!mission) {
    root.appendChild(el('p', 'field-note', 'Play a game and the map begins.'));
    return root;
  }
  var now = Date.now();
  var distance = M.distanceFor(mission, st.users);
  var claimed = M.claimedLandmarks(mission, st.users, { nowMs: now });
  var shimmerList = M.shimmering(mission, st.users, { nowMs: now });
  var regionsOpen = M.regionsOpen(mission, now);
  var region = regionInfo(M.regionOf(M.landmarksReached(distance)));
  var me = Users.getActiveUser();

  // Shimmer is per item; the map shows it on the most recent claimed
  // landmarks, which is where those skills were earned.
  var shimmer = {};
  for (var i = 0; i < shimmerList.length; i++) {
    var idx = Math.max(0, claimed.length - 1 - i);
    shimmer[idx] = true;
  }

  var head = el('div', 'map-head');
  head.appendChild(el('h2', 'map-region', region.name));
  var toNext = M.toNextLandmark(distance);
  head.appendChild(el('p', 'field-note',
    claimed.length + (claimed.length === 1 ? ' place claimed' : ' places claimed') +
    ' · next one in about ' + Math.max(1, Math.round(toNext / 1.2)) + ' answers'));
  root.appendChild(head);

  var wrap = el('div', 'map-wrap');
  wrap.innerHTML = mapSvg({
    distance: distance, claimed: claimed, shimmer: shimmer, regionsOpen: regionsOpen,
    racerBody: racerSvg(me ? me.avatar : 'rocket').replace(/^<svg[^>]*>|<\/svg>$/g, ''),
    crewNames: Users.listUsers().map(function (u) { return u.name; }).join(' & ')
  });
  root.appendChild(wrap);

  if (shimmerList.length) {
    var s = section('Shimmering');
    s.appendChild(el('p', 'field-note',
      shimmerList.length + (shimmerList.length === 1 ? ' place wants' : ' places want') +
      ' a visit — something learned there is due a check. A short game will do it.'));
    s.appendChild(button('Check-up game', 'btn btn-go', function () { nav.go('play'); }));
    root.appendChild(s);
  }

  var tide = section('The tide');
  tide.appendChild(el('p', 'field-note',
    regionsOpen + (regionsOpen === 1 ? ' region is' : ' regions are') + ' open. A new one opens every week whether you play or not, so there is always more map.'));
  root.appendChild(tide);

  return root;
}
