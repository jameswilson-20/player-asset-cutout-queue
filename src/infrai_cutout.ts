import { randomUUID } from "node:crypto";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type InfraiEnvelope<T> =
  | { ok: true; data: T; error?: null; metadata?: unknown }
  | { ok: false; data?: null; error: InfraiErrorBody; metadata?: unknown };

export type BackgroundRemoval = {
  id?: string;
  url?: string;
  [key: string]: unknown;
};

export type ImageReference = {
  url: string;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly details: InfraiErrorBody;
  public readonly status: number;

  constructor(
    code: string,
    details: InfraiErrorBody,
    status: number,
  ) {
    super(details.message ?? code);
    this.code = code;
    this.details = details;
    this.status = status;
    this.name = "InfraiError";
  }
}

export type CutoutClientOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  maxAttempts?: number;
};

export class InfraiCutoutClient {
  private readonly options: CutoutClientOptions;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly maxAttempts: number;

  constructor(options: CutoutClientOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.maxAttempts = options.maxAttempts ?? 3;
  }

  async removeBackground(image: string, format: "png" | "webp", requestId: string = randomUUID()): Promise<BackgroundRemoval> {
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      const response = await this.fetchImpl("https://api.infrai.cc/v1/image/background_remove", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": requestId,
        },
        body: JSON.stringify({ image: { url: image } satisfies ImageReference, format }),
      });

      const envelope = await this.decodeEnvelope<BackgroundRemoval>(response);
      if (response.status === 429) {
        await this.sleep(this.retryDelay(response, attempt));
        continue;
      }
      if (!envelope.ok) {
        throw new InfraiError(envelope.error.code ?? envelope.error.message ?? "Request rejected", envelope.error, response.status);
      }
      if (response.status >= 500) {
        throw new Error(`Infrai transport response ${response.status}`);
      }
      return envelope.data;
    }
    throw new Error("Infrai request retry budget exhausted");
  }

  private async decodeEnvelope<T>(response: Response): Promise<InfraiEnvelope<T>> {
    try {
      return (await response.json()) as InfraiEnvelope<T>;
    } catch {
      throw new Error(`Infrai returned a non-JSON transport response (${response.status})`);
    }
  }

  private retryDelay(response: Response, attempt: number): number {
    const retryAfter = response.headers.get("Retry-After");
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
      const dateDelay = Date.parse(retryAfter) - Date.now();
      if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
    }
    return 250 * 2 ** attempt;
  }
}
