import { createRuntime } from '../src/runtime.mjs';
import { startServer } from '../src/server.mjs';

// Binds to 127.0.0.1 by default. Put it behind an authenticated private HTTPS path (e.g. Tailscale Serve) for phone access.
const port=Number(process.env.COMPANY_PORT??8787),host=process.env.COMPANY_HOST??'127.0.0.1';
const allowedOrigins=(process.env.COMPANY_ALLOWED_ORIGINS??'').split(',').filter(Boolean);
const rt=createRuntime();
if(!rt.authority.credentialConfigured())console.warn('Owner credential not set. Run: printf "%s" "<passphrase>" | node src/owner-cli.mjs set-passphrase');
const server=await startServer(rt,{port,host,allowedOrigins,secureCookie:process.env.COMPANY_INSECURE_COOKIE!=='1'});
console.log(JSON.stringify({listening:`http://${host}:${port}`,secure_cookie:process.env.COMPANY_INSECURE_COOKIE!=='1'}));
const stop=()=>{server.close(()=>{rt.close();process.exit(0);});};
process.on('SIGINT',stop);process.on('SIGTERM',stop);
