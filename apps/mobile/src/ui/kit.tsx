import React from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type ViewStyle, type StyleProp } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Decision, DealLevel } from '@dealhunter/types';
import { radius, space, type, usePalette } from '../theme';
import { LEVEL_TEXT } from '../lib/format';
import { useApp } from '../providers/AppProvider';

export const tap = (): void => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };
export const success = (): void => { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); };

export function Screen({ children, scroll = true, refreshing, onRefresh, edges = ['top'] }: { children: React.ReactNode; scroll?: boolean; refreshing?: boolean; onRefresh?: () => void; edges?: ('top' | 'bottom')[] }) {
  const c = usePalette();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={edges}>
      <OfflineBanner />
      {scroll ? (
        <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 }} refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.accent} /> : undefined} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      ) : <View style={{ flex: 1 }}>{children}</View>}
    </SafeAreaView>
  );
}

export function OfflineBanner() {
  const { online } = useApp(); const c = usePalette();
  if (online) return null;
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: c.warnBg, paddingVertical: 6, paddingHorizontal: space.lg, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <Ionicons name="cloud-offline-outline" size={16} color={c.warnText} />
      <Text style={{ color: c.warnText, ...type.small }}>You're offline. Showing the last saved data.</Text>
    </View>
  );
}

export const H1 = ({ children }: { children: React.ReactNode }) => { const c = usePalette(); return <Text accessibilityRole="header" style={[type.title, { color: c.text }]}>{children}</Text>; };
export const H2 = ({ children }: { children: React.ReactNode }) => { const c = usePalette(); return <Text accessibilityRole="header" style={[type.h2, { color: c.text }]}>{children}</Text>; };
export const Body = ({ children, muted, style }: { children: React.ReactNode; muted?: boolean; style?: StyleProp<ViewStyle> }) => { const c = usePalette(); return <Text style={[type.body, { color: muted ? c.textMuted : c.text }, style as object]}>{children}</Text>; };
export const Small = ({ children, style }: { children: React.ReactNode; style?: object }) => { const c = usePalette(); return <Text style={[type.small, { color: c.textMuted }, style]}>{children}</Text>; };

export function Card({ children, style, onPress, label }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; label?: string }) {
  const c = usePalette();
  const base: ViewStyle = { backgroundColor: c.surface, borderRadius: radius.lg, padding: space.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, gap: space.sm };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { tap(); onPress(); }} style={({ pressed }) => [base, style, pressed && { opacity: 0.85 }]}>{children}</Pressable>;
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, icon }: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; loading?: boolean; disabled?: boolean; icon?: keyof typeof Ionicons.glyphMap }) {
  const c = usePalette();
  const bg = variant === 'primary' ? c.primary : variant === 'danger' ? c.danger : variant === 'secondary' ? c.surfaceAlt : 'transparent';
  const fg = variant === 'primary' ? c.onPrimary : variant === 'danger' ? '#FFFFFF' : c.text;
  const off = disabled || loading;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!off, busy: !!loading }} disabled={off} onPress={() => { tap(); onPress(); }}
      style={({ pressed }) => ({ backgroundColor: bg, minHeight: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: space.lg, opacity: off ? 0.5 : pressed ? 0.85 : 1 })}>
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 16, fontWeight: '700' }}>{title}</Text>
    </Pressable>
  );
}

const DECISION: Record<Decision, { icon: keyof typeof Ionicons.glyphMap; fg: 'buy' | 'wait' | 'watch'; bg: 'buyBg' | 'waitBg' | 'watchBg'; label: string; a11y: string }> = {
  BUY: { icon: 'checkmark-circle', fg: 'buy', bg: 'buyBg', label: 'BUY', a11y: 'Recommendation: buy now' },
  WAIT: { icon: 'time', fg: 'wait', bg: 'waitBg', label: 'WAIT', a11y: 'Recommendation: wait' },
  WATCH: { icon: 'eye', fg: 'watch', bg: 'watchBg', label: 'WATCH', a11y: 'Recommendation: keep watching' },
};
/** Icon + text + colour: the decision is never conveyed by colour alone. */
export function DecisionBadge({ decision, size = 'md' }: { decision: Decision; size?: 'sm' | 'md' | 'lg' }) {
  const c = usePalette(); const d = DECISION[decision]; const fs = size === 'lg' ? 20 : size === 'sm' ? 12 : 14;
  return (
    <View accessible accessibilityLabel={d.a11y} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c[d.bg], paddingHorizontal: size === 'lg' ? 14 : 8, paddingVertical: size === 'lg' ? 8 : 4, borderRadius: radius.pill, alignSelf: 'flex-start' }}>
      <Ionicons name={d.icon} size={fs + 2} color={c[d.fg]} />
      <Text style={{ color: c[d.fg], fontWeight: '800', fontSize: fs, letterSpacing: 0.5 }}>{d.label}</Text>
    </View>
  );
}

export function LevelBadge({ level }: { level: DealLevel }) {
  const c = usePalette();
  if (level === 'NORMAL') return null;
  const extreme = level === 'EXTREME_DEAL';
  return (
    <View accessible accessibilityLabel={LEVEL_TEXT[level] ?? level} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: extreme ? c.extremeBg : c.surfaceAlt, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' }}>
      <Ionicons name={extreme ? 'flame' : 'pricetag'} size={13} color={extreme ? c.extreme : c.text} />
      <Text style={{ color: extreme ? c.extreme : c.text, fontWeight: '800', fontSize: 11, letterSpacing: 0.5 }}>{(LEVEL_TEXT[level] ?? level).toUpperCase()}</Text>
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} onPress={() => { tap(); onPress(); }}
      style={{ paddingHorizontal: 14, minHeight: 40, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: selected ? c.primary : c.surfaceAlt }}>
      <Text style={{ color: selected ? c.onPrimary : c.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const c = usePalette();
  return (
    <Card>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Ionicons name="alert-circle-outline" size={20} color={c.danger} /><Text style={[type.h3, { color: c.text }]}>Something went wrong</Text></View>
      <Body muted>{message}</Body>
      {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} /> : null}
    </Card>
  );
}
export const Loading = () => { const c = usePalette(); return <View style={{ padding: space.xxl, alignItems: 'center' }} accessibilityRole="progressbar"><ActivityIndicator color={c.accent} /></View>; };
export function Skeleton({ h = 90 }: { h?: number }) { const c = usePalette(); return <View style={{ height: h, borderRadius: radius.lg, backgroundColor: c.surfaceAlt }} />; }
export function Empty({ icon, title, text }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }) {
  const c = usePalette();
  return <View style={{ alignItems: 'center', padding: space.xxl, gap: 8 }}><Ionicons name={icon} size={36} color={c.textMuted} /><Text style={[type.h3, { color: c.text }]}>{title}</Text><Text style={[type.body, { color: c.textMuted, textAlign: 'center' }]}>{text}</Text></View>;
}
export function StaleNote({ updatedAt, fromCache }: { updatedAt: number | null; fromCache: boolean }) {
  const { ago } = require('../lib/format') as typeof import('../lib/format');
  if (!updatedAt) return null;
  return <Small>{fromCache ? 'Saved data · ' : ''}Last updated {ago(updatedAt)}</Small>;
}
