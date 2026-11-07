import { card, h } from '../dom.ts';
export function comingSoon(title: string, text: string) {
  return [h('h1', null, title), card(h('h2', null, '準備中'), h('p', null, text), h('p', { class: 'muted' }, 'このタブの機能は、条件が確定し動作確認が終わったものから順に公開します。'))];
}
