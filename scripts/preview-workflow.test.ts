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
  id?: string;
  if?: string;
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
  jobs: Record<string, { if?: string; env?: Record<string, string>; steps: Step[] }>;
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

/** Commands that deploy or upload to production, or that only the Publish workflow runs. */
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

test("the Preview workflow deploys nothing to production", () => {
  for (const step of steps) {
    const text = JSON.stringify(step);
    for (const re of forbidden) assert.doesNotMatch(text, re, `step ${step.name ?? step.uses ?? step.run}`);
    assert.ok(!step.uses?.startsWith("actions/cache/save") && step.uses !== "actions/cache@v6", "the cache stays the Publish workflow's");
  }
  assert.doesNotMatch(read(".github/workflows/preview.yml"), /R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY/);
});

test("the npm scripts the Preview workflow runs deploy nothing to production either", () => {
  const seen = new Set<string>();
  const queue = steps.flatMap((s) => [...(s.run ?? "").matchAll(/npm run ([\w:-]+)/g)].map((m) => m[1]));
  while (queue.length) {
    const name = queue.shift()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const body = scripts[name];
    assert.ok(body !== undefined, `npm script ${name} exists`);
    // deploy:preview is the one deployment; its body is checked to be `wrangler preview` below.
    if (name !== "deploy:preview") for (const re of forbidden) assert.doesNotMatch(body, re, `npm script ${name}`);
    for (const m of body.matchAll(/npm run ([\w:-]+)/g)) queue.push(m[1]);
  }
  assert.ok(seen.has("build") && seen.has("deploy:preview"), [...seen].join(", "));
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

test("an older cache entry is built against the houritsu commit it was extracted from", () => {
  const names = steps.map((s) => s.name);
  const checkout = steps.find((s) => s.run?.includes("source.mainCommit"));
  assert.ok(checkout, "a step checks out meta.json's source.mainCommit");
  assert.ok(names.indexOf(checkout.name) < names.indexOf("Build the site"));
  const extract = steps.find((s) => s.name === "Extract data");
  assert.ok(extract?.if);
  const restore = steps.find((s) => s.uses?.startsWith("actions/cache/restore"));
  assert.ok(restore?.id && checkout.id, "the cache restore and the checkout steps have ids");
  // Evaluate both guards for each way actions/cache/restore can end: cache-hit is "true" only for an exact key match,
  // cache-matched-key is set for an exact or a restore-keys (prefix) match.
  const outcomes = [
    { name: "prefix hit", outputs: { "cache-hit": "false", "cache-matched-key": "data-old" }, checkout: true },
    { name: "exact hit", outputs: { "cache-hit": "true", "cache-matched-key": "data-new" }, checkout: false },
    { name: "miss", outputs: { "cache-hit": "", "cache-matched-key": "" }, checkout: false },
  ];
  for (const o of outcomes) {
    assert.equal(guard(checkout.if, { [restore.id]: o.outputs }), o.checkout, `checkout on a ${o.name}`);
    for (const failed of o.checkout ? [false, true] : [false]) {
      const state: Record<string, Record<string, string>> = {
        [restore.id]: o.outputs,
        [checkout.id]: failed ? { extract: "true" } : {},
      };
      const expected = o.name === "miss" || failed;
      const label = `extract on a ${o.name}${failed ? " whose commit is gone" : ""}`;
      assert.equal(guard(extract.if, state), expected, label);
    }
  }
});

/**
 * Evaluates a step's `if` made of `steps.<id>.outputs.<name> == / != '<value>'` comparisons joined by && or ||
 * (&& binds tighter), the only form the Preview workflow's guards use. A missing output is "".
 */
function guard(expr: string | undefined, outputs: Record<string, Record<string, string>>): boolean {
  assert.ok(expr, "the step has an if");
  const term = /^steps\.([\w-]+)\.outputs\.([\w-]+) (==|!=) '([^']*)'$/;
  return expr.split("||").some((any) =>
    any.split("&&").every((all) => {
      const m = term.exec(all.trim());
      assert.ok(m, `unexpected condition: ${all.trim()}`);
      const value = outputs[m[1]]?.[m[2]] ?? "";
      return m[3] === "==" ? value === m[4] : value !== m[4];
    }),
  );
}

test("the Publish workflow still deploys production from main only", () => {
  const publish = parse(read(".github/workflows/publish.yml")) as Workflow;
  assert.deepEqual((publish.on.push as { branches: string[] }).branches, ["main"]);
  // workflow_dispatch can be started on any branch; the job itself runs on main only.
  for (const job of Object.values(publish.jobs)) assert.equal(job.if, "github.ref == 'refs/heads/main'");
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
