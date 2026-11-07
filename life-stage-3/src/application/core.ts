// BUILD-B：人生攻略のコア（ユースケース）。権限・所有者・状態遷移はすべてここで判定する
import { DomainError } from '../domain/errors.ts';
import { assertActive, assertAdmin, type Member } from '../domain/member.ts';
import { PLAN_STEPS, STEPS, missingForComplete, parseStepContent, stepDef, type StepVersion } from '../domain/steps.ts';
import { MAX_STAGES, assertEditable, isStageStatus, parseStageInput, transitionStage, type Stage } from '../domain/stage.ts';
import {
  MAX_OPEN_MISSIONS, applyMemberAction, isMemberAction, parseMissionInput, review, todaysMissions, urgency, type Mission,
} from '../domain/mission.ts';
import { DEFAULT_XP_RULES, RULE_KEYS, RULE_LABELS, levelFor, parseXpRules, type RuleKey, type XpRules } from '../domain/xp.ts';
import { parseReviewInput, type WeeklyReview } from '../domain/review.ts';
import { COACH_THEMES, buildPrompt, isCoachTheme, sanitizeImport, type CoachNote } from '../domain/coach.ts';
import { addDays, isWeekKey, isoWeekKey, jstDate, weekStart } from '../domain/time.ts';
import { cleanText } from '../domain/text.ts';
import type { Deps } from './ports.ts';

const today = (d: Deps) => jstDate(d.clock.now());

// ───────── XP ─────────
export async function currentRules(d: Deps): Promise<{ version: number; rules: XpRules }> {
  return (await d.config.latestXpRules()) ?? { version: 0, rules: DEFAULT_XP_RULES };
}

/** 付与。同じ source_event_id は二度付与しない。日次上限のあるルールは上限で止める */
export async function awardXp(d: Deps, ownerId: string, key: RuleKey, sourceEventId: string, reason: string, actor: string): Promise<number> {
  const { version, rules } = await currentRules(d);
  const points = rules.points[key];
  if (!points) return 0;
  const day = today(d);
  if (await d.xp.hasSource(sourceEventId)) return 0;
  if (key === 'activity' && (await d.xp.countOn(ownerId, 'activity', day)) >= rules.activityDailyCap) return 0;
  const ok = await d.xp.award({
    id: d.ids.next(), ownerId, sourceEventId, ruleKey: key, ruleVersion: version, points, reason, awardedOn: day, actorUserId: actor, createdAt: d.clock.now(),
  });
  return ok ? points : 0;
}

export async function myXp(d: Deps, me: Member) {
  assertActive(me);
  const { rules } = await currentRules(d);
  const total = await d.xp.total(me.id);
  return { level: levelFor(total, rules.levelThresholds), ledger: await d.xp.ledger(me.id, 100), labels: RULE_LABELS };
}

// ───────── 10ステップ ─────────
function viewSteps(versions: StepVersion[]) {
  return STEPS.map((def) => {
    const v = versions.find((x) => x.stepNo === def.no);
    return { no: def.no, name: def.name, phase: def.phase, summary: def.summary, fields: def.fields,
      status: v?.status ?? 'empty', version: v?.version ?? 0, content: v?.content ?? {}, updatedAt: v?.createdAt ?? null };
  });
}

export async function getSteps(d: Deps, me: Member) {
  assertActive(me);
  const cycle = await d.steps.currentCycle(me.id);
  return { cycle, steps: viewSteps(await d.steps.latestAll(me.id, cycle)) };
}

export async function stepHistory(d: Deps, me: Member, no: number) {
  assertActive(me);
  stepDef(no);
  const cycle = await d.steps.currentCycle(me.id);
  return (await d.steps.history(me.id, cycle, no)).map((v) => ({ version: v.version, status: v.status, content: v.content, createdAt: v.createdAt }));
}

