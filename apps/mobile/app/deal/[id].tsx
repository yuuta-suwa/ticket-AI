import React, { useEffect, useState } from 'react';
import { Share, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import type { Deal, PricePoint, RevalidationResult } from '@dealhunter/types';
import { needsRevalidation } from '@dealhunter/core';
import { ApiError, type AiExplanation } from '@dealhunter/api-client';
import { Body, Button, Card, DecisionBadge, ErrorState, H1, H2, LevelBadge, Loading, Screen, Small, success } from '../../src/ui/kit';
import { PriceChart } from '../../src/ui/PriceChart';
import { useApp } from '../../src/providers/AppProvider';
import { recallDeal, rememberDeals } from '../../src/lib/dealStore';
import { openExternal } from '../../src/lib/links';
import { ago, dateOf, duration, money, pct, REASON_TEXT, timeOf } from '../../src/lib/format';
import { type, usePalette } from '../../src/theme';

const Row = ({ k, v }: { k: string; v: string }) => { const c = usePalette(); return <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}><Small>{k}</Small><Text style={{ color: c.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{v}</Text></View>; };

export default function DealDetail() {
  const { id } = useLocalSearchParams<{ id: string }>(); const router = useRouter();
  const { api, entitlements, analytics } = useApp(); const c = usePalette();
  const [deal, setDeal] = useState<Deal | null>(() => recallDeal(String(id)) ?? null);
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [loadErr, setLoadErr] = useState(false);
  const [reval, setReval] = useState<RevalidationResult | null>(null);
  const [revalBusy, setRevalBusy] = useState(false); const [revalErr, setRevalErr] = useState<string | null>(null);
  const [expl, setExpl] = useState<AiExplanation | null>(null); const [explBusy, setExplBusy] = useState(false);
  const [watched, setWatched] = useState(false); const [watchMsg, setWatchMsg] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const d = deal ?? (await api.getDeal(String(id)));
        if (off) return;
        if (!d) { setLoadErr(true); return; }
        rememberDeals([d]); setDeal(d);
        analytics.track('deal_opened', { level: d.analysis.anomaly.level });
        if (d.analysis.decision.decision === 'BUY') analytics.track('buy_signal_viewed');
        setHistory(await api.getPriceHistory(d.offer.flightIdentity));
      } catch { if (!off) setLoadErr(true); }
    })();
    return () => { off = true; };
  }, [id]);

  if (loadErr) return <Screen><ErrorState message="This deal could not be loaded. It may have expired." onRetry={() => router.back()} /></Screen>;
  if (!deal) return <Screen><Loading /></Screen>;

  const { offer: o, analysis: a } = deal;
  const shown = reval?.deal ?? deal; const so = shown.offer, sa = shown.analysis;
  const stale = needsRevalidation(o);
  const locked = !entitlements.advancedForecast || sa.forecast.redacted;
  const chartHistory = entitlements.detailedCharts ? history : history.slice(-30);

  const revalidate = async () => {
    setRevalBusy(true); setRevalErr(null); analytics.track('revalidate_started');
    try { const r = await api.revalidateOffer(o); setReval(r); if (r.canProceed) { analytics.track('revalidate_success'); success(); if (r.deal) rememberDeals([r.deal]); } }
    catch (e) { setRevalErr(e instanceof ApiError && e.code === 'RATE_LIMITED' ? 'Please wait a moment before checking again.' : 'Could not confirm the latest price. Please try again.'); }
    finally { setRevalBusy(false); }
  };
  const proceed = async () => { if (!reval?.canProceed || !reval.deal) return; analytics.track('purchase_out_click'); await openExternal(reval.deal.offer.deepLink); };
  const watch = async () => {
    try { await api.addToWatchlist({ offer: o, targetPrice: null }); setWatched(true); analytics.track('watch_added'); success(); setWatchMsg('Added to your watchlist.'); }
    catch (e) { if (e instanceof ApiError && e.code === 'LIMIT_REACHED') setWatchMsg('Your watchlist is full on this plan.'); else setWatchMsg('Could not add to watchlist.'); }
  };
  const explain = async () => { setExplBusy(true); try { setExpl(await api.explainDeal(o.id, a)); } catch { setExpl({ text: 'Explanation unavailable right now.', cached: false, generatedAt: new Date().toISOString() }); } finally { setExplBusy(false); } };
  const share = () => Share.share({ message: `${o.origin} → ${o.destination} from ${money(o.price.amount, o.price.currency)} — found with DEAL HUNTER AI. Prices change; verify before booking.` });

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ headerShown: true, title: `${o.origin} → ${o.destination}`, headerRight: () => <Ionicons name="share-outline" size={24} color={c.text} accessibilityLabel="Share" onPress={share} /> }} />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><DecisionBadge decision={sa.decision.decision} size="lg" /><LevelBadge level={sa.anomaly.level} /></View>
      <View><Text style={[type.price, { color: c.text, fontSize: 34 }]} accessibilityLabel={`Current price ${money(so.price.amount, so.price.currency)}`}>{money(so.price.amount, so.price.currency)}</Text>
        <Body muted>Typical {money(sa.anomaly.referencePrice, so.price.currency)} · {sa.anomaly.discountPct > 0 ? `${pct(sa.anomaly.discountPct)} below` : 'at or above'} typical</Body></View>

      {reval && reval.status !== 'UNCHANGED' ? (
        <Card style={{ backgroundColor: reval.status === 'UNAVAILABLE' || reval.status === 'ERROR' ? c.extremeBg : c.warnBg }}>
          <Body>{reval.message}</Body>
          {reval.status === 'PRICE_CHANGED' && reval.currentPrice !== null ? <Body>{money(reval.previousPrice, so.price.currency)} → {money(reval.currentPrice, so.price.currency)} ({(reval.deltaPct ?? 0) > 0 ? '+' : ''}{pct(reval.deltaPct ?? 0, 1)})</Body> : null}
        </Card>
      ) : null}
      {reval?.status === 'UNCHANGED' ? <Card style={{ backgroundColor: c.buyBg }}><Body>✓ Price confirmed just now.</Body></Card> : null}

      <Card>
        <H2>Why {sa.decision.decision}?</H2>
        {sa.decision.reasons.length ? sa.decision.reasons.map((r) => <View key={r} style={{ flexDirection: 'row', gap: 8 }}><Ionicons name="ellipse" size={8} color={c.accent} style={{ marginTop: 7 }} /><Body>{REASON_TEXT[r] ?? r}</Body></View>) : <Body muted>No strong signals either way.</Body>}
        <Small>Buy score {sa.decision.buyScore}/100 · Model confidence {pct(sa.decision.confidence)} · Deal score {Math.round(sa.anomaly.score)}/100</Small>
        {expl ? <Body>{expl.text}</Body> : <Button title="Explain in plain language" variant="ghost" icon="sparkles-outline" loading={explBusy} onPress={explain} />}
      </Card>

      <Card>
        <H2>Price history</H2>
        <PriceChart history={chartHistory} current={so.price.amount} reference={sa.anomaly.referencePrice} currency={so.price.currency} />
        {!entitlements.detailedCharts ? <Small>Showing the last 30 observations. Premium unlocks the full history.</Small> : null}
      </Card>

      <Card>
        <H2>Price forecast</H2>
        {locked ? (
          <>
            <Body muted>Advanced forecast (probability of a drop or rise, expected price range) is part of Premium.</Body>
            <Button title="Unlock with Premium" variant="secondary" icon="lock-closed-outline" onPress={() => { analytics.track('paywall_viewed', { from: 'forecast' }); router.push('/paywall'); }} />
          </>
        ) : (
          <>
            <Row k="Likely to fall" v={pct(sa.forecast.downProbability)} /><Row k="Likely flat" v={pct(sa.forecast.flatProbability)} /><Row k="Likely to rise" v={pct(sa.forecast.upProbability)} />
            <Row k="Chance this fare disappears" v={pct(sa.forecast.disappearanceRisk)} />
            <Row k="7-day range" v={`${money(sa.forecast.forecastLow, so.price.currency)} – ${money(sa.forecast.forecastHigh, so.price.currency)}`} />
            <Row k="Median outlook" v={money(sa.forecast.forecastMedian, so.price.currency)} />
            <Small>Statistical model {sa.forecast.modelVersion}. Forecasts are estimates, not guarantees.</Small>
          </>
        )}
      </Card>

      <Card>
        <H2>Flight</H2>
        <Row k="Airline" v={so.carrierName} /><Row k="Departure" v={`${dateOf(so.departureAt)} ${timeOf(so.departureAt)}`} /><Row k="Arrival" v={timeOf(so.arrivalAt)} />
        <Row k="Duration" v={`${duration(so.durationMinutes)} · ${so.stops === 0 ? 'Nonstop' : `${so.stops} stop`}`} /><Row k="Cabin" v={so.cabin.replace('_', ' ')} />
        <Row k="Source" v={so.provider} /><Row k="Last updated" v={ago(new Date(so.capturedAt).getTime())} />
      </Card>

      <View style={{ gap: 10 }}>
        {!reval?.canProceed ? <Button title="Check latest price" icon="refresh" loading={revalBusy} onPress={revalidate} /> : <Button title="Continue to the seller" icon="open-outline" onPress={proceed} />}
        {stale && !reval ? <Small>This price may be out of date. We'll re-check it before you go to the seller.</Small> : null}
        {revalErr ? <Small style={{ color: c.danger }}>{revalErr}</Small> : null}
        {reval?.canProceed ? <Small>You'll leave DEAL HUNTER AI. The seller sets the final price and conditions; we don't sell or issue tickets.</Small> : null}
        <Button title={watched ? 'On your watchlist' : 'Add to watchlist'} variant="secondary" icon={watched ? 'checkmark' : 'eye-outline'} disabled={watched} onPress={watch} />
        {watchMsg ? <Small>{watchMsg}</Small> : null}
      </View>
      <H1> </H1>
    </Screen>
  );
}
