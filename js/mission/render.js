/**
 * mission/render.js — the Expedition map, as one inline SVG.
 *
 * A winding path across regions, a landmark every LANDMARK_DISTANCE, the
 * crew's ship at the current distance. Claimed landmarks are filled and
 * named for what the crew learned there; mastered ones are gold; the ones
 * with reviews due shimmer. Regions the tide has not opened yet are dimmed,
 * never hidden — you can see there is more.
 *
 * Nothing here decides anything. It draws what mission/model.js computed.
 */

import { REGIONS, regionInfo, landmarkName } from './regions.js';
import { REGION_LANDMARKS, LANDMARK_DISTANCE } from './model.js';
import { P } from '../ui/pictures.js';

var W = 900, ROW = 150, PER_ROW = 8;

/** Landmark i sits on a serpentine path: rows alternate direction. */
export function landmarkPoint(i) {
  var row = Math.floor(i / PER_ROW);
  var col = i % PER_ROW;
  if (row % 2 === 1) col = PER_ROW - 1 - col;
  var x = 70 + col * ((W - 140) / (PER_ROW - 1));
  var y = 80 + row * ROW + (col % 2 ? -18 : 18);
  return [x, y];
}

/** Where the ship is, between two landmarks. */
export function shipPoint(distance) {
  var i = Math.floor(distance / LANDMARK_DISTANCE);
  var t = (distance % LANDMARK_DISTANCE) / LANDMARK_DISTANCE;
  var a = landmarkPoint(i), b = landmarkPoint(i + 1);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * @param {object} v {distance, claimed:[{index, skill, gold}], shimmer:{index:true},
 *                    regionsOpen, racer, crewNames}
 */
export function mapSvg(v) {
  var regionsShown = Math.min(REGIONS.length, Math.max(v.regionsOpen + 1, Math.ceil((v.claimed.length + 2) / REGION_LANDMARKS)));
  var landmarks = regionsShown * REGION_LANDMARKS;
  var H = 80 + Math.ceil(landmarks / PER_ROW) * ROW + 40;
  var out = [];

  // The path.
  var d = '';
  for (var i = 0; i < landmarks; i++) {
    var p = landmarkPoint(i);
    d += (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ' ';
  }
  out.push('<path d="' + d + '" fill="none" stroke="rgba(255,255,255,.10)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>');
  out.push('<path d="' + d + '" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="2.5" stroke-dasharray="6 9" stroke-linecap="round" stroke-linejoin="round"/>');

  // Region bands and names.
  for (var r = 0; r < regionsShown; r++) {
    var info = regionInfo(r);
    var open = r < v.regionsOpen;
    var top = 80 + Math.floor((r * REGION_LANDMARKS) / PER_ROW) * ROW - 55;
    out.push('<rect x="12" y="' + top + '" width="' + (W - 24) + '" height="' + (ROW - 6) + '" rx="18" fill="' + info.hue + '" opacity="' + (open ? '.07' : '.03') + '"/>');
    out.push('<text x="30" y="' + (top + 26) + '" font-size="15" font-weight="600" fill="' + (open ? info.hue : 'rgba(255,255,255,.28)') + '">' + esc(info.name) + (open ? '' : ' · opens soon') + '</text>');
  }

  // Landmarks.
  var claimedBy = {};
  for (var c = 0; c < v.claimed.length; c++) claimedBy[v.claimed[c].index] = v.claimed[c];
  for (var k = 0; k < landmarks; k++) {
    var pt = landmarkPoint(k);
    var reg = regionInfo(Math.floor(k / REGION_LANDMARKS));
    var cl = claimedBy[k];
    var isOpen = Math.floor(k / REGION_LANDMARKS) < v.regionsOpen;
    var fill = cl ? (cl.gold ? '#F5C542' : reg.hue) : (isOpen ? '#2A3352' : '#1B2138');
    var stroke = cl ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.12)';
    if (v.shimmer[k]) {
      out.push('<circle cx="' + pt[0] + '" cy="' + pt[1] + '" r="22" fill="none" stroke="#F5C542" stroke-width="2">' +
        '<animate attributeName="r" values="18;26;18" dur="2.4s" repeatCount="indefinite"/>' +
        '<animate attributeName="opacity" values=".9;.15;.9" dur="2.4s" repeatCount="indefinite"/></circle>');
    }
    out.push('<circle cx="' + pt[0] + '" cy="' + pt[1] + '" r="14" fill="' + fill + '" stroke="' + stroke + '" stroke-width="2"/>');
    if (cl) {
      out.push('<text x="' + pt[0] + '" y="' + (pt[1] + 32) + '" text-anchor="middle" font-size="11" fill="rgba(255,255,255,.72)">' + esc(cl.skill ? landmarkName(cl.skill) : 'Landmark ' + (k + 1)) + '</text>');
    }
  }

  // The ship: the crew's racer, at the current distance.
  var sp = shipPoint(v.distance);
  out.push('<g transform="translate(' + (sp[0] - 22) + ' ' + (sp[1] - 26) + ')"><g transform="scale(.7)">' + v.racerBody + '</g></g>');
  if (v.crewNames) {
    out.push('<text x="' + sp[0] + '" y="' + (sp[1] - 30) + '" text-anchor="middle" font-size="12" font-weight="600" fill="#fff">' + esc(v.crewNames) + '</text>');
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;font-family:ui-sans-serif,system-ui,sans-serif">' + out.join('') + '</svg>';
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