export async function saveStep(d: Deps, me: Member, no: number, raw: unknown) {
  assertActive(me);
  const body = (raw ?? {}) as { content?: unknown; complete?: unknown };
  const content = parseStepContent(no, body.content);
  const complete = body.complete === true;
  const cycle = await d.steps.currentCycle(me.id);
  const latest = await d.steps.latestAll(me.id, cycle);
  if (complete) {
    const missing = missingForComplete(no, content);
    if (missing.length) throw new DomainError('invalid_input', 'incomplete', missing);
    const done = (n: number) => latest.some((v) => v.stepNo === n && v.status === 'completed');
    if (no >= 7 && !PLAN_STEPS.every(done)) throw new DomainError('invalid_input', 'plan steps first', ['ステップ1〜6を先に完了してください']);
    if (no === 10 && ![7, 8, 9].every(done)) throw new DomainError('invalid_input', 'loop steps first', ['ステップ7〜9を先に完了してください']);
  }
  const prev = latest.find((v) => v.stepNo === no);
  const status = complete ? 'completed' : 'draft';
  if (prev && prev.status === status && JSON.stringify(prev.content) === JSON.stringify(content)) return { saved: false, version: prev.version, xp: 0 };
  const v: StepVersion = { id: d.ids.next(), ownerId: me.id, cycle, stepNo: no, version: (prev?.version ?? 0) + 1, status, content, createdAt: d.clock.now() };
  await d.steps.insert(v);
  let xp = 0;
  const after = [...latest.filter((x) => x.stepNo !== no), v];
  if (PLAN_STEPS.every((n) => after.some((x) => x.stepNo === n && x.status === 'completed')))
    xp = await awardXp(d, me.id, 'plan_complete', `plan_complete:${me.id}:${cycle}`, `第${cycle}サイクルの計画（ステップ1〜6）を完成`, me.id);
  return { saved: true, version: v.version, xp };
}

/** ステップ10の達成後、次の目標で新しいサイクルを始める（過去のサイクルは残る） */
export async function startNextCycle(d: Deps, me: Member) {
  assertActive(me);
  const cycle = await d.steps.currentCycle(me.id);
  const latest = await d.steps.latestAll(me.id, cycle);
  const s10 = latest.find((v) => v.stepNo === 10);
  if (s10?.status !== 'completed') throw new DomainError('invalid_input', 'step 10 not completed', ['ステップ10（達成）を先に完了してください']);
  const s1 = latest.find((v) => v.stepNo === 1);
  const now = d.clock.now();
  await d.steps.insert({ id: d.ids.next(), ownerId: me.id, cycle: cycle + 1, stepNo: 1, version: 1, status: 'draft', content: s1?.content ?? {}, createdAt: now });
  await d.steps.insert({ id: d.ids.next(), ownerId: me.id, cycle: cycle + 1, stepNo: 2, version: 1, status: 'draft',
    content: parseStepContent(2, { goal: String(s10.content.next_goal ?? '').slice(0, 200) }), createdAt: now });
  return { cycle: cycle + 1 };
}

// ───────── LIFE MAP ─────────
const stageView = (s: Stage) => ({ id: s.id, position: s.position, title: s.title, conditionText: s.conditionText, dueOn: s.dueOn,
  status: s.status, evidenceNote: s.evidenceNote, nextChallenge: s.nextChallenge, achievedAt: s.achievedAt, updatedAt: s.updatedAt });

export async function listStages(d: Deps, me: Member) {
  assertActive(me);
  const [stages, missions] = await Promise.all([d.stages.list(me.id), d.missions.list(me.id, true)]);
  return stages.map((s) => {
    const ms = missions.filter((m) => m.stageId === s.id && !m.archivedAt);
    return { ...stageView(s), missionTotal: ms.length, missionDone: ms.filter((m) => m.status === 'verified').length };
  });
}

export async function createStage(d: Deps, me: Member, raw: unknown) {
  assertActive(me);
  const input = parseStageInput(raw);
  const existing = await d.stages.list(me.id);
  if (existing.length >= MAX_STAGES) throw new DomainError('invalid_input', 'too many stages', [`ステージは${MAX_STAGES}件までです`]);
  const now = d.clock.now();
  const s: Stage = { id: d.ids.next(), ownerId: me.id, position: Math.max(0, ...existing.map((x) => x.position)) + 1, ...input,
    status: existing.some((x) => x.status === 'active') || existing.length ? 'locked' : 'active',
    evidenceNote: '', createdAt: now, updatedAt: now, achievedAt: null, archivedAt: null };
  await d.stages.insert(s);
  return stageView(s);
}

