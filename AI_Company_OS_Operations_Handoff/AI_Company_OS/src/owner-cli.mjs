import fs from 'node:fs';
import { createRuntime } from './runtime.mjs';
import { backupDatabase, inspectBackup, restoreDatabase } from './backup.mjs';

// Trusted LOCAL owner entry point. Never connect this file to HTTP or to an AI tool.
// Usage:
//   node src/owner-cli.mjs set-passphrase           (reads the passphrase from stdin, twice-free; use: printf '%s' "$P" | ...)
//   node src/owner-cli.mjs research-policy < policy.json
//   node src/owner-cli.mjs provider-account < account.json
//   node src/owner-cli.mjs revoke-sessions
//   node src/owner-cli.mjs backup <file> | inspect <file> | restore <file> <new-db-file>
const [command,...args]=process.argv.slice(2);
const rt=createRuntime();
try{
  const stdin=()=>fs.readFileSync(0,'utf8');
  const out={
    'set-passphrase':()=>rt.authority.provisionOwnerCredential(stdin().replace(/\r?\n$/,''),{replace:args.includes('--rotate')}),
    'research-policy':()=>rt.research.configurePolicy(JSON.parse(stdin())),
    'provider-account':()=>rt.operations.registerProviderAccount(JSON.parse(stdin())),
    'revoke-sessions':()=>rt.authority.revokeAllSessions('owner-cli'),
    'backup':()=>backupDatabase(rt.company.db,args[0]),
    'inspect':()=>inspectBackup(args[0]),
    'restore':()=>restoreDatabase(args[0],args[1]),
    'status':()=>rt.overview(),
  }[command??'status'];
  if(!out)throw new Error('Unknown owner command');
  console.log(JSON.stringify(out(),null,2));
}catch(e){console.error(e.message);process.exitCode=1;}finally{rt.close();}
