import type { APIRoute } from "astro";
import { dataDate, jpDate, laws } from "../lib/data.ts";
import { llmsTxt } from "../lib/llms-txt.ts";

export const GET: APIRoute = ({ site }) => {
  const body = llmsTxt({
    site: (site?.href ?? "https://anisotro.pics/").replace(/\/$/, ""),
    updated: jpDate(dataDate()),
    lawsInForce: laws().filter((l) => l.status === "in_force").length,
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
};