async function myStage(d: Deps, me: Member, id: string) {
  const s = await d.stages.get(me.id, id);
  if (!s || s.archivedAt) throw new DomainError('not_found');
  return s;
}

export async function updateStage(d: Deps, me: Member, id: string, raw: unknown) {
  assertActive(me);
  const s = await myStage(d, me, id);
  assertEditable(s);
  const next = { ...s, ...parseStageInput(raw), updatedAt: d.clock.now() };
  await d.stages.update(next);
  return stageView(next);
}

export async function changeStageStatus(d: Deps, me: Member, id: string, raw: unknown) {
  assertActive(me);
  const o = (raw ?? {}) as { status?: unknown; note?: unknown };
  if (!isStageStatus(o.status)) throw new DomainError('invalid_input');
  const s = await myStage(d, me, id);
  const note = cleanText(o.note, 2000, 'note');
  const next = transitionStage(s, o.status, note, d.clock.now());
  await d.stages.transition(next, s.status, note, d.ids.next(), d.clock.now());
  return stageView(next);
}

export async function moveStage(d: Deps, me: Member, id: string, dir: unknown) {
  assertActive(me);
  if (dir !== 'up' && dir !== 'down') throw new DomainError('invalid_input');
  const list = await d.stages.list(me.id);
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) throw new DomainError('not_found');
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) return { moved: false };
  const a = list[i]!, b = list[j]!, now = d.clock.now();
  await d.stages.update({ ...a, position: b.position, updatedAt: now });
  await d.stages.update({ ...b, position: a.position, updatedAt: now });
  return { moved: true };
}

export async function archiveStage(d: Deps, me: Member, id: string) {
  assertActive(me);
  const s = await myStage(d, me, id);
  await d.stages.update({ ...s, archivedAt: d.clock.now(), updatedAt: d.clock.now() });
  return { archived: true };
}

// ───────── DAILY MISSION ─────────
const missionView = (m: Mission, day: string) => ({ id: m.id, title: m.title, detail: m.detail, stageId: m.stageId, dueOn: m.dueOn,
  contribution: m.contribution, effort: m.effort, kpiGap: m.kpiGap, verifyMode: m.verifyMode, status: m.status,
  today: m.todayOn === day, overdue: !!m.dueOn && m.dueOn < day && !['verified', 'submitted'].includes(m.status),
  evidenceNote: m.evidenceNote, returnReason: m.returnReason, verifiedAt: m.verifiedAt, updatedAt: m.updatedAt, urgency: urgency(m.dueOn, day) });

export async function listMissions(d: Deps, me: Member, includeClosed: boolean) {
  assertActive(me);
  const day = today(d);
  return (await d.missions.list(me.id, includeClosed)).map((m) => missionView(m, day));
}

async function checkStage(d: Deps, me: Member, stageId: string | null) {
  if (stageId && !(await d.stages.get(me.id, stageId))) throw new DomainError('invalid_input', 'unknown stage');
}

export async function createMission(d: Deps, me: Member, raw: unknown) {
  assertActive(me);
  const input = parseMissionInput(raw);
  await checkStage(d, me, input.stageId);
  if ((await d.missions.countOpen(me.id)) >= MAX_OPEN_MISSIONS) throw new DomainError('invalid_input', 'too many', [`進行中のミッションは${MAX_OPEN_MISSIONS}件までです`]);
  const now = d.clock.now();
  const m: Mission = { id: d.ids.next(), ownerId: me.id, ...input, status: 'not_started', todayOn: null, evidenceNote: '', returnReason: '',
    verifiedBy: null, verifiedAt: null, createdAt: now, updatedAt: now, archivedAt: null };
  await d.missions.insert(m);
  return missionView(m, today(d));
}

async function myMission(d: Deps, me: Member, id: string) {
  const m = await d.missions.get(me.id, id);
  if (!m) throw new DomainError('not_found');
  return m;
}

