/**
 * pairing.js — which devices belong to the same family.
 *
 * Trust is one thing: a shared campaign id. A device has one from its first
 * launch; "join a family" replaces it, behind the parent gate, with the code
 * shown on another device in the house. From then on the two devices swap
 * their logs whenever they meet, and nobody else's device ever sees them.
 *
 * Why not something cleverer: a family app needs a code a parent can read
 * off one screen and type into another, once. Anything with keys, QR-signing
 * or accounts is more than the threat model asks for and is how a feature
 * this important quietly never gets switched on.
 */

import { getDevice, wipeDeviceCampaign } from './log.js';

/** The code shown in Settings: "your family code". */
export function familyCode() {
  return getDevice().campaignId;
}

export function isFamily(peerCampaignId) {
  return !!peerCampaignId && peerCampaignId === familyCode();
}

/**
 * Adopt another device's family code. The parent gate is the caller's job;
 * this function assumes it has been passed. History on this device is kept —
 * the whole point is that it now belongs to the family too.
 */
export function joinFamily(code) {
  var clean = String(code || '').trim().toLowerCase();
  if (!/^c[a-z0-9]{5,10}$/.test(clean)) throw new Error('That does not look like a family code.');
  wipeDeviceCampaign(clean);
  return clean;
}
