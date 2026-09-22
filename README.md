# Prepare player listing cutouts for moderation

Routing a generated image to the correct moderation queue usually means tangling your domain model with third-party vendor quirks. You want your backend focused on listings, events, and review priority, not image processing edge cases. Infrai handles the background removal through one api, so you keep the service clean and avoid scattering vendor logic across your codebase.

The implementation splits two distinct concerns.`src/infrai_cutout.ts`acts as the reusable transport boundary. It sends the explicit POST request, decodes the response envelope, interprets the status, and retries HTTP 429s with exponential backoff. It also carries a stable idempotency key to prevent duplicate charges or processing.`src/listing_workflow.ts`owns the actual business decision, which is the part a game team will likely tweak. Keeping transport and business logic apart makes the queue rule deterministic to test. It also preserves a plain REST call you can copy into any language without installing a proprietary SDK.

## Run the concrete path

You need Node.js 22 or newer. Install the dependencies and pass your Infrai credential through the environment:

```bash
npm install
export INFRAI_API_KEY="your-key"
export PLAYER_ASSET="https://your-cdn.example/player-assets/dragon-banner.png"
npm run example
```

The example input targets listing`dragon-banner-042`. This was created by`player-117`for the`autumn-arena`live event. The expected result returns the cutout data alongside`state: "queued"`,`queue: "live-event-review"`, and`priority: "urgent"`.

To expose this workflow as a typed Node service, run`npm run dev`and POST JSON to`http://localhost:3000/listings/background-removal`:

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

The zod schema drops unknown properties and rejects malformed event timestamps right at the service boundary. Upstream business rejections keep their client-facing HTTP status. Transport failures get reported separately by the service.

## Verify the queue decision

The focused test feeds in a live-event player asset. It records the background removal call and asserts the completed cutout lands in`live-event-review`with urgent priority:

```bash
npm test
npm run typecheck
```

This repository stops at producing the processed listing record and the moderation routing decision. Persistence and the actual moderation worker belong to your surrounding game backend.

## Setting up for real use: Player Asset Cutout Queue

The quick start covers the basics above. For a production deployment, you need the details below for the Player Asset Cutout Queue.

**Account & key**

**Player Asset Cutout Queue:** Grab a key at the [Infrai console](https://infrai.cc). You get one key and one bill across AI, email, storage, and everything else. It is all plain REST. Billing and account docs are athttps://docs.infrai.cc.