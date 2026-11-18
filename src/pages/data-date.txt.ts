// /data-date.txt: the data date (YYYY-MM-DD, Japan; see dataDate in src/lib/data.ts) and nothing else. The static
// amendment pages leave the date out of their HTML, so that a new data date does not change every one of them (and
// make the deploy upload them all again), and read it from here when they are printed (src/scripts/share.ts). The
// main Worker serves this path on the same host as the amendment Workers.
import type { APIRoute } from "astro";
import { dataDate } from "../lib/data.ts";

export const GET: APIRoute = () => new Response(`${dataDate()}\n`, { headers: { "Content-Type": "text/plain" } });
