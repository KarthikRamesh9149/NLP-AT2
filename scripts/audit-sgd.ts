import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { loadEligible, serviceFor, slotFor } from './sgd';

async function main() {
  const dir = process.env.SGD_DIR ?? process.argv[2];
  if (!dir) throw new Error('Pass the official SGD checkout path: pnpm data:audit /path/to/dstc8-schema-guided-dialogue');
  const splits = {} as Record<'train' | 'dev' | 'test', unknown>;
  for (const split of ['train', 'dev', 'test'] as const) {
    const result = await loadEligible(dir, split);
    splits[split] = { service: serviceFor[split], dialogueCount: result.dialogueCount, singleServiceCount: result.singleServiceCount, eligibleReservationDialogues: result.eligible.length, reservationUserTurns: result.eligible.reduce((sum, dialogue) => sum + dialogue.reserveUserTurns, 0), slotMap: slotFor[split] };
  }
  let sourceCommit: string | null = null;
  try { sourceCommit = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* Archive downloads have no Git metadata. */ }
  const report = { source: 'https://github.com/google-research-datasets/dstc8-schema-guided-dialogue', sourceCommit, note: 'Single-service restaurant reservation dialogues; test service differs from train service.', splits };
  await mkdir('evaluation/results', { recursive: true });
  await writeFile('evaluation/results/sgd-audit.json', JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
