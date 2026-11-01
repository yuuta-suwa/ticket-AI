export function runDemo(company, vaultDirectory=undefined) {
  const id='company-demo-v1';
  company.createProject('CEO',{id,business_id:'simulation-business',goal:'一つのデジタル商品の事業検証計画を、部署間で制作・検収・引き継ぎする'});
  const tasks=[];
  const work=(issuer,assignee,parent,title,dependencies=[])=>{
    let t=company.issue(issuer,{project_id:id,assignee,parent_id:parent,title,brief:'模擬業務。顧客、売上、需要が実在すると主張しない。',acceptance:'成果物、根拠の有無、未検証事項、次工程を明記する',dependencies,quote_units:1,dedupe_key:assignee+'-plan'});
    if(t.status!=='ACCEPTED') {
      if(['QUEUED','REWORK','RETRY_WAIT'].includes(t.status)) t=company.claim(assignee,t.id);
      if(t.status==='RUNNING') {company.submit(assignee,{task_id:t.id,summary:company.employee(assignee).title+'の模擬納品',deliverable:company.employee(assignee).deliverable+'を構成。入力はサンプルであり市場検証は未実施。次工程ではこの成果物を検討する。',evidence_ids:[],limitations:'定型シミュレーション。LLM・実顧客・外部販売には接続していません。',mode:'simulation'});t=company.task(t.id);}
      if(t.status==='REVIEW') t=company.review(t.reviewer,{task_id:t.id,decision:'accept',reason:'模擬モード、納品形式、未検証表示を確認。事業仮説の正しさを承認したものではない。'});
    }
    tasks.push(t.id);return t;
  };
  const root=work('CEO','CEO',null,'AI社長：全社の検証方針');let prior=[];
  for(const [dept,section] of [['STRATEGY','STRATEGY'],['MARKETING','RESEARCH'],['PRODUCT','PLANNING'],['SALES','SALES_PLAN'],['SUPPORT','SERVICE'],['FINANCE','ACCOUNTING'],['PEOPLE','IMPROVEMENT'],['INFORMATION','KNOWLEDGE']]) {
    const director=work('CEO',dept+'_DIRECTOR',root.id,company.employee(dept+'_DIRECTOR').title+'：部門計画',prior);
    const chief=work(dept+'_DIRECTOR',section+'_CHIEF',director.id,company.employee(section+'_CHIEF').title+'：実行指示');
    const staff=work(section+'_CHIEF',section+'_STAFF',chief.id,company.employee(section+'_STAFF').title+'：成果物');
    const body='模擬成果物を納品し、検収済み。タスクID：'+staff.id;
    if(!company.db.prepare('SELECT id FROM messages WHERE project_id=? AND sender=? AND body=?').get(id,staff.assignee,body)) company.message(staff.assignee,{project_id:id,recipient:staff.reviewer,body});
    prior=[staff.id];
  }
  const snapshot=company.status('CEO',id);
  return {summary:'8部門を通じた25件の模擬業務・検収。実売上と外部支出はありません。',...snapshot,export:company.exportVault(vaultDirectory)};
}
