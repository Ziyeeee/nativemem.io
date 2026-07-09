# ImageKit URL export

Export ImageKit DAM assets into a local manifest. The private key is only used
while running this script and must not be committed or shipped to the browser.

## Single folder

```bash
IMAGEKIT_PRIVATE_KEY="private_xxx" node tools/export-imagekit-urls.mjs /NativeMEM/videos tools/nativeMemVideos.ts
```

## Multiple folders

Use JSON when the next step is patching `index.html`, because it is easiest to
read back mechanically:

```bash
IMAGEKIT_PRIVATE_KEY="private_xxx" node tools/export-imagekit-urls.mjs \
  --folder /NativeMEM/posters \
  --folder /NativeMEM/videos \
  --out tools/imagekit-media.json
```

The script keeps the original `rawUrl` and writes the frontend-ready `url`.
For video files that do not end in `.mp4` or `.mov`, it appends
`/ik-video.mp4` unless `--no-video-hint` is passed.

## Apply the manifest to `index.html`

After exporting `tools/imagekit-media.json`, rewrite the page with
layout-specific ImageKit transformations:

```bash
node tools/apply-imagekit-media-to-html.mjs
```

This keeps media URLs sourced from the manifest and adds `tr` parameters for
poster resizing, image format negotiation, video resizing, and video quality.
