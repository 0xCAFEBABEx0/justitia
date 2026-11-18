// Checks that the Preview workflow (.github/workflows/preview.yml) can only deploy a Worker Preview: it runs on
// pushes to the preview branch alone, deploys nothing to production, holds no R2 credentials, and cancels an older
// run when a newer push comes. Also checks the Worker settings a Preview depends on (wrangler.jsonc). See
// infra/README.md, "Previews".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
}
interface Workflow {
  on: Record<string, unknown>;
  concurrency: { group: string; "cancel-in-progress": boolean };
  permissions: Record<string, string>;
  env?: Record<string, string>;
  jobs: Record<string, { env?: Record<string, string>; steps: Step[] }>;
}

const workflow = parse(read(".github/workflows/preview.yml")) as Workflow;
const steps = Object.values(workflow.jobs).flatMap((j) => j.steps);
const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;

/** wrangler.jsonc without its comments. */
function readJsonc(path: string): Record<string, unknown> {
  const text = read(path);
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === "\\") out += text[++i];
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else out += c;
  }
  return JSON.parse(out) as Record<string, unknown>;
}

test("the Preview workflow runs only on pushes to the preview branch", () => {
  assert.deepEqual(Object.keys(workflow.on), ["push"]);
  assert.deepEqual(workflow.on.push, { branches: ["preview"] });
});

test("a newer push cancels the running Preview deployment", () => {
  assert.equal(workflow.concurrency.group, "preview");
  assert.equal(workflow.concurrency["cancel-in-progress"], true);
  assert.deepEqual(workflow.permissions, { contents: "read" });
});

test("the Preview workflow deploys nothing to production", () => {
  const forbidden = [
    /wrangler(@\S+)?\s+deploy\b/,
    /wrangler(@\S+)?\s+versions\s+(deploy|upload)\b/,
    /npm run deploy(?!:preview)/,
    /deploy:amendments/,
    /upload-data/,
    /split-amendments/,
    /search-index/,
    /\brclone\b/,
    /\bd1\s+(migrations|execute)\b/,
    /\bseed\b/i,
  ];
  for (const step of steps) {
    const text = JSON.stringify(step);
    for (const re of forbidden) assert.doesNotMatch(text, re, `step ${step.name ?? step.uses ?? step.run}`);
    assert.ok(!step.uses?.startsWith("actions/cache/save") && step.uses !== "actions/cache@v6", "the cache stays the Publish workflow's");
  }
  assert.doesNotMatch(read(".github/workflows/preview.yml"), /R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY/);
});

test("the Preview workflow builds a Preview build and deploys it once with wrangler preview", () => {
  const job = Object.values(workflow.jobs)[0];
  assert.equal(job.env?.JUSTITIA_PREVIEW, "1");
  const deploys = steps.filter((s) => s.run?.includes("deploy:preview"));
  assert.equal(deploys.length, 1);
  assert.equal(deploys[0].run, 'npm run deploy:preview -- --message "$GITHUB_SHA"');
  assert.match(scripts["deploy:preview"], /^npx --yes wrangler@\d+\.\d+\.\d+ preview --name preview$/);
  // Worker Previews need Wrangler 4.135.0 or later; keep it on the version the production deploy uses.
  const version = /wrangler@(\d+)\.(\d+)\.(\d+)/.exec(scripts["deploy:preview"])!.slice(1).map(Number);
  assert.ok(version[0] > 4 || (version[0] === 4 && version[1] >= 135), `wrangler ${version.join(".")}`);
  assert.equal(/wrangler@\S+/.exec(scripts["deploy:preview"])![0], /wrangler@\S+/.exec(scripts.deploy)![0]);
});

test("the Publish workflow still deploys production from main only", () => {
  const publish = parse(read(".github/workflows/publish.yml")) as Workflow;
  assert.deepEqual((publish.on.push as { branches: string[] }).branches, ["main"]);
  assert.ok(!JSON.stringify(publish).includes("JUSTITIA_PREVIEW"), "production builds are not Preview builds");
  assert.ok(!JSON.stringify(publish).includes("deploy:preview"));
});

test("the Worker has no workers.dev address, no Version URLs, no routes and no Preview bindings", () => {
  const config = readJsonc("wrangler.jsonc");
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.routes, undefined);
  assert.equal(config.route, undefined);
  const previews = config.previews as Record<string, unknown> | undefined;
  assert.ok(previews, "wrangler.jsonc needs a previews block, or Wrangler takes the dashboard's Preview settings");
  assert.deepEqual(Object.keys(previews), ["observability"]);
});
