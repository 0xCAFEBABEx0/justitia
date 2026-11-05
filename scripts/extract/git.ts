import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

/** Runs git and returns stdout. Throws with stderr on a non-zero exit. */
export function git(repo: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", repo, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d: Buffer) => out.push(d));
    child.stderr.on("data", (d: Buffer) => err.push(d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out).toString("utf8"));
      else reject(new Error(`git ${args.join(" ")} exited ${code}: ${Buffer.concat(err).toString("utf8")}`));
    });
  });
}

export async function tryRevParse(repo: string, ref: string): Promise<string | null> {
  try {
    return (await git(repo, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`])).trim() || null;
  } catch {
    return null;
  }
}

interface Pending {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
}

/**
 * Reads blobs through one long-lived `git cat-file --batch`. Requests are answered in order,
 * so several can be in flight at once.
 */
export class BlobReader {
  private child: ChildProcessWithoutNullStreams;
  private queue: Pending[] = [];
  // Unconsumed output, kept as chunks: concatenating on every chunk is quadratic for
  // multi-megabyte blobs.
  private chunks: Buffer[] = [];
  private buffered = 0;
  private need = 0; // bytes required before the next parse attempt is worthwhile

  constructor(repo: string) {
    this.child = spawn("git", ["-C", repo, "cat-file", "--batch"]);
    this.child.stdout.on("data", (d: Buffer) => {
      this.chunks.push(d);
      this.buffered += d.length;
      if (this.buffered >= this.need) this.drain();
    });
    this.child.on("error", (e) => this.failAll(e));
    this.child.on("close", (code) => {
      if (this.queue.length) this.failAll(new Error(`git cat-file exited ${code}`));
    });
  }

  read(sha: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.child.stdin.write(sha + "\n");
    });
  }

  close(): void {
    this.child.stdin.end();
  }

  private drain(): void {
    let buf = this.chunks.length === 1 ? this.chunks[0] : Buffer.concat(this.chunks, this.buffered);
    while (this.queue.length) {
      const nl = buf.indexOf(10);
      if (nl < 0) break;
      const header = buf.subarray(0, nl).toString("utf8");
      const parts = header.split(" ");
      if (parts[1] === "missing" || parts.length < 3) {
        buf = buf.subarray(nl + 1);
        this.queue.shift()!.reject(new Error(`blob not found: ${header}`));
        continue;
      }
      const end = nl + 1 + Number(parts[2]);
      if (buf.length < end + 1) {
        this.need = end + 1; // wait for the body and its trailing newline
        break;
      }
      const text = buf.subarray(nl + 1, end).toString("utf8");
      buf = buf.subarray(end + 1);
      this.need = 0;
      this.queue.shift()!.resolve(text);
    }
    this.chunks = buf.length ? [buf] : [];
    this.buffered = buf.length;
    if (this.need > 0 && this.need <= this.buffered) this.need = 0;
  }

  private failAll(err: Error): void {
    for (const p of this.queue.splice(0)) p.reject(err);
  }
}

export interface RawChange {
  status: "A" | "M" | "D";
  oldBlob: string | null;
  newBlob: string | null;
  path: string;
}

export interface RawCommit {
  sha: string;
  author: string;
  date: string; // ISO
  subject: string;
  body: string; // full message
  changes: RawChange[];
}

const RS = "\x1e";
const US = "\x1f";
const NULL_SHA = /^0+$/;

/** Lists commits reachable from `ref` (oldest first) with their changed files and blob ids. */
export async function listCommits(repo: string, ref: string, exclude?: string): Promise<RawCommit[]> {
  const range = exclude ? [`${exclude}..${ref}`] : [ref];
  const out = await git(repo, [
    "log",
    "--reverse",
    "--no-renames",
    "--raw",
    "--no-abbrev",
    `--format=${RS}%H${US}%an${US}%aI${US}%s${US}%B${US}`,
    ...range,
    "--",
    "laws",
  ]);
  const commits: RawCommit[] = [];
  for (const rec of out.split(RS)) {
    if (!rec.trim()) continue;
    const [sha, author, date, subject, body, raw] = rec.split(US);
    const changes: RawChange[] = [];
    for (const line of (raw ?? "").split("\n")) {
      if (!line.startsWith(":")) continue;
      // :100644 100644 <old> <new> M\tpath
      const [meta, path] = line.slice(1).split("\t");
      const [, , oldBlob, newBlob, status] = meta.split(" ");
      if (!path.endsWith(".md")) continue;
      if (status !== "A" && status !== "M" && status !== "D") {
        throw new Error(`unexpected status ${status} in ${sha}`);
      }
      changes.push({
        status,
        oldBlob: NULL_SHA.test(oldBlob) ? null : oldBlob,
        newBlob: NULL_SHA.test(newBlob) ? null : newBlob,
        path,
      });
    }
    commits.push({ sha, author, date, subject, body, changes });
  }
  return commits;
}