export async function updateMission(d: Deps, me: Member, id: string, raw: unknown) {
  assertActive(me);
  const m = await myMission(d, me, id);
  if (m.archivedAt || m.status === 'verified' || m.status === 'submitted') throw new DomainError('invalid_input', 'locked', ['確認待ち・確認済みのミッションは編集できません']);
  const input = parseMissionInput(raw);
  await checkStage(d, me, input.stageId);
  const next = { ...m, ...input, updatedAt: d.clock.now() };
  await d.missions.save(next, null);
  return missionView(next, today(d));
}

export async function missionAction(d: Deps, me: Member, id: string, raw: unknown) {
  assertActive(me);
  const o = (raw ?? {}) as { action?: unknown; note?: unknown };
  if (!isMemberAction(o.action)) throw new DomainError('invalid_input');
  const note = cleanText(o.note, 2000, 'note');
  const m = await myMission(d, me, id);
  const now = d.clock.now();
  const next = applyMemberAction(m, o.action, note, now);
  await d.missions.save(next, { id: d.ids.next(), missionId: m.id, ownerId: me.id, action: o.action, note, actorUserId: me.id, createdAt: now });
  let xp = 0;
  if (o.action === 'log' || o.action === 'complete_self' || o.action === 'submit')
    xp = await awardXp(d, me.id, 'activity', `activity:${m.id}:${today(d)}`, `活動記録：${m.title}`, me.id);
  return { mission: missionView(next, today(d)), xp };
}

export async function setToday(d: Deps, me: Member, id: string, on: unknown) {
  assertActive(me);
  const m = await myMission(d, me, id);
  const day = today(d);
  if (on === true) {
    const picked = (await d.missions.list(me.id, false)).filter((x) => x.todayOn === day && x.id !== id);
    if (picked.length >= 3) throw new DomainError('invalid_input', 'max 3', ['今日のミッションは3件までです']);
  }
  const next = { ...m, todayOn: on === true ? day : null, updatedAt: d.clock.now() };
  await d.missions.save(next, null);
  return missionView(next, day);
}

export async function archiveMission(d: Deps, me: Member, id: string) {
  assertActive(me);
  const m = await myMission(d, me, id);
  if (m.status === 'submitted') throw new DomainError('invalid_input', 'submitted', ['確認待ちのミッションは非表示にできません']);
  await d.missions.save({ ...m, archivedAt: d.clock.now(), updatedAt: d.clock.now() }, null);
  return { archived: true };
}

export async function missionLogs(d: Deps, me: Member, id: string) {
  assertActive(me);
  await myMission(d, me, id);
  return (await d.missions.logs(me.id, id)).map((l) => ({ action: l.action, note: l.note, createdAt: l.createdAt, byMe: l.actorUserId === me.id }));
}

// ───────── 週次レビュー ─────────
const reviewView = (r: WeeklyReview | null, weekKey: string) => ({ weekKey, wentWell: r?.wentWell ?? '', blockers: r?.blockers ?? '',
  improvements: r?.improvements ?? '', nextActions: r?.nextActions ?? '', submittedAt: r?.submittedAt ?? null, updatedAt: r?.updatedAt ?? null });

function allowedWeeks(day: string) { return [isoWeekKey(day), isoWeekKey(addDays(weekStart(day), -1))]; }

export async function getReview(d: Deps, me: Member, weekKey: unknown) {
  assertActive(me);
  const wk = weekKey === undefined || weekKey === null || weekKey === '' ? isoWeekKey(today(d)) : weekKey;
  if (!isWeekKey(wk)) throw new DomainError('invalid_input');
  return { ...reviewView(await d.reviews.get(me.id, wk), wk), editable: allowedWeeks(today(d)).includes(wk) };
}

export async function saveReview(d: Deps, me: Member, weekKey: string, raw: unknown) {
  assertActive(me);
  if (!isWeekKey(weekKey)) throw new DomainError('invalid_input');
  if (!allowedWeeks(today(d)).includes(weekKey)) throw new DomainError('invalid_input', 'past week', ['今週と先週のレビューだけ編集できます']);
  const input = parseReviewInput(raw);
  const prev = await d.reviews.get(me.id, weekKey);
  const now = d.clock.now();
  const r: WeeklyReview = { id: prev?.id ?? d.ids.next(), ownerId: me.id, weekKey, wentWell: input.wentWell, blockers: input.blockers,
    improvements: input.improvements, nextActions: input.nextActions, submittedAt: prev?.submittedAt ?? (input.submit ? now : null), updatedAt: now };
  await d.reviews.upsert(r);
  const xp = r.submittedAt ? await awardXp(d, me.id, 'weekly_review', `weekly:${me.id}:${weekKey}`, `週次レビュー ${weekKey}`, me.id) : 0;
  return { review: reviewView(r, weekKey), xp };
}

