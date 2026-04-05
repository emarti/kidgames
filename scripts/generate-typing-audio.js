#!/usr/bin/env node
// Generates WAV audio files for every word in the typing game using Cartesia TTS.
// Files are saved to typing/client/public/audio/{word}.wav and committed to the repo.
// Idempotent — skips words that already have a file.
//
// Usage (local):
//   CARTESIA_API_KEY=xxx node scripts/generate-typing-audio.js
//
// Usage (via Docker, if node not installed locally):
//   docker run --rm -v $(pwd):/repo -w /repo node:20 \
//     sh -c "CARTESIA_API_KEY=xxx node scripts/generate-typing-audio.js"

import { OBSTACLES } from '../apps/ws/src/games/typing_sim.js';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local from repo root if present (keys stay off disk, out of git)
const envPath = join(__dirname, '../.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m) process.env[m[1]] ??= m[2].trim();
  }
}

const OUT_DIR = join(__dirname, '../typing/client/public/audio');
const API_KEY = process.env.CARTESIA_API_KEY;
const VOICE_ID = '87286a8d-7ea7-4235-a41a-dd9fa6630feb'; // Henry

if (!API_KEY) {
  console.error('Error: CARTESIA_API_KEY not set.');
  console.error('Create .env.local in the repo root (see .env.local.example) or set the env var directly.');
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

// Collect unique words across all obstacles (word lists may overlap)
const words = [...new Set(OBSTACLES.flatMap(o => o.words.map(w => w.word)))];
console.log(`${words.length} unique words across ${OBSTACLES.length} obstacles\n`);

let generated = 0, skipped = 0, failed = 0;

for (const word of words) {
  const outPath = join(OUT_DIR, `${word}.wav`);

  if (existsSync(outPath)) {
    console.log(`  skip  ${word}`);
    skipped++;
    continue;
  }

  try {
    const res = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'Cartesia-Version': '2025-04-16',
        'X-API-Key': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: 'sonic-3',
        transcript: word[0].toUpperCase() + word.slice(1),
        voice: { mode: 'id', id: VOICE_ID },
        output_format: { container: 'wav', encoding: 'pcm_f32le', sample_rate: 44100 },
        speed: 'normal',
        generation_config: { speed: 0.6, volume: 1, emotion: 'calm' },
      }),
    });

    if (!res.ok) {
      const msg = await res.text();
      console.error(`  FAIL  ${word}: HTTP ${res.status} — ${msg}`);
      failed++;
      continue;
    }

    const buf = await res.arrayBuffer();
    writeFileSync(outPath, Buffer.from(buf));
    console.log(`  gen   ${word}  (${(buf.byteLength / 1024).toFixed(0)} KB)`);
    generated++;

    // Small pause to avoid hitting rate limits
    await new Promise(r => setTimeout(r, 80));
  } catch (err) {
    console.error(`  FAIL  ${word}: ${err.message}`);
    failed++;
  }
}

console.log(`\nDone: ${generated} generated, ${skipped} skipped, ${failed} failed`);
if (generated > 0) {
  console.log(`\nFiles written to: ${OUT_DIR}`);
  console.log('Commit them: git add typing/client/public/audio/ && git commit -m "Add Cartesia TTS audio files"');
}
