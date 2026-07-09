#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const API_BASE = "https://api.imagekit.io/v1/files";
const DEFAULT_LIMIT = 1000;
const DEFAULT_OUTPUT = "tools/imagekit-media.ts";
const VIDEO_EXTENSION_RE = /\.(mp4|mov|m4v|webm|avi|mkv)$/i;

function printUsage() {
  console.log(`Usage:
  IMAGEKIT_PRIVATE_KEY=private_xxx node tools/export-imagekit-urls.mjs /NativeMEM/videos tools/nativeMemVideos.ts

  IMAGEKIT_PRIVATE_KEY=private_xxx node tools/export-imagekit-urls.mjs \\
    --folder /NativeMEM/images \\
    --folder /NativeMEM/videos \\
    --out tools/imagekit-media.json

Options:
  --folder <path>       ImageKit folder path. Can be repeated.
  --out <file>          Output file. Default: ${DEFAULT_OUTPUT}
  --file-type <value>   ImageKit fileType query value. Default: all
  --limit <number>      Page size. Default: ${DEFAULT_LIMIT}
  --sort <value>        Sort value. Default: ASC_NAME
  --no-video-hint       Do not append /ik-video.mp4 for non-mp4/non-mov videos.
  --help                Show this help.
`);
}

function parseArgs(argv) {
  const options = {
    folders: [],
    outputFile: DEFAULT_OUTPUT,
    fileType: "all",
    limit: DEFAULT_LIMIT,
    sort: "ASC_NAME",
    addVideoHint: true,
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--no-video-hint") {
      options.addVideoHint = false;
      continue;
    }

    if (["--folder", "--out", "--file-type", "--limit", "--sort"].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;

      if (arg === "--folder") options.folders.push(value);
      if (arg === "--out") options.outputFile = value;
      if (arg === "--file-type") options.fileType = value;
      if (arg === "--limit") options.limit = Number.parseInt(value, 10);
      if (arg === "--sort") options.sort = value;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    positional.push(arg);
  }

  if (positional[0]) options.folders.push(positional[0]);
  if (positional[1]) options.outputFile = positional[1];

  if (options.folders.length === 0) {
    options.folders.push("/NativeMEM/videos");
  }

  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 1000) {
    throw new Error("--limit must be an integer from 1 to 1000");
  }

  return options;
}

function authHeader(privateKey) {
  return `Basic ${Buffer.from(`${privateKey}:`).toString("base64")}`;
}

function isVideoAsset(asset) {
  const mime = asset.mime || "";
  const name = asset.name || "";
  const url = asset.url || "";
  const filePath = asset.filePath || "";

  return (
    mime.startsWith("video/") ||
    VIDEO_EXTENSION_RE.test(name) ||
    VIDEO_EXTENSION_RE.test(url.split("?")[0]) ||
    VIDEO_EXTENSION_RE.test(filePath)
  );
}

function normalizeVideoUrl(asset, { addVideoHint }) {
  const rawUrl = asset.url;
  if (!rawUrl || !addVideoHint || !isVideoAsset(asset)) return rawUrl;

  const url = new URL(rawUrl);
  const pathname = url.pathname;
  const alreadyVideoHint = pathname.endsWith("/ik-video.mp4");
  const hasMp4OrMovSuffix = /\.(mp4|mov)$/i.test(pathname);

  if (!alreadyVideoHint && !hasMp4OrMovSuffix) {
    url.pathname = `${pathname.replace(/\/$/, "")}/ik-video.mp4`;
  }

  return url.toString();
}

function toMediaItem(asset, folder, options) {
  return {
    name: asset.name,
    folder,
    filePath: asset.filePath,
    type: asset.type,
    fileType: asset.fileType,
    mime: asset.mime,
    url: normalizeVideoUrl(asset, options),
    rawUrl: asset.url,
    thumbnail: asset.thumbnail,
    width: asset.width,
    height: asset.height,
    size: asset.size,
    duration: asset.duration,
    updatedAt: asset.updatedAt,
    createdAt: asset.createdAt,
    fileId: asset.fileId,
  };
}

async function listFilesInFolder(folder, options, privateKey) {
  let skip = 0;
  const files = [];

  while (true) {
    const params = new URLSearchParams({
      type: "file",
      fileType: options.fileType,
      path: folder,
      limit: String(options.limit),
      skip: String(skip),
      sort: options.sort,
    });

    const response = await fetch(`${API_BASE}?${params}`, {
      headers: {
        Authorization: authHeader(privateKey),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`ImageKit API failed for ${folder}: ${response.status} ${body}`);
    }

    const batch = await response.json();
    if (!Array.isArray(batch)) {
      throw new Error(`Unexpected ImageKit response for ${folder}: expected an array`);
    }

    files.push(...batch);

    if (batch.length < options.limit) break;
    skip += options.limit;
  }

  return files;
}

function stableSortMedia(left, right) {
  const leftPath = left.filePath || left.name || "";
  const rightPath = right.filePath || right.name || "";
  return leftPath.localeCompare(rightPath, "en");
}

function buildOutput(media, outputFile) {
  const extension = path.extname(outputFile).toLowerCase();
  const payload = JSON.stringify(media, null, 2);

  if (extension === ".json") {
    return `${payload}\n`;
  }

  if (extension === ".js" || extension === ".mjs") {
    return `export const imagekitMedia = ${payload};\n`;
  }

  return `export const imagekitMedia = ${payload} as const;\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Please set IMAGEKIT_PRIVATE_KEY before running this script");
  }

  const seenPaths = new Set();
  const media = [];

  for (const folder of options.folders) {
    const assets = await listFilesInFolder(folder, options, privateKey);
    for (const asset of assets) {
      if (asset.type !== "file") continue;

      const item = toMediaItem(asset, folder, options);
      const dedupeKey = item.filePath || item.url || item.name;
      if (seenPaths.has(dedupeKey)) continue;

      seenPaths.add(dedupeKey);
      media.push(item);
    }
  }

  media.sort(stableSortMedia);

  const output = buildOutput(media, options.outputFile);
  await mkdir(path.dirname(options.outputFile), { recursive: true });
  await writeFile(options.outputFile, output);

  const videoCount = media.filter(isVideoAsset).length;
  const imageCount = media.filter((item) => (item.mime || "").startsWith("image/")).length;

  console.log(`Exported ${media.length} assets to ${options.outputFile}`);
  console.log(`Images: ${imageCount}`);
  console.log(`Videos: ${videoCount}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
