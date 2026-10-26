#!/usr/bin/env bash
# Reuse runner media tools only when the fixture encoders and probe actually work.
set -euo pipefail

if [[ "${1:-}" != media || $# != 1 ]]; then
  echo 'Usage: bash scripts/ci-setup-tools.sh media' >&2
  exit 2
fi

fixture_dir="$(mktemp -d)"
trap 'rm -rf "$fixture_dir"' EXIT

verify_media() {
  local encoder extension video audio audio_encoder codecs
  for encoder in libx264 libvpx libvpx-vp9; do
    case "$encoder" in
      libx264) extension=mp4; video=h264; audio=aac ;;
      libvpx) extension=webm; video=vp8; audio=opus ;;
      libvpx-vp9) extension=vp9.webm; video=vp9; audio=opus ;;
    esac
    audio_encoder="$audio"
    [[ "$audio" != opus ]] || audio_encoder=libopus
    timeout --kill-after=5s 15s ffmpeg -nostdin -v error -y \
      -f lavfi -i color=c=blue:s=160x90:r=10 \
      -f lavfi -i sine=frequency=440:sample_rate=48000 \
      -t 0.2 -c:v "$encoder" -threads 1 \
      -c:a "$audio_encoder" \
      "$fixture_dir/fixture.$extension" || return 1
    codecs="$(timeout --kill-after=5s 15s ffprobe -v error \
      -show_entries stream=codec_name -of csv=p=0 \
      "$fixture_dir/fixture.$extension")" || return 1
    if ! grep -qx "$video" <<< "$codecs" || ! grep -qx "$audio" <<< "$codecs"; then
      echo "Unexpected fixture codecs for $encoder: $codecs" >&2
      return 1
    fi
  done
}

if verify_media; then
  echo 'Existing FFmpeg and ffprobe passed fixture encoding and probing.'
  exit 0
fi

echo 'Media capability check failed; installing Ubuntu FFmpeg.' >&2
# Do not let repository mirrors or package locks consume the test job budget.
apt_options=(-o Acquire::Retries=0 -o Acquire::http::Timeout=20 -o Acquire::https::Timeout=20 -o DPkg::Lock::Timeout=30)
timeout --kill-after=10s 60s sudo -n apt-get "${apt_options[@]}" update
timeout --kill-after=10s 180s sudo -n env DEBIAN_FRONTEND=noninteractive \
  apt-get "${apt_options[@]}" install --yes --no-install-recommends ffmpeg

if ! verify_media; then
  echo 'Media tools remain unusable after installation.' >&2
  exit 1
fi
