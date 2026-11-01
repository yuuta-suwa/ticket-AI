#!/usr/bin/env python3
"""Validate documentation contracts and the explicitly hypothetical arithmetic.
This is not an implementation acceptance test or market validation."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
case=json.loads((ROOT/'review/economics.json').read_text())
s=case['subscription'];m=case['media']
spend=sum(s[k] for k in ['payment_cost','infrastructure','api','ads','acquisition_creation'])
cash=s['gross_received']-s['refunds']-spend
econ=cash-s['owner_hours']*s['owner_hour_value']
cac=(s['ads']+s['acquisition_creation']+s['owner_acquisition_hours']*s['owner_hour_value'])/s['new_paid_customers']
media_cash=m['ad_received']+m['referral_received']-sum(m[k] for k in ['production','translation','tools','distribution'])
media_econ=media_cash-m['owner_hours']*m['owner_hour_value']
assert (spend,cash,econ,cash-s['initial_cost'],econ-s['initial_cost'],cac)==(38400,18600,2600,-21400,-37400,4400)
assert (media_cash,media_econ)==(-9800,-21800)
matrix=json.loads((ROOT/'REBUILD_ACCEPTANCE_MATRIX.json').read_text())
ids=[x['id'] for x in matrix['criteria']]
assert len(ids)==len(set(ids))
# Updated 2026-11-01: statuses may change only with evidence and an explicit verification scope.
assert all(x['status'] in ('NOT_RUN','LOCAL_PASS','LOCAL_PASS_PARTIAL','EXTERNAL_TEST_PASS','PRODUCTION_VERIFIED','REAL_DEVICE_VERIFIED') for x in matrix['criteria'])
assert all((x['status']=='NOT_RUN')==(x['evidence']==[]) and (x['status']=='NOT_RUN' or x['verification_scope']) for x in matrix['criteria'])
assert not any(x['status'] in ('PRODUCTION_VERIFIED','REAL_DEVICE_VERIFIED') for x in matrix['criteria']), 'no production/device evidence exists yet'
manifest=json.loads((ROOT/'review/role-instruction-manifest.json').read_text())
assert len(manifest['roles'])==42
for r in manifest['roles']:
    for name in r['files']:
        assert (ROOT/name).is_file(),name
        body=(ROOT/name).read_text()
        assert body.count('## 統合再構築の職務契約｜2026-10-26')==1,name
        assert r['contract'] in body,name
for name in ['AI_COMPANY_MASTER_BLUEPRINT.md','SYSTEM_IMPLEMENTATION_BLUEPRINT.md','BUSINESS_AND_SYSTEM_REVIEW.md','MARKET_RESEARCH_SPEC.md','ROLE_EXECUTION_CONTRACTS.md','IMPLEMENTATION_STATUS.md']:
    assert (ROOT/name).is_file(),name
    assert name in (ROOT/'CLAUDE_CODE_START.txt').read_text(),name
result={'scope':'documentation-consistency-and-hypothetical-arithmetic-only','runtime_roles_consistent':42,'future_acceptance_criteria':len(ids),'acceptance_status_counts':{k:sum(1 for x in matrix['criteria'] if x['status']==k) for k in sorted({x['status'] for x in matrix['criteria']})},'subscription':{'cash':cash,'economic':econ,'cash_after_initial':cash-s['initial_cost'],'economic_after_initial':econ-s['initial_cost'],'cac':cac},'media':{'cash':media_cash,'economic':media_econ},'market_validation':False,'external_execution_verified':False}
(ROOT/'review/design-check-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False,indent=2))
