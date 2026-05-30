import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  BackHandler,
  AppState,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { JamStackParamList } from '../navigation/JamStackNavigator';
import { useAuth } from '../contexts/AuthContext';
import { useSession } from '../hooks/useSession';
import { useQueue } from '../hooks/useQueue';
import { useParticipants } from '../hooks/useParticipants';
import { joinSession, leaveSession, endSession } from '../lib/session';
import { API_BASE } from '../constants/config';
import { getAccessToken } from '../lib/auth';
import { colors, spacing, typography, radius } from '../constants/theme';
import InviteBadge from '../components/InviteBadge';
import QueueList from '../components/QueueList';
import ParticipantsList from '../components/ParticipantsList';
import QueueCard from '../components/QueueCard';
import NowPlaying from '../components/NowPlaying';

type Props = NativeStackScreenProps<JamStackParamList, 'JamRoom'>;

export default function JamRoomScreen({ route, navigation }: Props) {
  const { code } = route.params;
  const { user, profile } = useAuth();
  const { session, loading: sessionLoading, setSession } = useSession(code);
  const { items: queueItems, refresh: refreshQueue, addItem } = useQueue(session?.id ?? null);
  const { participants } = useParticipants(session?.id ?? null);
  const joinedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);

  // Keep sessionIdRef current for the unmount cleanup
  useEffect(() => { sessionIdRef.current = session?.id ?? null; }, [session?.id]);

  // Join on load (once per session)
  useEffect(() => {
    if (!session?.id || !user?.id || joinedRef.current) return;
    joinedRef.current = true;
    joinSession(session.id).catch(() => {});
  }, [session?.id, user?.id]);

  // Leave on unmount
  useEffect(() => {
    return () => {
      if (sessionIdRef.current) {
        leaveSession(sessionIdRef.current).catch(() => {});
      }
    };
  }, []);

  // 30-second heartbeat
  useEffect(() => {
    if (!session?.id) return;
    const id = setInterval(async () => {
      const token = await getAccessToken();
      fetch(`${API_BASE}/api/sessions/${session.id}/heartbeat`, {
        method: 'POST',
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }).catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [session?.id]);

  // Leave session when app goes background (best-effort; won't fire on hard kill)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' && sessionIdRef.current) {
        leaveSession(sessionIdRef.current).catch(() => {});
        joinedRef.current = false;
      }
    });
    return () => sub.remove();
  }, []);

  const handleEndSession = useCallback(async () => {
    Alert.alert('End Session', 'End this jam for everyone?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End',
        style: 'destructive',
        onPress: async () => {
          try {
            await endSession(session!.id);
            navigation.replace('JamLobby');
          } catch (e: unknown) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
          }
        },
      },
    ]);
  }, [session, navigation]);

  useFocusEffect(
    React.useCallback(() => {
      const onBack = () => {
        Alert.alert(
          'Leave Session?',
          'You will be removed from the jam session.',
          [
            { text: 'Stay', style: 'cancel', onPress: () => {} },
            { text: 'Leave', style: 'destructive', onPress: () => navigation.replace('JamLobby') },
          ],
        );
        return true; // prevent default back action
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation]),
  );

  if (sessionLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Session not found.</Text>
        <Pressable style={styles.btn} onPress={() => navigation.replace('JamLobby')}>
          <Text style={styles.btnText}>← Back</Text>
        </Pressable>
      </View>
    );
  }

  if (session.status === 'ended') {
    const played = queueItems.filter((i) =>
      (i.status as string) === 'played' ||
      (i.status as string) === 'playing' ||
      (i.status as string) === 'skipped',
    );
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading}>Session ended</Text>
          <Text style={styles.muted}>
            {played.length} song{played.length !== 1 ? 's' : ''} played
          </Text>
          <Pressable style={styles.btn} onPress={() => navigation.replace('JamLobby')}>
            <Text style={styles.btnText}>← Back</Text>
          </Pressable>
          {played.map((item) => <QueueCard key={item.id} item={item} />)}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const nowPlaying = queueItems.find((i) => i.status === 'playing') ?? null;
  const isDJ = session.dj_user_id === user?.id;
  const isHost = session.host_user_id === user?.id;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.heading}>Jam Session</Text>
          <View style={styles.headerActions}>
            <InviteBadge code={session.invite_code} />
            {isHost && (
              <Pressable style={styles.dangerBtn} onPress={handleEndSession}>
                <Text style={styles.dangerBtnText}>End</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Now Playing */}
        <NowPlaying
          nowPlaying={nowPlaying}
          sessionId={session.id}
          isDJ={isDJ}
          preferredPlatform={profile?.preferred_platform}
          participantCount={participants.length}
          userId={user?.id ?? ''}
          onQueueChange={refreshQueue}
          repeatMode={(session.repeat_mode ?? 'none') as 'none' | 'song' | 'queue'}
          onRepeatModeChange={mode => setSession(prev => prev ? { ...prev, repeat_mode: mode } : prev)}
        />

        {/* Queue */}
        <QueueList
          items={queueItems}
          sessionId={session.id}
          repeatMode={(session.repeat_mode ?? 'none') as 'none' | 'song' | 'queue'}
          onAdded={(item) => { addItem(item); refreshQueue(); }}
        />

        {/* Participants */}
        {user && (
          <ParticipantsList
            participants={participants}
            session={session}
            currentUserId={user.id}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  content: { padding: spacing.md, gap: spacing.lg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  heading: { color: colors.text, fontSize: typography.heading, fontWeight: '700' },
  btn: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  btnText: { color: colors.text, fontSize: typography.body },
  dangerBtn: {
    backgroundColor: '#e74c3c22',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#e74c3c',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  dangerBtnText: { color: colors.danger, fontSize: typography.small, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: typography.body, textAlign: 'center' },
});