export async function listReviews(d: Deps, me: Member) {
  assertActive(me);
  return (await d.reviews.list(me.id, 52)).map((r) => reviewView(r, r.weekKey));
}

// ───────── HOME ─────────
function nextStepToWork(steps: ReturnType<typeof viewSteps>) {
  return steps.find((s) => s.status !== 'completed') ?? null;
}

export async function home(d: Deps, me: Member) {
  assertActive(me);
  const day = today(d);
  const cycle = await d.steps.currentCycle(me.id);
  const [versions, stages, missions, rules, total] = await Promise.all([
    d.steps.latestAll(me.id, cycle), d.stages.list(me.id), d.missions.list(me.id, true), currentRules(d), d.xp.total(me.id)]);
  const steps = viewSteps(versions);
  const thisWeekStart = weekStart(day);
  const lastWeekStart = addDays(thisWeekStart, -7);
  const logs = await d.missions.recentLogs(me.id, `${lastWeekStart}T00:00:00+09:00`);
  const logDay = (l: { createdAt: string }) => jstDate(l.createdAt);
  const activity = (from: string, to: string) => logs.filter((l) => ['log', 'complete_self', 'submit'].includes(l.action) && logDay(l) >= from && logDay(l) < to).length;
  const review = await d.reviews.get(me.id, isoWeekKey(day));
  const ledgerToday = (await d.xp.ledger(me.id, 50)).filter((e) => e.awardedOn === day).reduce((a, e) => a + e.points, 0);
  const s1 = steps[0]!.content as Record<string, string>, s2 = steps[1]!.content as Record<string, string>, s3 = steps[2]!.content as Record<string, string>;
  const active = stages.find((s) => s.status === 'active') ?? null;
  const open = missions.filter((m) => !m.archivedAt && ['not_started', 'in_progress', 'returned'].includes(m.status));
  const overdue = open.filter((m) => m.dueOn && m.dueOn < day).length;
  const todays = todaysMissions(missions, day).map((x) => ({ ...missionView(x.mission, day), score: x.score, picked: x.picked }));
  // ルールによる提案（AI APIは使わない）
  const tips: string[] = [];
  const next = nextStepToWork(steps);
  if (next && next.no <= 6) tips.push(`MY GOALのステップ${next.no}「${next.name}」を進めると、計画が完成に近づきます。`);
  if (!stages.length) tips.push('LIFE MAPに最初のステージを作り、達成条件を書いてみましょう。');
  if (!open.length) tips.push('今日できる小さなミッションを1つ登録しましょう。');
  if (overdue) tips.push(`期限を過ぎたミッションが${overdue}件あります。期限の見直しか、小さく分けることを検討しましょう。`);
  if (!review?.submittedAt && [5, 6, 0].includes(new Date(`${day}T00:00:00Z`).getUTCDay())) tips.push('今週の振り返り（週次レビュー）を書きましょう。');
  if (missions.some((m) => m.status === 'returned')) tips.push('差し戻されたミッションがあります。理由を確認して再提出しましょう。');
  return {
    today: day, cycle,
    purpose: s1.purpose ?? '', goal: s2.goal ?? '', finalDue: s3.final_due || null,
    daysLeft: s3.final_due ? Math.round((Date.parse(s3.final_due) - Date.parse(day)) / 86_400_000) : null,
    steps: { completed: steps.filter((s) => s.status === 'completed').length, total: 10, next: next ? { no: next.no, name: next.name } : null },
    stage: active ? { id: active.id, title: active.title, dueOn: active.dueOn, position: stages.indexOf(active) + 1, total: stages.length } : null,
    stagesAchieved: stages.filter((s) => s.status === 'achieved').length,
    missionsToday: todays,
    progress: {
      thisWeek: activity(thisWeekStart, addDays(thisWeekStart, 7)), lastWeek: activity(lastWeekStart, thisWeekStart),
      today: activity(day, addDays(day, 1)), yesterday: activity(addDays(day, -1), day),
      verifiedThisWeek: missions.filter((m) => m.verifiedAt && jstDate(m.verifiedAt) >= thisWeekStart).length,
      overdue,
    },
    xp: { ...levelFor(total, rules.rules.levelThresholds), today: ledgerToday },
    review: { weekKey: isoWeekKey(day), submitted: !!review?.submittedAt },
    tips: tips.slice(0, 3),
  };
}

