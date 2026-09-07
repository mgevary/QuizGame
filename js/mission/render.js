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

var W = 900, ROW = 132, PER_ROW = 8, TOP = 74;

/** Landmark i sits on a serpentine path: rows alternate direction. */
export function landmarkPoint(i) {
  var row = Math.floor(i / PER_ROW);
  var col = i % PER_ROW;
  if (row % 2 === 1) col = PER_ROW - 1 - col;
  var x = 78 + col * ((W - 156) / (PER_ROW - 1));
  var y = TOP + row * ROW + ((i % PER_ROW) % 2 ? -14 : 14);
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
 * A smooth route through the landmarks. Straight segments made the turn at
 * the end of each row read as a fault in the drawing rather than a bend in
 * the road; curving through the midpoints fixes it with no extra data.
 */
function routePath(count) {
  if (count < 2) return '';
  var pts = [];
  for (var i = 0; i < count; i++) pts.push(landmarkPoint(i));
  var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
  for (var j = 1; j < pts.length; j++) {
    var prev = pts[j - 1], cur = pts[j];
    var mx = (prev[0] + cur[0]) / 2, my = (prev[1] + cur[1]) / 2;
    d += ' Q' + prev[0].toFixed(1) + ' ' + prev[1].toFixed(1) + ' ' + mx.toFixed(1) + ' ' + my.toFixed(1);
  }
  var last = pts[pts.length - 1];
  d += ' L' + last[0].toFixed(1) + ' ' + last[1].toFixed(1);
  return d;
}

/**
 * @param {object} v {distance, claimed:[{index, skill, gold}], shimmer:{index:true},
 *                    regionsOpen, racerBody, crewNames}
 */
export function mapSvg(v) {
  // Always show the region after the last open one, dimmed, so there is
  // visibly more map ahead than the crew has reached.
  var regionsShown = Math.min(REGIONS.length, Math.max(2, v.regionsOpen + 1,
    Math.ceil((v.claimed.length + 2) / REGION_LANDMARKS) + 1));
  var landmarks = regionsShown * REGION_LANDMARKS;
  var rows = Math.ceil(landmarks / PER_ROW);
  var H = TOP + (rows - 1) * ROW + 86;
  var out = [];

  // Region bands sit behind their own row, with the name on a pill so it can
  // never be swallowed by the route passing through it.
  for (var r = 0; r < regionsShown; r++) {
    var info = regionInfo(r);
    var open = r < v.regionsOpen;
    var rowTop = TOP + Math.floor((r * REGION_LANDMARKS) / PER_ROW) * ROW - 52;
    out.push('<rect x="14" y="' + rowTop + '" width="' + (W - 28) + '" height="' + (ROW - 14) +
      '" rx="20" fill="' + info.hue + '" opacity="' + (open ? '.075' : '.03') + '"/>');
    var label = info.name + (open ? '' : '  ·  opens soon');
    var pillW = 16 + label.length * 7.6;
    out.push('<rect x="30" y="' + (rowTop + 10) + '" width="' + pillW.toFixed(0) + '" height="26" rx="13" fill="#0A0D16" opacity="' + (open ? '.72' : '.55') + '"/>');
    out.push('<text x="' + (30 + pillW / 2).toFixed(0) + '" y="' + (rowTop + 27) +
      '" text-anchor="middle" font-size="13" font-weight="600" fill="' +
      (open ? info.hue : 'rgba(255,255,255,.34)') + '">' + esc(label) + '</text>');
  }

  var d = routePath(landmarks);
  out.push('<path d="' + d + '" fill="none" stroke="rgba(255,255,255,.09)" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>');
  out.push('<path d="' + d + '" fill="none" stroke="rgba(255,255,255,.26)" stroke-width="2.5" stroke-dasharray="7 10" stroke-linecap="round"/>');

  // The stretch already travelled, drawn solid over the dashes.
  if (v.distance > 0) {
    var doneD = routePath(Math.max(2, Math.min(landmarks, Math.floor(v.distance / LANDMARK_DISTANCE) + 1)));
    out.push('<path d="' + doneD + '" fill="none" stroke="#6E8BFF" stroke-width="4" stroke-linecap="round" opacity=".85"/>');
  }

  var claimedBy = {};
  for (var c = 0; c < v.claimed.length; c++) claimedBy[v.claimed[c].index] = v.claimed[c];
  for (var k = 0; k < landmarks; k++) {
    var pt = landmarkPoint(k);
    var reg = regionInfo(Math.floor(k / REGION_LANDMARKS));
    var cl = claimedBy[k];
    var isOpen = Math.floor(k / REGION_LANDMARKS) < v.regionsOpen;
    var fill = cl ? (cl.gold ? '#F5C542' : reg.hue) : (isOpen ? '#232C46' : '#171E33');
    var stroke = cl ? 'rgba(255,255,255,.6)' : 'rgba(255,255,255,.13)';
    if (v.shimmer[k]) {
      out.push('<circle cx="' + pt[0] + '" cy="' + pt[1] + '" r="22" fill="none" stroke="#F5C542" stroke-width="2.5">' +
        '<animate attributeName="r" values="17;27;17" dur="2.4s" repeatCount="indefinite"/>' +
        '<animate attributeName="opacity" values=".95;.12;.95" dur="2.4s" repeatCount="indefinite"/></circle>');
    }
    out.push('<circle cx="' + pt[0] + '" cy="' + pt[1] + '" r="13" fill="' + fill + '" stroke="' + stroke + '" stroke-width="2"/>');
    if (cl) {
      var name = cl.skill ? landmarkName(cl.skill) : 'Landmark ' + (k + 1);
      out.push('<text x="' + pt[0] + '" y="' + (pt[1] + 31) + '" text-anchor="middle" font-size="11.5" fill="rgba(255,255,255,.75)">' + esc(name) + '</text>');
    }
  }

  // The ship: the crew's own racer, with a soft halo so it never disappears
  // into a region band.
  var sp = shipPoint(v.distance);
  out.push('<circle cx="' + sp[0].toFixed(1) + '" cy="' + sp[1].toFixed(1) + '" r="26" fill="#6E8BFF" opacity=".16"/>');
  out.push('<g transform="translate(' + (sp[0] - 24).toFixed(1) + ' ' + (sp[1] - 24).toFixed(1) + ')"><g transform="scale(.75)">' + v.racerBody + '</g></g>');
  if (v.crewNames) {
    // Below the ship, not above: at the very start of the map the ship sits
    // under the region's name pill, and two labels on top of each other is
    // the first thing anyone notices.
    out.push('<text x="' + sp[0].toFixed(1) + '" y="' + (sp[1] + 40).toFixed(1) +
      '" text-anchor="middle" font-size="13" font-weight="600" fill="#fff">' + esc(v.crewNames) + '</text>');
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H.toFixed(0) +
    '" width="100%" style="display:block;font-family:ui-sans-serif,system-ui,sans-serif">' + out.join('') + '</svg>';
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
