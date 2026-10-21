#!/bin/sh
# Render scripts/icon/icon.svg to .claude-plugin/icon.png at 1024x1024.
# The SVG lives here because validate only takes a PNG or JPEG as the icon.
# Needs rsvg-convert (brew install librsvg, or apt install librsvg2-bin).
set -e
cd "$(dirname "$0")/../.."
if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo 'render: rsvg-convert is not installed. Install librsvg first.' >&2
  exit 1
fi
rsvg-convert -w 1024 -h 1024 -o .claude-plugin/icon.png scripts/icon/icon.svg
