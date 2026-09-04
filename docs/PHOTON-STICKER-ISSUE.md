# Axolotl sticker reaction — the one detail blocking us

## What works
- `space.send(reaction(emoji, message))` / `message.react(emoji)` — emoji reactions work.
- Low-level `@photon-ai/advanced-imessage` (via a small patch to `@spectrum-ts/imessage` + `@spectrum-ts/core`):
  - `attachments.upload({ data, fileName })` → returns `{ attachment: { guid } }` ✅
  - `messages.placeSticker(chatGuid, messageGuid, stickerGuid, placement)` → returns a `Message` (the target guid) ✅ (no error)

## What does NOT work
The sticker **never renders** on the device, even though `placeSticker` returns success.

## The question for photon

In `StickerPlacement`, what is the coordinate system for `x` and `y`, and what are the correct units for `width` and `scale`?

```ts
interface StickerPlacement {
  rotation?: number; // clockwise rotation
  scale?: number;    // scale factor
  width?: number;    // rendered sticker width
  x: number;         // horizontal position, "Apple's normalized coordinate space"
  y: number;         // vertical position
}
```

Specifically:
1. Is `x/y` **normalized 0–1 relative to the message bubble**, or **points/pixels**, or **relative to the whole screen**? (The protobuf default is `{ x: 0, y: 0 }`.)
2. Does a sticker need a **non-zero `scale` or `width`** to be visible? What are sane defaults (e.g. `scale: 1.0`)? We tried `{x:0.5,y:0.5}`, `{x:0.5,y:0.5,width:0.3}`, and `{x:0.5,y:0.5,scale:1.0}` — none rendered.
3. Must the attachment be uploaded **as a sticker** (`isSticker`/a sticker-specific upload) before `placeSticker` works, or does `placeSticker` mark it? `AttachmentInput` currently only exposes `{ data, fileName, companion? }`.

## Repro (what we call)
```js
const uploaded = await remote.attachments.upload({ data: pngBytes, fileName: "axolotl.png" });
const guid = uploaded.attachment.guid;
await remote.messages.placeSticker(chatGuid, messageGuid, guid, { x: 0.5, y: 0.5, scale: 1.0 });
// returns success, but no sticker appears in the thread
```

Give us the correct `placement` values (or the right upload flag), and the axolotl lands.

---

## Findings (2026-09-03)

**Short version: this isn't a coordinate/units mistake on our end. It's a known, still-open server-side bug in the hosted Photon/Spectrum iMessage service, reported by someone else three days ago and not yet answered.**

### 1. `x`/`y` are not 0–1 normalized — the "we tried {x:0.5,y:0.5}" repro was using the wrong units
Despite the proto/`.d.ts` comment saying "Apple's normalized coordinate space," the SDK's own README example (`@photon-ai/advanced-imessage` v2.1.0, node_modules) uses point-like values, not fractions:
```ts
await im.messages.placeSticker(chatGuid, sent.guid, sticker.attachment.guid, {
  x: 120,
  y: 90,
});
```
No `width`/`scale` set at all in the documented example — so a missing scale/width is not what's blocking rendering. `x`/`y` are non-optional in the proto (`double x = 1; double y = 2;`), everything else (`scale`, `rotation`, `width`) is `optional`.

### 2. There is no "upload as sticker" flag
`UploadAttachmentRequest` (proto: `photon/imessage/v1/attachment_service.proto`) only has `file_name`, `data`, `companion` — nothing sticker-related. `is_sticker` only exists on the *read-side* `AttachmentInfo`, and it's server-set. So question 3 in this doc is moot: there's no flag to pass; the server marks it once you call `placeSticker`.

### 3. Someone else already hit this exact wall — [photon-hq/advanced-imessage-ts#55](https://github.com/photon-hq/advanced-imessage-ts/issues/55) (open, filed 2026-08-31, zero comments as of today)
They used the *exact* documented call (`{ x: 120, y: 90 }`, same as the README) and got the same "success but nothing renders" result. Their readback showed:
- `placeSticker()` returns `sendErrorCode: 0`, target snapshot has a new `placedStickers` entry
- Attachment metadata on readback is correct: PNG MIME, byte count, **`isSticker: true`** (confirms finding #2 — it's inferred, not something you set)
- Placement reads back as "normalized to the documented/default values"
- But: `MessagePlacedSticker.messageGuid` never shows up in `messages.listInChat()`, and `messages.get(placedSticker.messageGuid)` returns `messageNotFound` — immediately and on later reads
- Recipient Mac never renders the sticker, before or after restarting Messages, for both inbound and outbound targets

That pattern — DB row persisted, correct metadata, but the resulting message is never retrievable and never reaches the recipient — points at the hosted relay never actually forwarding the placed-sticker message to Apple. Checked the CHANGELOG/releases (`@photon-ai/advanced-imessage`, up through v2.1.0, Aug 13 2026): no sticker-related fixes since, and no maintainer response on #55 yet.

### 4. Recommended next step
Don't keep iterating on `placement` values — file our repro directly with Photon (or add it as a `+1` comment on #55 with our own timestamps/operation IDs) since two independent reports of the identical failure mode should get this triaged faster than either alone. Worth explicitly asking their question #1 too: whether outbound custom sticker placement needs an account/capability flag enabled on our project.

### 5. Unrelated but worth fixing while we're here
`src/integrations/axolotl.ts`'s doc comment says `StickerPlacement = { rotation?, scale?, offset? }` — that's stale/wrong. The real shape is `{ x: number, y: number, scale?: number, rotation?: number, width?: number }` (no `offset` field exists). That file also separately notes the app loop's `space`/`message` objects don't expose the underlying client needed to call `placeSticker` at all yet — a second, independent blocker from the server bug above.
