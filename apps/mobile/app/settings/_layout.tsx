import { Stack } from 'expo-router';
export default function SettingsLayout() { return <Stack screenOptions={{ headerShown: true }}><Stack.Screen name="notifications" options={{ title: 'Notification settings' }} /><Stack.Screen name="delete-account" options={{ title: 'Delete account' }} /></Stack>; }
