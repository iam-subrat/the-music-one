import React from 'react';
import { View, Text, StyleSheet, Image, Pressable, Alert } from 'react-native';
import { colors, spacing, radius, typography } from '../constants/theme';
import { passDjToken, SessionData } from '../lib/session';

interface Participant {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface Props {
  participants: Participant[];
  session: SessionData;
  currentUserId: string;
}

export default function ParticipantsList({ participants, session, currentUserId }: Props) {
  const isHost = session.host_user_id === currentUserId;
  const isDJ = session.dj_user_id === currentUserId;
  const canPassDJ = isHost || isDJ;

  async function handlePassDJ(userId: string, name: string | null) {
    Alert.alert('Pass DJ', `Make ${name ?? 'this user'} the DJ?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes',
        onPress: async () => {
          try {
            await passDjToken(session.id, userId);
          } catch (e: unknown) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Listeners ({participants.length})</Text>
      {participants.map((p) => {
        const isParticipantDJ = session.dj_user_id === p.id;
        const isSelf = p.id === currentUserId;
        const initial = (p.display_name ?? '?')[0].toUpperCase();
        return (
          <View key={p.id} style={styles.row}>
            {p.avatar_url
              ? <Image source={{ uri: p.avatar_url }} style={styles.avatar} />
              : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarText}>{initial}</Text>
                </View>
              )
            }
            <Text style={styles.name}>
              {p.display_name ?? 'Anonymous'}{isSelf ? ' (you)' : ''}
            </Text>
            {isParticipantDJ && <Text style={styles.djBadge}>DJ 🎧</Text>}
            {canPassDJ && !isParticipantDJ && !isSelf && (
              <Pressable
                style={styles.passDjBtn}
                onPress={() => handlePassDJ(p.id, p.display_name)}
              >
                <Text style={styles.passDjText}>Make DJ</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  label: {
    color: colors.textMuted,
    fontSize: typography.small,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  avatarPlaceholder: {
    backgroundColor: colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: colors.text, fontSize: typography.small, fontWeight: '700' },
  name: { flex: 1, color: colors.text, fontSize: typography.body },
  djBadge: { color: colors.primary, fontSize: typography.small, fontWeight: '700' },
  passDjBtn: {
    borderRadius: radius.sm - 2,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  passDjText: { color: colors.textMuted, fontSize: typography.caption },
});
