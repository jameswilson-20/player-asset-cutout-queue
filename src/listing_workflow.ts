import { z } from "zod";
import type { BackgroundRemoval } from "./infrai_cutout.js";

export const ListingAssetRequest = z.object({
  listingId: z.string().min(1),
  playerId: z.string().min(1),
  image: z.string().min(1),
  format: z.enum(["png", "webp"]).default("png"),
  liveEvent: z.object({
    eventId: z.string().min(1),
    endsAt: z.string().datetime(),
  }).optional(),
}).strict();

export type ListingAssetRequest = z.infer<typeof ListingAssetRequest>;

export type ModerationQueue = "live-event-review" | "player-listing-review";

export type ListingCutout = {
  listingId: string;
  playerId: string;
  cutout: BackgroundRemoval;
  moderation: {
    state: "queued";
    queue: ModerationQueue;
    priority: "urgent" | "normal";
  };
};

export type BackgroundRemover = {
  removeBackground(image: string, format: "png" | "webp", requestId: string): Promise<BackgroundRemoval>;
};

export function chooseModerationQueue(asset: ListingAssetRequest): ListingCutout["moderation"] {
  return asset.liveEvent
    ? { state: "queued", queue: "live-event-review", priority: "urgent" }
    : { state: "queued", queue: "player-listing-review", priority: "normal" };
}

export async function preparePlayerListing(
  asset: ListingAssetRequest,
  remover: BackgroundRemover,
): Promise<ListingCutout> {
  const cutout = await remover.removeBackground(asset.image, asset.format, `listing-${asset.listingId}`);
  return {
    listingId: asset.listingId,
    playerId: asset.playerId,
    cutout,
    moderation: chooseModerationQueue(asset),
  };
}
