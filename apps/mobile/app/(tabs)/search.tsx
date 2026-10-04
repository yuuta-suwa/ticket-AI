import React, { useEffect, useState } from 'react';
import { Platform, Switch, Text, TextInput, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { CabinClass, Deal, FlightSearchParams, TripType } from '@dealhunter/types';
import { Body, Button, Card, Chip, ErrorState, H1, H2, Screen, Small } from '../../src/ui/kit';
import { DealCard } from '../../src/ui/DealCard';
import { AdSlot } from '../../src/ui/AdSlot';
import { useApp } from '../../src/providers/AppProvider';
import { rememberDeals } from '../../src/lib/dealStore';
import { radius, space, usePalette } from '../../src/theme';
import { ApiError } from '@dealhunter/api-client';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (n: number) => new Date(Date.now() + n * 86_400_000);
const CABINS: [CabinClass, string][] = [['ECONOMY', 'Economy'], ['PREMIUM_ECONOMY', 'Premium Eco'], ['BUSINESS', 'Business'], ['FIRST', 'First']];

function DateField({ label, value, onChange, min }: { label: string; value: Date; onChange: (d: Date) => void; min: Date }) {
  const c = usePalette(); const [show, setShow] = useState(Platform.OS === 'ios');
  const handle = (_: DateTimePickerEvent, d?: Date) => { if (Platform.OS === 'android') setShow(false); if (d) onChange(d); };
  return (
    <View style={{ gap: 4, flex: 1 }}>
      <Small>{label}</Small>
      {Platform.OS === 'android' ? <Button title={iso(value)} variant="secondary" onPress={() => setShow(true)} /> : null}
      {show ? <DateTimePicker value={value} mode="date" minimumDate={min} onChange={handle} accentColor={c.accent} /> : null}
    </View>
  );
}

export default function Search() {
  const { api, analytics } = useApp(); const router = useRouter(); const c = usePalette();
  const params = useLocalSearchParams<{ origin?: string; destination?: string }>();
  const [origin, setOrigin] = useState('NRT'); const [destination, setDestination] = useState('HNL');
  const [dep, setDep] = useState(plus(45)); const [ret, setRet] = useState(plus(52));
  const [trip, setTrip] = useState<TripType>('ROUND_TRIP'); const [pax, setPax] = useState(1);
  const [cabin, setCabin] = useState<CabinClass>('ECONOMY'); const [currency, setCurrency] = useState('USD'); const [flex, setFlex] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [results, setResults] = useState<Deal[] | null>(null);
  useEffect(() => { if (params.origin) setOrigin(params.origin); if (params.destination) setDestination(params.destination); }, [params.origin, params.destination]);

  const input = { backgroundColor: c.surface, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: radius.md, padding: space.md, fontSize: 18, fontWeight: '700', textAlign: 'center' } as const;
  const valid = /^[A-Z]{3}$/.test(origin) && /^[A-Z]{3}$/.test(destination) && origin !== destination;

  const search = async () => {
    setBusy(true); setErr(null); analytics.track('search_started', { cabin, trip });
    const p: FlightSearchParams = { origin, destination, departureDate: iso(dep), returnDate: trip === 'ROUND_TRIP' ? iso(ret) : undefined, tripType: trip, passengers: pax, cabin, currency, flexibleDates: flex };
    try { const r = await api.searchFlights(p); rememberDeals(r); setResults(r); analytics.track('search_completed', { results: r.length }); }
    catch (e) { setErr(e instanceof ApiError && e.code === 'RATE_LIMITED' ? 'You are searching too quickly. Please wait a moment.' : 'Search is unavailable right now. Please try again.'); }
    finally { setBusy(false); }
  };

  return (
    <Screen>
      <H1>Search flights</H1>
      <Card>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <View style={{ flex: 1, gap: 4 }}><Small>From (IATA)</Small><TextInput accessibilityLabel="Origin airport code" style={input} value={origin} onChangeText={(v) => setOrigin(v.toUpperCase().slice(0, 3))} autoCapitalize="characters" maxLength={3} /></View>
          <View style={{ flex: 1, gap: 4 }}><Small>To (IATA)</Small><TextInput accessibilityLabel="Destination airport code" style={input} value={destination} onChangeText={(v) => setDestination(v.toUpperCase().slice(0, 3))} autoCapitalize="characters" maxLength={3} /></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}><Chip label="Round trip" selected={trip === 'ROUND_TRIP'} onPress={() => setTrip('ROUND_TRIP')} /><Chip label="One way" selected={trip === 'ONE_WAY'} onPress={() => setTrip('ONE_WAY')} /></View>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <DateField label="Departure" value={dep} onChange={setDep} min={new Date()} />
          {trip === 'ROUND_TRIP' ? <DateField label="Return" value={ret} onChange={setRet} min={dep} /> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Body>Passengers</Body>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Chip label="−" onPress={() => setPax(Math.max(1, pax - 1))} /><Text accessibilityLabel={`${pax} passengers`} style={{ color: c.text, fontSize: 18, fontWeight: '700', minWidth: 20, textAlign: 'center' }}>{pax}</Text><Chip label="+" onPress={() => setPax(Math.min(9, pax + 1))} /></View>
        </View>
        <Small>Cabin</Small>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{CABINS.map(([k, l]) => <Chip key={k} label={l} selected={cabin === k} onPress={() => setCabin(k)} />)}</View>
        <Small>Currency</Small>
        <View style={{ flexDirection: 'row', gap: 8 }}>{['USD', 'JPY', 'EUR', 'GBP'].map((k) => <Chip key={k} label={k} selected={currency === k} onPress={() => setCurrency(k)} />)}</View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Body>Flexible dates (±1 day)</Body><Switch accessibilityLabel="Flexible dates" value={flex} onValueChange={setFlex} trackColor={{ true: c.accent }} /></View>
        <Button title="Search" icon="search" disabled={!valid} loading={busy} onPress={search} />
      </Card>
      {err ? <ErrorState message={err} onRetry={search} /> : null}
      {results ? (
        <View style={{ gap: 12 }}>
          <H2>{results.length} results</H2>
          <AdSlot placement="SEARCH_RESULTS" />
          {results.map((d) => <DealCard key={d.offer.id} deal={d} onPress={() => router.push({ pathname: '/deal/[id]', params: { id: d.offer.id } })} />)}
          <Small>Prices shown are the latest we captured and may have changed. You'll be asked to confirm the current price before heading to a seller.</Small>
        </View>
      ) : null}
    </Screen>
  );
}
