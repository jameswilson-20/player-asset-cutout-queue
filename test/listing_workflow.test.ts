import assert from "node:assert/strict";
import test from "node:test";
import { ListingAssetRequest, preparePlayerListing } from "../src/listing_workflow.js";

test("a live-event asset enters the urgent moderation queue after its cutout is made", async () => {
  const asset = ListingAssetRequest.parse({
    listingId: "skin-88",
    playerId: "player-12",
    image: "https://assets.example.test/skin-88.png",
    format: "png",
    liveEvent: { eventId: "weekend-cup", endsAt: "2026-09-06T18:00:00.000Z" },
  });
  const calls: unknown[][] = [];
  const result = await preparePlayerListing(asset, {
    async removeBackground(...args) {
      calls.push(args);
      return { id: "cutout-88", url: "https://cdn.example.test/cutout-88.png" };
    },
  });

  assert.deepEqual(calls, [[asset.image, "png", "listing-skin-88"]]);
  assert.deepEqual(result.moderation, {
    state: "queued",
    queue: "live-event-review",
    priority: "urgent",
  });
});
