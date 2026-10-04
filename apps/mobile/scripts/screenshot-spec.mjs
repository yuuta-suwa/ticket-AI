const spec = [
  ['01-home', 'Home: Hero search + EXTREME DEAL + BUY NOW'], ['02-search', 'Search form'], ['03-extreme-deal', 'Deal detail with EXTREME DEAL + reasons + chart'],
  ['04-price-forecast', 'Price forecast (Premium unlocked build for this shot)'], ['05b-buy-now-confirmed', 'BUY NOW after latest-price confirmation'], ['06-watchlist', 'Watchlist'],
];
console.log('Required sizes — iOS 6.7" 1290x2796 (also reused for 6.5"/5.5" by Apple scaling); Android phone 1080x1920+ (16:9–9:16).');
console.log('Generate: EXPO_PUBLIC_DEMO_MODE=true EXPO_PUBLIC_APP_ENV=preview expo export --platform web --output-dir dist-demo && node scripts/capture-screenshots.mjs dist-demo ../../store-assets/screenshots');
for (const [f, d] of spec) console.log(` ${f}.png  ${d}`);
