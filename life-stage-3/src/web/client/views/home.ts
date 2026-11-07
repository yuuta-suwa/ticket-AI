import { api, bar, card, chip, h, statusChip } from '../dom.ts';

export async function homeView() {
  const d = await api<any>('/api/home');
  const out: Node[] = [];
  // 現在地
  const where = card(h('h2', null, '今の自分'),
    d.purpose ? h('p', { class: 'muted small' }, '人生の目的') : null, d.purpose ? h('p', { class: 'pre' }, d.purpose) : null,
    d.goal ? h('p', { class: 'big' }, d.goal) : h('p', null, 'まだ目標がありません。MY GOAL の10ステップから始めましょう。'),
    h('div', { class: 'row' },
      d.finalDue ? chip(`期限 ${d.finalDue}${d.daysLeft !== null ? `（あと${d.daysLeft}日）` : ''}`, d.daysLeft !== null && d.daysLeft < 0 ? 'warn' : '') : null,
      chip(`10ステップ ${d.steps.completed}/10`), d.stage ? chip(`ステージ ${d.stage.position}/${d.stage.total}：${d.stage.title}`, 'gold') : null),
    d.steps.next ? h('div', { class: 'row' }, h('a', { class: 'btn', href: `#/step/${d.steps.next.no}` }, `ステップ${d.steps.next.no}「${d.steps.next.name}」へ`)) : null);
  where.classList.add('accent');
  out.push(where);

  // 今日の最大3ミッション
  const ms = d.missionsToday as any[];
  out.push(card(h('div', { class: 'between' }, h('h2', null, '今日のミッション'), h('a', { href: '#/missions', class: 'small' }, 'すべて見る')),
    ms.length ? h('ul', { class: 'list' }, ...ms.map((m) => h('li', null,
      h('div', { class: 'between' }, h('a', { href: `#/missions`, class: 'h3' }, m.title), statusChip(m.status)),
      h('div', { class: 'row' }, m.picked ? chip('今日やる', 'gold') : chip('おすすめ'), m.dueOn ? chip(`期限 ${m.dueOn}`, m.overdue ? 'warn' : '') : null,
        m.verifyMode === 'reviewer' ? chip('確認が必要') : chip('自己確認', 'gray'))))) : h('p', { class: 'muted' }, '取り組むミッションがありません。'),
    h('p', { class: 'muted small' }, 'おすすめは「目標への寄与・期限・KPI不足・所要時間」から自動で計算しています（AIは使っていません）。'),
    h('div', { class: 'row' }, h('a', { class: 'btn sub', href: '#/missions' }, 'ミッションを追加・記録'))));

  // 前進の実感
  const p = d.progress, xp = d.xp;
  const ratio = xp.nextAt ? (xp.current - xp.levelBase) / (xp.nextAt - xp.levelBase) : 1;
  out.push(card(h('h2', null, '前進'),
    h('div', { class: 'grid2' },
      h('div', { class: 'stat' }, h('span', { class: 'muted small' }, '今日の記録'), h('b', null, `${p.today}件`), h('span', { class: 'muted small' }, `昨日 ${p.yesterday}件`)),
      h('div', { class: 'stat' }, h('span', { class: 'muted small' }, '今週の記録'), h('b', null, `${p.thisWeek}件`), h('span', { class: 'muted small' }, `先週 ${p.lastWeek}件`)),
      h('div', { class: 'stat' }, h('span', { class: 'muted small' }, '今週の確認済み'), h('b', null, `${p.verifiedThisWeek}件`)),
      h('div', { class: 'stat' }, h('span', { class: 'muted small' }, 'レベル'), h('b', null, `Lv.${xp.level}`), h('span', { class: 'muted small' }, `今日 +${xp.today} XP`))),
    h('p', { class: 'muted small' }, xp.nextAt ? `次のレベルまで ${xp.toNext} XP（累計 ${xp.current} XP）` : `累計 ${xp.current} XP`), bar(ratio),
    p.overdue ? h('p', { class: 'err' }, `期限を過ぎたミッションが${p.overdue}件あります。`) : null));

  // ルールによる提案
  if (d.tips.length) out.push(card(h('h2', null, '次の一手（自動提案）'), h('ul', { class: 'list' }, ...d.tips.map((t: string) => h('li', null, t)))));

  out.push(card(h('h2', null, '振り返りと相談'),
    h('p', null, d.review.submitted ? `今週（${d.review.weekKey}）の週次レビューは提出済みです。` : `今週（${d.review.weekKey}）の週次レビューはまだです。`),
    h('div', { class: 'row' }, h('a', { class: 'btn sub', href: '#/review' }, '週次レビュー'), h('a', { class: 'btn sub', href: '#/coach' }, 'ChatGPTに相談'), h('a', { class: 'btn sub', href: '#/map' }, 'LIFE MAP'))));
  return out;
}
