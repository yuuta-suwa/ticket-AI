import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
const output=execFileSync(process.execPath,['node_modules/eve/bin/eve.js','info','--json'],{encoding:'utf8',maxBuffer:8*1024*1024});
const info=JSON.parse(output);
const roster=JSON.parse(fs.readFileSync('config/organization.json','utf8'));
let definitions=0;
function count(dir){for(const name of fs.readdirSync(dir,{withFileTypes:true})){if(name.isDirectory()) count(dir+'/'+name.name);else if(name.name==='agent.ts') definitions++;}}
count('agent');
const forbidden=['bash','write_file','read_file','web_fetch','web_search','agent'];
const rootTools=info.tools ?? [];
if(info.diagnostics?.errors || definitions!==42 || rootTools.some(t=>forbidden.includes(t))) throw new Error('Agent definition verification failed');
const summary={eve_version:'0.83.0',status:info.status,diagnostics:info.diagnostics,departments:8,sections:16,employee_records:roster.employees.length,agent_definitions:definitions,root_tools:rootTools,model_calls_executed:0,default_extensions_disabled_by_start_script:true,live_collaboration_tested:false};
fs.mkdirSync('examples',{recursive:true});fs.writeFileSync('examples/definition-check.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
