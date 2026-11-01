import fs from 'node:fs';
import { Company } from './company.mjs';
import { VentureLedger } from './ventures.mjs';
import { CommercialPlanner } from './commercial.mjs';
const c=new Company();
try{
  const p=new CommercialPlanner(new VentureLedger(c)),command=process.argv[2]??'status';
  if(command==='status')console.log(JSON.stringify({mode:'local-planning-prototype',plans:p.db.prepare('SELECT id,venture_id,created_at FROM commercial_plans').all(),external_execution_connected:false},null,2));
  else{const input=JSON.parse(fs.readFileSync(0,'utf8'));if(!['register','assess'].includes(command))throw new Error('Unknown commercial command');console.log(JSON.stringify(command==='register'?p.register(input):p.assess(input.id),null,2));}
}catch(e){console.error(e.message);process.exitCode=1;}finally{c.close();}
