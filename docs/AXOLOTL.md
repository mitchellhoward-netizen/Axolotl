# Making the axolotl react — the complete answer

Goal: the parent's custom axolotl image should be the thing that "reacts" to a message
(iMessage **sticker tapback**), with 🦎 as the emoji fallback.

## The verdict (traced through the SDK source)

1. `message.react(emoji)` is **emoji-only**. Its content is literally
   `{ type: "reaction", emoji: string, target }` (`@spectrum-ts/core` → `attachment-Dy4PsNVw.d.ts`).
   A custom image cannot be a `react()`.
2. There is **no outbound sticker content builder** in the spectrum high-level API. The
   iMessage provider defines `stickerPlacementSchema` / `placedStickerSchema` only for the
   **inbound** sticker message type — nothing sends one.
3. The low-level client **can** do it, and it's already bundled in. `@photon-ai/advanced-imessage`
   exposes:
   - `attachments.upload(input)` → an uploaded-attachment GUID (the "sticker" string)
   - `messages.placeSticker(chatGuid, messageGuid, stickerGuid, placement)`
   - `StickerPlacement = { x: number; y: number; rotation?: number; scale?: number; width?: number }`
4. The spectrum provider already holds that client — its own react path calls
   `remote.messages.setReaction(toChatGuid(spaceId), guid, …)` internally — **but it does not
   surface `remote`/`client` to app code.** So this is a **one-feature SDK gap**, not an unknown.

## What closes the gap (the exact SDK addition)

Add a `sticker(...)` outbound content builder + `space.placeSticker(...)` sugar to the iMessage
platform, reusing the client the provider already injects into its `send` handler
(`send: async ({ space, content, client }) => …`). Sketch:

```ts
// In the imessage platform def — alongside reaction()/background()/effect():
const sticker = (input: {
  bytes: Buffer; fileName?: string; mimeType?: string;
  target: Message; placement?: { x: number; y: number; rotation?: number; scale?: number };
}): ContentBuilder => ({
  build: async () => ({ type: "sticker", ...input } as unknown),
});

// In the send handler, when content.type === "sticker":
const remote = remoteForMessageTarget(client, space, content.target, "sticker", "stickers");
const stickerGuid = await remote.client.attachments.upload({
  fileName: content.fileName ?? "sticker.png",
  mimeType: content.mimeType ?? "image/png",
  data: content.bytes,
});
return remote.messages.placeSticker(
  toChatGuid(space.id), content.target.id, stickerGuid, content.placement ?? {},
);
```

That is the whole feature: ~15 lines, reusing `client` already in scope.

## App-side wiring (ready to drop in)

```ts
import { readFileSync } from 'node:fs';
import { AXOLOTL_EMOJI, axolotlImagePath, hasAxolotlImage } from './integrations/axolotl.js';

async function reactWithAxolotl(space, message) {
  if (hasAxolotlImage()) {
    try {
      const bytes = readFileSync(axolotlImagePath());
      // Requires the SDK `sticker()`/`placeSticker` surface above:
      await space.placeSticker?.({ bytes, fileName: 'axolotl.png', target: message });
      return;
    } catch { /* fall through */ }
  }
  await message.react(AXOLOTL_EMOJI); // 🦎 fallback
}
```

## Status

- ✅ **🦎 fallback live** — every incoming message reacts 🦎 (closest existing emoji).
- ✅ **Complete recipe + SDK patch** documented here.
- ⏳ To finish: (1) save the PNG to `chuy/assets/axolotl.png`, (2) apply the SDK `sticker()`
  addition (patch `@spectrum-ts/imessage`, or ask photon to ship it), then verify on a live call.
