#!/usr/bin/env node

import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { chmod, mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { pipeline } from "node:stream/promises";
import { stdin as input, stdout as output } from "node:process";
import tar from "tar";
import unzipper from "unzipper";

const args = process.argv.slice(2);

const usage = `FrameScript project initializer

Usage:
  npm init @frame-script/latest
  create-latest [project-name]

Options:
  -h, --help  Show this help
`;

const hasHelp = args.includes("-h") || args.includes("--help");
if (hasHelp) {
  process.stdout.write(usage);
  process.exit(0);
}

async function promptProjectName(): Promise<string> {
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question("Project name: ");
    return answer.trim();
  } finally {
    rl.close();
  }
}

const REPO = "frame-script/FrameScript";
const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES_URL = `https://api.github.com/repos/${REPO}/releases?per_page=100`;

type LatestRelease = {
  tag_name?: string;
};

type Release = {
  name?: string;
  created_at?: string;
  published_at?: string;
  draft?: boolean;
  assets?: { name?: string; browser_download_url?: string }[];
};

async function requestJson<T>(url: string, redirects = 0): Promise<T> {
  const maxRedirects = 5;
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "frame-script-init",
          Accept: "application/vnd.github+json",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (
          status >= 300 &&
          status < 400 &&
          res.headers.location &&
          redirects < maxRedirects
        ) {
          res.resume();
          const nextUrl = new URL(res.headers.location, url).toString();
          resolve(requestJson(nextUrl, redirects + 1));
          return;
        }

        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`Request failed with status ${status}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          try {
            const text = Buffer.concat(chunks).toString("utf8");
            resolve(JSON.parse(text) as T);
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    req.on("error", reject);
  });
}

async function downloadToFile(
  url: string,
  filePath: string,
  redirects = 0
): Promise<void> {
  const maxRedirects = 5;
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { "User-Agent": "frame-script-init" } },
      (res) => {
        const status = res.statusCode ?? 0;
        if (
          status >= 300 &&
          status < 400 &&
          res.headers.location &&
          redirects < maxRedirects
        ) {
          res.resume();
          const nextUrl = new URL(res.headers.location, url).toString();
          resolve(downloadToFile(nextUrl, filePath, redirects + 1));
          return;
        }

        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`Download failed with status ${status}`));
          return;
        }

        const fileStream = createWriteStream(filePath);
        pipeline(res, fileStream).then(resolve).catch(reject);
      }
    );
    req.on("error", reject);
  });
}

async function fetchLatestTag(): Promise<string> {
  const data = await requestJson<LatestRelease>(LATEST_RELEASE_URL);
  const tag = data.tag_name;
  if (!tag) {
    throw new Error("Latest release tag not found.");
  }
  return tag;
}

function pickLatestReleaseWithBinZip(
  releases: Release[]
): { release: Release; assetUrl: string } | undefined {
  let latest: { release: Release; assetUrl: string } | undefined;

  for (const release of releases) {
    if (release.draft) {
      continue;
    }

    const asset = release.assets?.find(
      (entry) => (entry.name ?? "").toLowerCase() === "bin.zip"
    );
    const url = asset?.browser_download_url;
    if (!url) {
      continue;
    }

    const time =
      Date.parse(release.published_at ?? "") ||
      Date.parse(release.created_at ?? "") ||
      0;
    const latestTime =
      latest?.release.published_at || latest?.release.created_at
        ? Date.parse(
            latest?.release.published_at ?? latest?.release.created_at ?? ""
          ) || 0
        : 0;

    if (!latest || time > latestTime) {
      latest = { release, assetUrl: url };
    }
  }

  return latest;
}

async function fetchLatestBinaryZipUrl(): Promise<string> {
  const releases = await requestJson<Release[]>(RELEASES_URL);
  const latest = pickLatestReleaseWithBinZip(releases);
  if (!latest) {
    throw new Error("Release with bin.zip not found.");
  }
  return latest.assetUrl;
}

async function runNpmInstall(cwd: string): Promise<void> {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  await new Promise<void>((resolve, reject) => {
    const child = spawn(npmCmd, ["install"], { cwd, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm install failed with exit code ${code ?? "?"}`));
      }
    });
  });
}

async function makeExecutablesUnder(dir: string): Promise<void> {
  if (process.platform === "win32") {
    return;
  }

  const entries = await readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await makeExecutablesUnder(fullPath);
        return;
      }
      if (entry.isFile()) {
        await chmod(fullPath, 0o755);
      }
    })
  );
}

async function main(): Promise<void> {
  const rawName = args[0] ?? (await promptProjectName());
  if (!rawName) {
    process.stderr.write("Project name is required.\n");
    process.exit(1);
  }

  const targetDir = path.resolve(process.cwd(), rawName);
  if (existsSync(targetDir)) {
    process.stderr.write(`Directory already exists: ${rawName}\n`);
    process.exit(1);
  }

  process.stdout.write("Fetching latest template...\n");
  const tag = await fetchLatestTag();
  const tarballUrl = `https://codeload.github.com/${REPO}/tar.gz/${tag}`;
  process.stdout.write("Fetching latest binary release...\n");
  const binaryZipUrl = await fetchLatestBinaryZipUrl();

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "frame-script-"));
  const tarPath = path.join(tmpDir, "template.tgz");
  const zipPath = path.join(tmpDir, "bin.zip");
  try {
    await downloadToFile(tarballUrl, tarPath);
    await downloadToFile(binaryZipUrl, zipPath);
    await mkdir(targetDir, { recursive: true });
    await tar.x({ file: tarPath, cwd: targetDir, strip: 1 });
    const binDir = path.join(targetDir, "bin");
    await mkdir(binDir, { recursive: true });
    await pipeline(createReadStream(zipPath), unzipper.Extract({ path: binDir }));
    await makeExecutablesUnder(binDir);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }

  process.stdout.write("Installing dependencies...\n");
  await runNpmInstall(targetDir);

  process.stdout.write(`Created ${rawName}/\n`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Failed to initialize project: ${message}\n`);
  process.exit(1);
});
