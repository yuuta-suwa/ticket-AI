import { api, bar, card, chip, fmtDate, h, STATUS_LABEL } from '../dom.ts';
import type { Me } from '../main.ts';

export async function myPageView(me: Me) {
  const d = await api<any>('/api/mypage');
  const lv = d.xp.level;
  const ratio = lv.nextAt ? (lv.current - lv.levelBase) / (lv.nextAt - lv.levelBase) : 1;
  return [h('h1', null, 'MY PAGE'),
    card(h('h2', null, 'プロフィール'), h('p', { class: 'big' }, d.profile.displayName || d.profile.email), h('p', { class: 'muted small' }, d.profile.email),
      h('p', { class: 'muted small' }, `登録日 ${fmtDate(d.profile.memberSince)}`), me.isAdmin ? h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/admin' }, 'MANAGEMENT（管理）')) : null),
    card(h('div', { class: 'between' }, h('h2', null, 'レベルとXP'), chip(`Lv.${lv.level}`, 'gold')), bar(ratio),
      h('p', { class: 'muted small' }, lv.nextAt ? `累計 ${lv.current} XP ／ 次のレベルまで ${lv.toNext} XP` : `累計 ${lv.current} XP`),
      h('p', { class: 'muted small' }, 'XPは行動の記録です。報酬や認定には直接換算されません。'),
      d.xp.ledger.length ? h('ul', { class: 'list' }, ...d.xp.ledger.slice(0, 30).map((e: any) => h('li', { class: 'between' },
        h('span', null, h('b', null, d.xp.labels[e.ruleKey] ?? e.ruleKey), h('div', { class: 'muted small' }, `${e.reason}・${e.awardedOn}`)),
        h('b', { class: e.points < 0 ? 'err' : '' }, `${e.points > 0 ? '+' : ''}${e.points}`)))) : h('p', { class: 'muted' }, 'まだXPはありません。')),
    card(h('h2', null, '人生の成長履歴（LIFE MAP）'), d.stageHistory.length ? h('ul', { class: 'list' }, ...d.stageHistory.map((e: any) => h('li', null,
      h('b', null, e.title), ` ${STATUS_LABEL[e.fromStatus] ?? e.fromStatus} → ${STATUS_LABEL[e.toStatus] ?? e.toStatus}`, h('div', { class: 'muted small' }, fmtDate(e.createdAt)),
      e.note ? h('p', { class: 'pre small' }, e.note) : null))) : h('p', { class: 'muted' }, 'まだ記録はありません。')),
    card(h('h2', null, '週次レビュー'), h('p', null, `提出 ${d.reviews.filter((r: any) => r.submittedAt).length}件（直近12週）`), h('div', { class: 'row' }, h('a', { class: 'btn sub', href: '#/review' }, '週次レビューへ'), h('a', { class: 'btn sub', href: '#/coach' }, 'AI LIFE COACH')))];
}
