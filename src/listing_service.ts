import { createServer, type ServerResponse } from "node:http";
import { InfraiCutoutClient, InfraiError } from "./infrai_cutout.js";
import { ListingAssetRequest, preparePlayerListing } from "./listing_workflow.js";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const client = new InfraiCutoutClient({ apiKey });
const port = Number(process.env.PORT ?? 3000);

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/listings/background-removal") {
    send(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const parsed = ListingAssetRequest.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success) {
      send(response, 400, { error: "Invalid listing asset", issues: parsed.error.issues });
      return;
    }
    send(response, 202, await preparePlayerListing(parsed.data, client));
  } catch (error) {
    if (error instanceof InfraiError && error.status >= 400 && error.status < 500) {
      send(response, error.status, { error: error.code, details: error.details });
      return;
    }
    if (error instanceof SyntaxError) {
      send(response, 400, { error: "Request body must be JSON" });
      return;
    }
    send(response, 502, { error: "Image processing did not complete" });
  }
}).listen(port, () => console.log(`Listing cutout service listening on http://localhost:${port}`));
