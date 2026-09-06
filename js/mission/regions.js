/**
 * regions.js — the Expedition's map, as data. Twenty-four regions at eight
 * landmarks each is roughly a school year at four sessions a week. Adding a
 * region is one line, the way a level is in a level list.
 *
 * Names are places, not subjects: a landmark takes the NAME of the skill the
 * crew mastered there ("Magic-E Cove"), so the region only needs a mood.
 */

export var REGIONS = [
  { name: 'Harbour Shallows',  hue: '#4FA3E3', kind: 'island' },
  { name: 'Coral Steps',       hue: '#3FBFAE', kind: 'island' },
  { name: 'The Reed Maze',     hue: '#6FAF57', kind: 'grove' },
  { name: 'Lantern Bay',       hue: '#E8A33D', kind: 'island' },
  { name: 'Marigold Marsh',    hue: '#E4694F', kind: 'grove' },
  { name: 'Foghorn Point',     hue: '#8B5FBF', kind: 'peak' },
  { name: 'Moonbeam Strait',   hue: '#4FA3E3', kind: 'island' },
  { name: 'The Ember Waste',   hue: '#E4694F', kind: 'peak' },
  { name: 'Whistling Dunes',   hue: '#E8A33D', kind: 'peak' },
  { name: 'Glasswater',        hue: '#3FBFAE', kind: 'island' },
  { name: 'The Long Orchard',  hue: '#6FAF57', kind: 'grove' },
  { name: 'Kestrel Ridge',     hue: '#8B5FBF', kind: 'peak' },
  { name: 'Salt Meadow',       hue: '#4FA3E3', kind: 'grove' },
  { name: 'The Sunken Stair',  hue: '#3FBFAE', kind: 'island' },
  { name: 'Tin Whistle Hills', hue: '#E8A33D', kind: 'peak' },
  { name: 'Bramble Reach',     hue: '#6FAF57', kind: 'grove' },
  { name: 'Star Anchorage',    hue: '#8B5FBF', kind: 'island' },
  { name: 'The Quiet Ice',     hue: '#4FA3E3', kind: 'peak' },
  { name: 'Copperfield',       hue: '#E4694F', kind: 'grove' },
  { name: 'Halfmoon Shelf',    hue: '#3FBFAE', kind: 'island' },
  { name: 'The Tall Grass',    hue: '#6FAF57', kind: 'grove' },
  { name: 'Thunder Gap',       hue: '#8B5FBF', kind: 'peak' },
  { name: 'Lighthouse End',    hue: '#E8A33D', kind: 'island' },
  { name: 'The Sunken City',   hue: '#D9557E', kind: 'island' }
];

export function regionInfo(index) {
  return REGIONS[Math.max(0, Math.min(REGIONS.length - 1, index))];
}

/** A readable label for a skill id, for a landmark's name plate. */
export function landmarkName(skill) {
  if (!skill) return 'Unnamed';
  var parts = String(skill).split('.');
  var leaf = parts[parts.length - 1].replace(/-/g, ' ');
  var topic = parts.length > 2 ? parts[1] : parts[0];
  var TOPIC = {
    add: 'Adding', sub: 'Taking away', mul: 'Times', div: 'Sharing', count: 'Counting', compare: 'More and less',
    alpha: 'Letter', phonics: 'Sounds', read: 'Reading', spell: 'Spelling', vocab: 'Words', alg: 'Patterns'
  };
  var t = TOPIC[topic] || topic;
  var suffix = ['Cove', 'Ridge', 'Landing', 'Hollow', 'Point', 'Steps'][Math.abs(hash(skill)) % 6];
  return t + ' ' + leaf.charAt(0).toUpperCase() + leaf.slice(1) + ' ' + suffix;
}

function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
