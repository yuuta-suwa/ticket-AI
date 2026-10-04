import React from 'react';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePalette } from '../../src/theme';

const icon = (name: keyof typeof Ionicons.glyphMap, focused: keyof typeof Ionicons.glyphMap) => ({ color, focused: f, size }: { color: ColorValue; focused: boolean; size: number }) => <Ionicons name={f ? focused : name} size={size} color={color} />;

export default function TabsLayout() {
  const c = usePalette();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: c.accent, tabBarInactiveTintColor: c.textMuted, tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border }, tabBarLabelStyle: { fontSize: 11, fontWeight: '700' } }}>
      <Tabs.Screen name="index" options={{ title: 'HOME', tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen name="search" options={{ title: 'SEARCH', tabBarIcon: icon('search-outline', 'search') }} />
      <Tabs.Screen name="watch" options={{ title: 'WATCH', tabBarIcon: icon('eye-outline', 'eye') }} />
      <Tabs.Screen name="alerts" options={{ title: 'ALERTS', tabBarIcon: icon('notifications-outline', 'notifications') }} />
      <Tabs.Screen name="account" options={{ title: 'ACCOUNT', tabBarIcon: icon('person-circle-outline', 'person-circle') }} />
    </Tabs>
  );
}
