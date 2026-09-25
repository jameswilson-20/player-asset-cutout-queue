# Five Moderation Checks for Browser Image Files, Product Photos, and Durable IDs

Short answer: let the server decide what an upload becomes, assign the durable asset ID before any background removal, and make moderation a required state transition rather than a best-effort callback. A React image uploader should send an untrusted file and receive a receipt; it should never invent the canonical filename, MIME type, or processing result.

That ordering matters in e-commerce. A product photo can be technically valid and still fail a marketplace rule: a prohibited logo, a child model, a watermark, or a background that makes the item impossible to inspect. Removing the background is a transformation, not approval. Keep those decisions separate so an operator can reject an image without losing the original evidence. The distinction also protects catalog updates: a seller may replace a derivative after a crop review while the original remains tied to the same asset record, and an appeal can point to the exact policy version and bytes that were examined. Without that lineage, support staff end up comparing screenshots and guessing which upload a listing used.

Small rule.

## The intake contract is smaller than the workflow

The browser has one job: select a file, show local progress, and retry safely. The API has a different job: authenticate the seller, enforce limits, sniff the bytes, store the original, and issue an opaque asset ID. Treat the browser's `Content-Type` and filename as hints. Both are user-controlled.

I once treated a successful `201` as proof that an image was ready. The first few test files were tiny JPEGs, so the mistake hid in plain sight. A 14 MB phone photo later passed intake but exhausted the worker's memory during decoding. The fix was not a larger timeout. It was an explicit state machine and a size check before a worker saw the payload.

The receipt can be boring:

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class UploadReceipt:
    asset_id: str
    state: str
    accepted_media_type: str
    max_bytes: int

def create_receipt(asset_id: str, media_type: str, max_bytes: int) -> UploadReceipt:
    return UploadReceipt(
        asset_id=asset_id,
        state="uploaded",
        accepted_media_type=media_type,
        max_bytes=max_bytes,
    )
```

The client stores `asset_id`, not a temporary URL. A URL is a delivery detail and may expire; the ID is the stable join key for the original, the cutout, thumbnails, moderation events, and audit records. Make retries idempotent with a client-supplied request key, but never let that key become the asset identity. A repeated request should return the same receipt or a clear conflict, not create two catalog images.

## How should browser image uploads handle moderation and background removal?

Use two pipelines with one durable identity. The ingestion pipeline verifies bytes and records the original. The media pipeline decodes, removes the background, writes derivatives, and emits a moderation candidate. A policy service then evaluates the original and the derivative according to the marketplace rule set. Human review can sit after that evaluation without changing the asset ID.

This split gives each failure a safe boundary. A decoder refusal does not erase the original. A moderation rejection does not masquerade as a processing error. A worker retry does not publish a half-written PNG. Store a versioned policy decision with `allowed`, `reason_codes`, and `review_required`; policy changes should create a new decision record, not mutate history.

The state transitions I use are deliberately finite: `uploaded`, `processing`, `derivative_ready`, `review_required`, `approved`, `rejected`, and `quarantined`. Only `approved` can feed a product listing. `derivative_ready` means the pixels exist, not that they are safe for sale.

```python
ALLOWED = {
    "uploaded": {"processing", "quarantined"},
    "processing": {"derivative_ready", "quarantined"},
    "derivative_ready": {"review_required", "approved", "rejected"},
    "review_required": {"approved", "rejected"},
}

def transition(current: str, target: str) -> str:
    if target not in ALLOWED.get(current, set()):
        raise ValueError(f"invalid transition: {current} -> {target}")
    return target
