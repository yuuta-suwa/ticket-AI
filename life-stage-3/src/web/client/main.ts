import { api, card, h, load } from './dom.ts';
import { homeView } from './views/home.ts';
import { goalView, stepEditor } from './views/goal.ts';
import { mapView } from './views/map.ts';
import { missionsView } from './views/missions.ts';
import { reviewView } from './views/review.ts';
import { coachView } from './views/coach.ts';
import { myPageView } from './views/mypage.ts';
import { adminView } from './views/admin.ts';
import { comingSoon } from './views/soon.ts';

export interface Me { email: string; displayName: string; status: string; isAdmin: boolean }
const app = document.getElementById('app')!;
const view = document.getElementById('view')!;
const tabs = document.getElementById('tabs')!;
const topRight = document.getElementById('top-right')!;
const SIGNIN = app.dataset.signin ?? '/signin-with-chatgpt';
const SIGNOUT = app.dataset.signout ?? '/signout-with-chatgpt';

const TABS = [
  { key: 'home', label: 'HOME', icon: '⌂' }, { key: 'goal', label: 'MY GOAL', icon: '◎' }, { key: 'projects', label: 'PROJECTS', icon: '▦' },
  { key: 'community', label: 'COMMUNITY', icon: '◇' }, { key: 'mypage', label: 'MY PAGE', icon: '◯' },
];
// 各画面がどのタブに属するか（TEAM等は関連画面から遷移する仕様）
const TAB_OF: Record<string, string> = { home: 'home', missions: 'home', review: 'home', coach: 'home', goal: 'goal', step: 'goal', map: 'goal',
  projects: 'projects', community: 'community', mypage: 'mypage', admin: 'mypage' };

function renderTabs(current: string) {
  tabs.replaceChildren(...TABS.map((t) => h('a', { href: `#/${t.key}`, 'aria-current': TAB_OF[current] === t.key ? 'page' : false }, h('i', { 'aria-hidden': 'true' }, t.icon), t.label)));
}

let me: Me | null = null;

async function route() {
  if (!me) return;
  const parts = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  const name = parts[0] ?? 'home';
  renderTabs(name);
  window.scrollTo(0, 0);
  const m = me;
  switch (name) {
    case 'home': return load(view, () => homeView());
    case 'goal': return load(view, () => goalView());
    case 'step': return load(view, () => stepEditor(Number(parts[1])));
    case 'map': return load(view, () => mapView());
    case 'missions': return load(view, () => missionsView(parts[1] === 'all'));
    case 'review': return load(view, () => reviewView());
    case 'coach': return load(view, () => coachView());
    case 'projects': return load(view, async () => comingSoon('PROJECTS', '5つの事業プロジェクト（不動産・通信・訪問販売・人材育成・事業創造）の募集・応募・活動記録・成果確認は、案件ごとの契約条件と法務確認が整い次第ここで開始します。'));
    case 'community': return load(view, async () => comingSoon('COMMUNITY', 'イベント・勉強会の申込、交流投稿、チーム、メンタリングはこのタブから利用できるようになります。'));
    case 'mypage': return load(view, () => myPageView(m));
    case 'admin': return m.isAdmin ? load(view, () => adminView(parts[1] ?? 'members')) : load(view, async () => card(h('p', { class: 'err' }, 'この画面の権限がありません。')));
    default: location.hash = '#/home';
  }
}

async function boot() {
  try {
    const r = await api<{ signedIn: boolean; member?: Me }>('/api/me');
    if (!r.signedIn || !r.member) {
      view.replaceChildren(card(h('h2', null, 'ようこそ'), h('p', { class: 'big' }, '人生を、自分の手で創造する。'),
        h('p', null, '会員の方はChatGPTアカウントでサインインしてください。'), h('div', { class: 'row' }, h('a', { class: 'btn', href: SIGNIN }, 'Sign in with ChatGPT'))));
      return;
    }
    me = r.member;
    topRight.replaceChildren(h('a', { href: SIGNOUT }, 'サインアウト'));
    if (me.status === 'pending') {
      view.replaceChildren(card(h('h2', null, '承認待ち'), h('p', null, '会員登録を受け付けました。運営の承認後にご利用いただけます。'), h('p', { class: 'muted' }, me.email)));
      return;
    }
    if (me.status !== 'active') {
      view.replaceChildren(card(h('h2', null, 'ご利用いただけません'), h('p', null, 'このアカウントは現在ご利用いただけません。運営までお問い合わせください。')));
      return;
    }
    tabs.hidden = false;
    window.addEventListener('hashchange', route);
    await route();
  } catch {
    const retry = h('button', { type: 'button', class: 'sub' }, '再試行');
    retry.addEventListener('click', boot);
    view.replaceChildren(card(h('p', { class: 'err' }, '読み込みに失敗しました。'), h('div', { class: 'row' }, retry)));
  }
}

export const getMe = () => me;
boot();
