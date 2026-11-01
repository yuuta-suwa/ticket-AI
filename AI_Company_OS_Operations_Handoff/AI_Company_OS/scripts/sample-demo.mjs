import fs from 'node:fs';
import path from 'node:path';
import { Company, ROOT } from '../src/company.mjs';
import { runDemo } from '../src/demo.mjs';
const c=new Company(':memory:');
try {
  const result=runDemo(c,path.join(ROOT,'examples/obsidian-vault'));
  const summary={mode:result.mode,organization:result.organization,task_count:result.tasks.length,accepted:result.tasks.filter(t=>t.status==='ACCEPTED').length,budget:result.budget,vault_files:result.export.files,scorecards:c.scorecard('CEO')};
  fs.writeFileSync(path.join(ROOT,'examples/demo-result.json'),JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify({organization:summary.organization,task_count:summary.task_count,accepted:summary.accepted,budget:summary.budget,vault_files:summary.vault_files}));
} finally {c.close();}