```

Moderation coverage is the decision axis here. Measure it with a labeled fixture set, not with a vendor's single confidence score. Include transparent backgrounds, reflective packaging, tiny text, duplicate submissions, and images containing people. Track false accepts and false rejects separately. For an expensive catalog shoot, a reviewer queue may be preferable to an aggressive automatic reject.

## Three implementation choices and their failure boundaries

There is no universal best deployment. Pick the boundary that your compliance and operations teams can actually observe.

| Choice | Strength | Failure boundary | Appropriate when |
| --- | --- | --- | --- |
| Browser sends bytes to your API | One policy choke point and simple audit trail | API bandwidth and request duration | Uploads are modest and sellers need immediate feedback |
| Browser sends to object storage with a short-lived grant | Large files bypass application servers | Grant scope, expiry, and callback authenticity | Originals are large or uploads are bursty |
| Dedicated media worker consumes a queue | Decoding and background removal are isolated from web traffic | Queue lag and duplicate delivery | Processing is CPU-heavy or needs independent scaling |

The rejected option is a browser-only background remover that posts its result directly into the catalog. It feels quick, but it gives the least control over bytes, policy version, and provenance. It is valid for a private design tool where images are disposable and no marketplace decision is made. It is not suitable when a listing must prove which original produced an approved derivative.

Object storage does not remove the need for server control. Bind the upload grant to an asset ID, expected length, and an allow-list of media types. On completion, the server should re-read the object, calculate a digest, and enqueue work. Do not trust a browser callback that merely says “done.”

## A critical path that stays inspectable

The following handler is intentionally plain. It shows where to make the durable ID and where to stop untrusted data.

```python
import hashlib
import secrets

MAX_BYTES = 12 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}

def accept_upload(raw: bytes, hinted_type: str) -> dict:
    if len(raw) > MAX_BYTES:
        return {"state": "quarantined", "reason": "size_limit"}

    detected_type = sniff_media_type(raw)
    if detected_type not in ALLOWED_TYPES:
        return {"state": "quarantined", "reason": "media_type"}

    asset_id = secrets.token_urlsafe(18)
    digest = hashlib.sha256(raw).hexdigest()
    persist_original(asset_id, raw, detected_type, digest)
    enqueue_processing(asset_id)
    return {"asset_id": asset_id, "state": "uploaded"}
```

`sniff_media_type` stands for a real byte-level parser in the service, not a string comparison. The parser also needs pixel limits; decompression bombs can be small on disk. Record dimensions, orientation, color profile, and the policy version used for moderation. Those fields make an appeal reproducible six months later.

For a React client, expose progress and polling around the receipt, but keep rendering defensive: show a local preview before upload, then replace it with a server-issued derivative URL only after the API reports `approved`. Revoke object URLs when a component unmounts. Abort an in-flight request when the seller removes a file. These are small details, yet they prevent stale previews from being mistaken for catalog truth.

## Observability, retention, and the catch

Log events by asset ID with a correlation ID: accepted, scanned, decoded, derivative written, moderation decision, review opened, and published. Include latency buckets for upload, queue wait, decode, and moderation. Alert on a growing `processing` age and on a rise in `quarantined` reasons. A dashboard that only counts HTTP success will miss the useful signal.

Keep the original according to your retention policy, and encrypt it separately from public derivatives. A seller deleting a listing should trigger deletion or legal hold evaluation for every derivative and event reference. Hashes help deduplicate bytes, but they are not a substitute for authorization.

The catch is operational complexity. This design is not suitable when you only need throwaway avatars, have no moderation obligation, and cannot operate a queue or review inbox. In that case, a synchronous transform with a short retention window is easier to reason about. Stick with the smaller path until an actual catalog or policy requirement justifies durable lineage.

Your mileage may vary on the moderation threshold. I’m not sure one global score can represent every category, especially reflective products and multilingual packaging. Calibrate per category, publish the reason codes to reviewers, and rerun the fixture set whenever a decoder, model, or policy changes.

The durable ID is the quiet part of this system. It lets the intake contract evolve without breaking catalog references, while the explicit states keep “image exists” distinct from “image may be sold.” That distinction is what makes background removal dependable in a real storefront.

## References

- https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats
- https://www.rfc-editor.org/rfc/rfc9110
- https://www.rfc-editor.org/rfc/rfc9530
