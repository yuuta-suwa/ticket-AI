import { Company } from './company.mjs';
import { runDemo } from './demo.mjs';
const company=new Company();
try {
  const command=process.argv[2] ?? 'status';let result;
  switch(command){
    case 'demo': result=runDemo(company); break;
    case 'status': result=company.status(); break;
    case 'export': result=company.exportVault(); break;
    case 'pause': result=company.pause('OWNER',process.argv[3] ?? 'Owner requested pause');break;
    case 'resume': result=company.ownerResume();break;
    case 'recover': result=company.recover('OWNER');break;
    default: throw new Error('Use demo | status | export | pause | resume | recover');
  }
  console.log(JSON.stringify(result,null,2));
} catch(e) {console.error(e.message);process.exitCode=1;} finally {company.close();}