// ───────── MY PAGE ─────────
export async function myPage(d: Deps, me: Member) {
  assertActive(me);
  const [xp, events, reviews] = await Promise.all([myXp(d, me), d.stages.events(me.id, 50), d.reviews.list(me.id, 12)]);
  return {
    profile: { email: me.email, displayName: me.displayName, memberSince: me.createdAt, isAdmin: me.roles.includes('admin') },
    xp, stageHistory: events, reviews: reviews.map((r) => ({ weekKey: r.weekKey, submittedAt: r.submittedAt })),
  };
}

// ───────── AI LIFE COACH（API不使用） ─────────
export async function coachPrompt(d: Deps, me: Member, theme: unknown, timeBudget: unknown) {
  assertActive(me);
  if (!isCoachTheme(theme)) throw new DomainError('invalid_input');
  const cycle = await d.steps.currentCycle(me.id);
  const steps = await d.steps.latestAll(me.id, cycle);
  const c = (n: number) => (steps.find((s) => s.stepNo === n)?.content ?? {}) as Record<string, unknown>;
  const kpis = ((c(5).kpis as Record<string, string>[]) ?? []).map((k) => `${k.name}（目標 ${k.target}${k.unit ?? ''}）`).join('、');
  const day = today(d);
  const logs = await d.missions.recentLogs(me.id, `${weekStart(day)}T00:00:00+09:00`);
  const done = [...new Set(logs.filter((l) => ['log', 'complete_self', 'submit'].includes(l.action)).map((l) => l.title))].slice(0, 10).join('、');
  const rv = (await d.reviews.get(me.id, isoWeekKey(day))) ?? (await d.reviews.get(me.id, isoWeekKey(addDays(day, -7))));
  const prompt = buildPrompt(theme, {
    goalSummary: String(c(1).purpose ?? ''), kpis, completedActions: done, blockers: rv?.blockers ?? '', timeBudget: cleanText(timeBudget, 100, 'timeBudget'),
  });
  return { theme, themeLabel: COACH_THEMES[theme], prompt, chatUrl: 'https://chatgpt.com/' };
}

const noteView = (n: CoachNote) => ({ id: n.id, theme: n.theme, themeLabel: COACH_THEMES[n.theme], body: n.body, status: n.status, createdAt: n.createdAt });

export async function saveCoachNote(d: Deps, me: Member, raw: unknown) {
  assertActive(me);
  const o = (raw ?? {}) as { theme?: unknown; body?: unknown };
  if (!isCoachTheme(o.theme)) throw new DomainError('invalid_input');
  const now = d.clock.now();
  const n: CoachNote = { id: d.ids.next(), ownerId: me.id, theme: o.theme, body: sanitizeImport(o.body), status: 'draft', createdAt: now, updatedAt: now };
  await d.coach.insert(n);
  return noteView(n);
}

export async function setCoachNoteStatus(d: Deps, me: Member, id: string, status: unknown) {
  assertActive(me);
  if (status !== 'adopted' && status !== 'discarded' && status !== 'draft') throw new DomainError('invalid_input');
  const n = await d.coach.get(me.id, id);
  if (!n) throw new DomainError('not_found');
  const next = { ...n, status, updatedAt: d.clock.now() } as CoachNote;
  await d.coach.update(next);
  return noteView(next);
}

export async function listCoachNotes(d: Deps, me: Member) {
  assertActive(me);
  return (await d.coach.list(me.id, 50)).map(noteView);
}

