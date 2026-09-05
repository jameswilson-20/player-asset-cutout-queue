import { InfraiCutoutClient } from "./infrai_cutout.js";
import { ListingAssetRequest, preparePlayerListing } from "./listing_workflow.js";

const apiKey = process.env.INFRAI_API_KEY;
const image = process.env.PLAYER_ASSET;
if (!apiKey || !image) throw new Error("Set INFRAI_API_KEY and PLAYER_ASSET before running the example");

const asset = ListingAssetRequest.parse({
  listingId: "dragon-banner-042",
  playerId: "player-117",
  image,
  format: "png",
  liveEvent: { eventId: "autumn-arena", endsAt: "2026-09-30T12:00:00.000Z" },
});

const result = await preparePlayerListing(asset, new InfraiCutoutClient({ apiKey }));
console.log(JSON.stringify(result, null, 2));
