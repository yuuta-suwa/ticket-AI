// Runs every check that CAN run without store credentials and prints an honest release status.
import { spawnSync } from 'node:child_process';
const steps = [
  ['Lint', 'pnpm', ['lint']], ['TypeCheck', 'pnpm', ['typecheck']], ['Tests (unit/integration/security)', 'pnpm', ['test']],
  ['Edge shared bundle', 'pnpm', ['build:edge-shared']], ['Web build', 'pnpm', ['build:web']],
  ['Mobile bundles (iOS + Android Metro export)', 'sh', ['-c', 'cd apps/mobile && EXPO_OFFLINE=1 CI=1 npx expo export --platform ios --platform android --output-dir ../../.release-export']],
];
let failed = 0;
for (const [name, cmd, args] of steps) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  console.log(`\n${r.status === 0 ? 'PASS' : 'FAIL'}  ${name}\n`); if (r.status !== 0) failed++;
}
console.log('NOT RUN HERE (need Apple/Google/Expo credentials): EAS iOS production build (.ipa), EAS Android production build (.aab), TestFlight upload, Play Internal Testing upload.');
console.log('See docs/RELEASE_CHECKLIST.md for the human steps.');
process.exit(failed ? 1 : 0);
