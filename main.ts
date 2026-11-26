// main.ts — the entrypoint: hand the game in.
// Copies game/ and screenshots/ from this repository to the output directory
// and writes /output/dossier.json with buildDossier from vendor/makefun-game.ts.
// Node 22, standard library only. Deterministic: two runs write the same bytes.
//
// The output directory is MAKEFUN_OUTPUT_DIR outside the grader, /output in it.
// It never removes the output directory itself (the grader mounts it); it only
// replaces the game/, screenshots/ and dossier.json entries inside it.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const GAME_DIR = join(REPO_ROOT, 'game');
const SHOTS_DIR = join(REPO_ROOT, 'screenshots');

function replaceTree(target: string, source: string): void {
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
}

function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  replaceTree(join(OUTPUT_DIR, 'game'), GAME_DIR);
  replaceTree(join(OUTPUT_DIR, 'screenshots'), SHOTS_DIR);
  const dossierPath = join(OUTPUT_DIR, 'dossier.json');
  if (existsSync(dossierPath)) rmSync(dossierPath, { force: true });
  const dossier = buildDossier(OUTPUT_DIR, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  });
  writeFileSync(dossierPath, dossier);
  console.log(`island-hopper: dossier.json written (${dossier.length} bytes) to ${OUTPUT_DIR}`);
}

main();
