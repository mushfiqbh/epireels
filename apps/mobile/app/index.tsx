import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import type { HealthSnapshot } from '@epireels/types';

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Platform.OS === 'android'
    ? 'http://10.0.2.2:4000'
    : 'http://localhost:4000');

export default function Home() {
  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/health`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as HealthSnapshot;
        if (!cancelled) setHealth(json);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: '#0f0f0f' }}
      contentContainerStyle={{
        padding: 24,
        gap: 16,
        alignItems: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize: 32, fontWeight: '600' }}>
        Acme Mobile
      </Text>
      <Text style={{ color: '#aaa', textAlign: 'center' }}>
        React Native (Expo) — edit <Text style={{ fontFamily: 'monospace' }}>app/index.tsx</Text> to start.
      </Text>

      <View
        style={{
          width: '100%',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: '#272727',
          padding: 16,
          gap: 8,
        }}
      >
        <Text
          style={{
            color: '#888',
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          API health
        </Text>
        {!health && !error && <ActivityIndicator color="#fff" />}
        {error && (
          <Text style={{ color: '#f59e0b' }}>
            API not reachable at {API_BASE}.{' '}
            {'\n'}Start it with <Text style={{ fontFamily: 'monospace' }}>pnpm dev:api</Text>.
            {'\n'}Error: {error}
          </Text>
        )}
        {health && (
          <Text
            style={{ color: '#fff', fontFamily: 'monospace', fontSize: 12 }}
          >
            {JSON.stringify(health, null, 2)}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