// ───────── MANAGEMENT ─────────
export async function adminXpRules(d: Deps, me: Member) {
  assertAdmin(me);
  const cur = await currentRules(d);
  return { ...cur, keys: RULE_KEYS, labels: RULE_LABELS, history: await d.config.xpRuleHistory(20) };
}

/** XPルールは版として追加する。過去のXP台帳は再計算しない（T-17） */
export async function updateXpRules(d: Deps, me: Member, raw: unknown) {
  assertAdmin(me);
  const o = (raw ?? {}) as { rules?: unknown; reason?: unknown };
  const rules = parseXpRules(o.rules);
  const reason = cleanText(o.reason, 500, 'reason');
  if (!reason) throw new DomainError('invalid_input', 'reason', ['変更理由を入力してください']);
  const cur = await currentRules(d);
  const now = d.clock.now();
  await d.config.insertXpRules(cur.version + 1, rules, reason, me.id, now, {
    actorUserId: me.id, action: 'config.xp_rules', targetType: 'xp_rules', targetId: String(cur.version + 1), before: cur.rules, after: rules, reason,
  }, d.ids.next());
  return { version: cur.version + 1, rules };
}

export async function revokeXp(d: Deps, me: Member, entryId: string, raw: unknown) {
  assertAdmin(me);
  const reason = cleanText((raw as { reason?: unknown })?.reason, 500, 'reason');
  if (!reason) throw new DomainError('invalid_input', 'reason', ['取消理由を入力してください']);
  const e = await d.xp.getEntry(entryId);
  if (!e || e.points <= 0) throw new DomainError('not_found');
  const ok = await d.xp.award({ id: d.ids.next(), ownerId: e.ownerId, sourceEventId: `revoke:${e.id}`, ruleKey: e.ruleKey, ruleVersion: e.ruleVersion,
    points: -e.points, reason: `取消：${reason}`, awardedOn: today(d), actorUserId: me.id, createdAt: d.clock.now() });
  if (!ok) throw new DomainError('conflict', 'already revoked', ['すでに取り消されています']);
  await d.audit.write({ actorUserId: me.id, action: 'xp.revoke', targetType: 'xp_ledger', targetId: e.id, before: { points: e.points }, after: { points: 0 }, reason }, d.ids.next(), d.clock.now());
  return { revoked: true };
}

export async function adminMemberXp(d: Deps, me: Member, userId: string) {
  assertAdmin(me);
  const target = await d.members.findById(userId);
  if (!target) throw new DomainError('not_found');
  return { member: { id: target.id, email: target.email, displayName: target.displayName }, ledger: await d.xp.ledger(userId, 100), total: await d.xp.total(userId) };
}

/** 確認待ちミッション。管理者に見せるのは題名・証拠・提出者のみ（人生目標の本文は出さない） */
export async function submittedMissions(d: Deps, me: Member) {
  assertAdmin(me);
  return (await d.missions.listSubmitted()).map((m) => ({ id: m.id, title: m.title, detail: m.detail, evidenceNote: m.evidenceNote, dueOn: m.dueOn,
    owner: { email: m.ownerEmail, displayName: m.ownerName }, updatedAt: m.updatedAt }));
}

export async function reviewMission(d: Deps, me: Member, id: string, raw: unknown) {
  assertAdmin(me);
  const o = (raw ?? {}) as { decision?: unknown; reason?: unknown };
  if (o.decision !== 'verified' && o.decision !== 'returned') throw new DomainError('invalid_input');
  const m = await d.missions.getAny(id);
  if (!m) throw new DomainError('not_found');
  const reason = cleanText(o.reason, 1000, 'reason');
  const now = d.clock.now();
  const next = review(m, o.decision, me.id, reason, now);
  await d.missions.save(next, { id: d.ids.next(), missionId: m.id, ownerId: m.ownerId, action: o.decision, note: reason, actorUserId: me.id, createdAt: now });
  await d.audit.write({ actorUserId: me.id, action: `mission.${o.decision}`, targetType: 'mission', targetId: m.id, before: { status: m.status }, after: { status: next.status }, reason: reason || null }, d.ids.next(), now);
  return { status: next.status };
}

export async function auditLog(d: Deps, me: Member) {
  assertAdmin(me);
  return d.audit.recent(100);
}
