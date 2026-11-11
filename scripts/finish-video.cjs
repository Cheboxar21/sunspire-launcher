'use strict';

/**
 * Encode rendered frames + music into the final vertical MP4,
 * extract covers and copy deliverables into github-release/.
 * Usage: node scripts/finish-video.cjs
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const VIDEO = path.join(ROOT, 'video');
const FRAMES = path.join(VIDEO, 'frames');
const RELEASE = path.join(ROOT, 'github-release');
const FFMPEG =
  process.env.FFMPEG ||
  'C:\\Users\\egorv\\AppData\\Local\\Temp\\opencode\\ffmpeg\\ffmpeg-master-latest-win64-gpl-shared\\bin\\ffmpeg.exe';
const MP4 = path.join(VIDEO, 'Sunspire-Motion-Preview.mp4');
const COVER = path.join(VIDEO, 'cover.png');
const COVER_WIDE = path.join(VIDEO, 'cover-wide.png');
const SETUP = path.join(ROOT, 'Sunspire-Setup.exe');

function run(args, label) {
  console.log(`[ffmpeg] ${label}`);
  const result = spawnSync(FFMPEG, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${label}`);
}

function sha256(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex').toUpperCase();
}

function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(1);
}

fs.mkdirSync(RELEASE, { recursive: true });

const frames = fs
  .readdirSync(FRAMES)
  .filter((name) => /^frame_\d{5}\.jpg$/.test(name))
  .sort();
if (frames.length !== 1080) {
  throw new Error(`expected 1080 frames, found ${frames.length}`);
}
console.log(`[frames] ${frames.length} frames ready`);

run(
  [
    '-hide_banner',
    '-y',
    '-framerate', '30',
    '-i', path.join(FRAMES, 'frame_%05d.jpg'),
    '-i', path.join(VIDEO, 'music.wav'),
    '-vf', 'scale=1080:1920:flags=lanczos,format=yuv420p',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '17',
    '-profile:v', 'high',
    '-level', '4.2',
    '-pix_fmt', 'yuv420p',
    '-x264-params', 'keyint=60:min-keyint=30:scenecut=0',
    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-ac', '2',
    '-shortest',
    '-movflags', '+faststart',
    MP4
  ],
  'h264 + aac'
);

// Vertical cover: the download scene.
run(
  [
    '-hide_banner',
    '-y',
    '-ss', '29.4',
    '-i', MP4,
    '-frames:v', '1',
    '-update', '1',
    COVER
  ],
  'cover.png'
);

// Wide 16:9 cover for GitHub/README: blurred backdrop + centered vertical frame.
run(
  [
    '-hide_banner',
    '-y',
    '-i', COVER,
    '-filter_complex',
    '[0:v]split=2[a][b];' +
      '[a]scale=1600:2845:force_original_aspect_ratio=increase,crop=1600:900,boxblur=28:2,eq=brightness=-0.18:saturation=1.05[bg];' +
      '[b]scale=-2:900[fg];' +
      '[bg][fg]overlay=(W-w)/2:(H-h)/2:format=auto',
    '-frames:v', '1',
    '-update', '1',
    COVER_WIDE
  ],
  'cover-wide.png'
);

const artifacts = [
  ['Sunspire-Motion-Preview.mp4', MP4],
  ['cover.png', COVER],
  ['cover-wide.png', COVER_WIDE],
  ['README.md', path.join(RELEASE, 'README.md')],
  ['RELEASE-NOTES.md', path.join(RELEASE, 'RELEASE-NOTES.md')],
  ['TikTok-Caption.txt', path.join(RELEASE, 'TikTok-Caption.txt')],
  ['PUBLISH-GITHUB.md', path.join(RELEASE, 'PUBLISH-GITHUB.md')]
];

const sums = [];
for (const [name, source] of artifacts) {
  if (!fs.existsSync(source)) throw new Error(`missing ${source}`);
  if (path.resolve(source) !== path.resolve(path.join(RELEASE, name))) {
    fs.copyFileSync(source, path.join(RELEASE, name));
  }
  const size = fs.statSync(source).size;
  sums.push(`${sha256(source)}  ${name}`);
  console.log(`[copy] ${name} (${mb(size)} MB)`);
}

if (fs.existsSync(SETUP)) {
  fs.copyFileSync(SETUP, path.join(RELEASE, 'Sunspire-Setup.exe'));
  sums.push(`${sha256(SETUP)}  Sunspire-Setup.exe`);
  console.log(`[copy] Sunspire-Setup.exe (${mb(fs.statSync(SETUP).size)} MB)`);
}

fs.writeFileSync(path.join(RELEASE, 'SHA256SUMS.txt'), sums.join('\n') + '\n');
console.log('[done] SHA256SUMS.txt');
console.log(sums.join('\n'));
