import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CANDIDATES = [
  path.resolve(fileURLToPath(new URL('../../Ajolote rosado saludando.png', import.meta.url))),
  path.resolve(fileURLToPath(new URL('../../assets/axolotl.png', import.meta.url))),
  path.resolve(fileURLToPath(new URL('../../assets/axolotl.jpg', import.meta.url))),
];

/** Closest existing Unicode emoji to an axolotl (there is no axolotl emoji). */
export const AXOLOTL_EMOJI = '\u{1F98E}'; // 🦎 lizard (U+1F98E) — NOT 🦞 (U+1F99E)

export function hasAxolotlImage(): boolean {
  return CANDIDATES.some((p) => existsSync(p));
}

export function axolotlImagePath(): string {
  return CANDIDATES.find((p) => existsSync(p)) ?? CANDIDATES[0]!;
}

/*
 * THE REAL AXOLOTL AS A REACTION (iMessage "sticker tapback", iOS 17+).
 *
 * `message.react()` is emoji-only, so the image must go through the LOW-LEVEL
 * client, exactly two calls:
 *
 *   const remote: { client: AdvancedIMessage }   // the photon line's client
 *   const bytes = readFileSync(AXOLOTL_PNG);
 *   const uploaded = await remote.client.attachments.upload({
 *     fileName: 'axolotl.png',
 *     data: bytes,
 *   });
 *   await remote.client.messages.placeSticker(
 *     toChatGuid(space.id),          // conversation guid
 *     message.id,                    // target message guid
 *     uploaded.attachment.guid,      // the uploaded sticker's attachment guid
 *     { x: 120, y: 90 },             // StickerPlacement: { x, y, scale?, rotation?, width? }
 *   );
 *
 * Verified against the SDK source:
 *   - `AdvancedIMessage.attachments.upload(input)` -> `{ attachment: { guid, ... } }`
 *   - `AdvancedIMessage.messages.placeSticker(chat, message, sticker, placement)`
 *   - `StickerPlacement = { x: number, y: number, scale?, rotation?, width? }`
 *     (x/y are required; NOT 0-1 normalized despite the proto comment saying
 *     "normalized coordinate space" — the SDK's own README example uses
 *     point-like values, e.g. { x: 120, y: 90 }. No `offset` field exists.)
 *   - `RemoteClient = { client: AdvancedIMessage; phone: string }` (imessage provider)
 *
 * TWO SEPARATE BLOCKERS, not one:
 *   1. The high-level `space`/`message` objects in the app loop do NOT expose
 *      `remote`/`client`. The provider's own react path calls
 *      `remote.messages.setReaction(toChatGuid(spaceId), guid, ...)` internally,
 *      but app code can't reach that client handle. Need either (a) the
 *      spectrum SDK to expose the underlying client, or (b) a live photon
 *      session to locate the client handle.
 *   2. Even with the client handle, `placeSticker` currently appears to be
 *      broken server-side for the hosted Photon/Spectrum iMessage relay: it
 *      returns success and persists a `placedStickers` row with correct
 *      metadata, but the resulting message is never retrievable via
 *      `messages.get()`/`listInChat()` and never renders on the recipient
 *      device. See docs/PHOTON-STICKER-ISSUE.md and
 *      https://github.com/photon-hq/advanced-imessage-ts/issues/55 (open,
 *      unanswered as of 2026-09-03 — someone else hit the identical failure
 *      with the exact documented placement values).
 * Until both are resolved we fall back to 🦎.
 */
