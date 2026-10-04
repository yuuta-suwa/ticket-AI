import { Redirect } from 'expo-router';
import { useApp } from '../src/providers/AppProvider';
export default function Index() { const { session } = useApp(); return <Redirect href={session ? '/(tabs)' : '/(auth)/login'} />; }
