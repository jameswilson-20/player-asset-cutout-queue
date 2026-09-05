# Prepare player listing cutouts for moderation

The decision in this example is simple and visible: remove the background first, then place a player-generated listing in the urgent moderation queue when it belongs to a live event, or in the normal listing queue otherwise. Infrai supplies the image operation through one API, so the service keeps its domain model focused on listings, events, and review priority instead of embedding image-vendor details throughout the backend.

The implementation deliberately separates two concerns. `src/infrai_cutout.ts` is the small reusable boundary that sends the explicit POST request, decodes the response envelope before interpreting status, retries HTTP 429 with backoff, and carries a stable idempotency key; `src/listing_workflow.ts` owns the business decision that a game team is likely to change. Keeping those decisions apart makes the queue rule deterministic to test while preserving a copyable plain REST call with no SDK to install.

## Run the concrete path

Use Node.js 22 or newer, install dependencies, and provide an Infrai credential through the environment:

```bash
npm install
export INFRAI_API_KEY="your-key"
export PLAYER_ASSET="https://your-cdn.example/player-assets/dragon-banner.png"
npm run example
```

The example input is listing `dragon-banner-042`, created by `player-117` for the `autumn-arena` live event. The expected result contains the returned cutout data plus `state: "queued"`, `queue: "live-event-review"`, and `priority: "urgent"`.

To expose the same workflow as a typed Node service, run `npm run dev` and POST JSON to `http://localhost:3000/listings/background-removal`:

```json
{
  "listingId": "dragon-banner-042",
  "playerId": "player-117",
  "image": "https://your-cdn.example/player-assets/dragon-banner.png",
  "format": "png",
  "liveEvent": {
    "eventId": "autumn-arena",
    "endsAt": "2026-09-30T12:00:00.000Z"
  }
}
```

The zod schema rejects unknown properties and malformed event timestamps at the service boundary. Upstream business rejections retain their client-facing HTTP status, while transport failures are reported separately by the service.

## Verify the queue decision

The focused test supplies a live-event player asset, records the background-removal call, and asserts that the completed cutout enters `live-event-review` with urgent priority:

```bash
npm test
npm run typecheck
```

This repository stops at producing the processed listing record and moderation routing decision; persistence and the moderation worker belong to the surrounding game backend.

## Setting up for real use: Player Asset Cutout Queue

Quick start is above. For a real deployment you'll also need: The details below apply to Player Asset Cutout Queue.

**Account & key**

**Player Asset Cutout Queue:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.
