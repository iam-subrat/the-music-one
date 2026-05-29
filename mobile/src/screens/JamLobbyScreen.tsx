import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { createSession, getSessionByCode } from '../lib/session';
import { colors, spacing, typography, radius } from '../constants/theme';
import { JamStackParamList } from '../navigation/JamStackNavigator';
import { useAuth } from '../contexts/AuthContext';

type Nav = NativeStackNavigationProp<JamStackParamList, 'JamLobby'>;

export default function JamLobbyScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [starting, setStarting] = useState(false);

  async function handleStart() {
    if (!user) return navigation.navigate('Login' as never);
    setStarting(true);
    try {
      const session = await createSession();
      navigation.replace('JamRoom', { code: session.invite_code });
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create session');
    } finally {
      setStarting(false);
    }
  }

  async function handleJoin() {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    if (!user) return navigation.navigate('Login' as never);
    setJoining(true);
    try {
      const session = await getSessionByCode(trimmed);
      if (!session) throw new Error('Session not found');
      navigation.replace('JamRoom', { code: trimmed });
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not join session');
    } finally {
      setJoining(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.container}>
        <Text style={styles.title}>Jam Session</Text>
        <Text style={styles.sub}>Listen together in real time</Text>

        <Pressable
          style={[styles.btn, styles.primaryBtn, starting && styles.btnDisabled]}
          onPress={handleStart}
          disabled={starting}
        >
          {starting ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={[styles.btnText, styles.primaryBtnText]}>🎵 Start a Jam</Text>
          )}
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or join with a code</Text>
          <View style={styles.dividerLine} />
        </View>

        <TextInput
          style={styles.codeInput}
          value={code}
          onChangeText={v => setCode(v.toUpperCase())}
          placeholder="Enter invite code…"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="join"
          onSubmitEditing={handleJoin}
        />

        <Pressable
          style={[styles.btn, styles.ghostBtn, (joining || !code.trim()) && styles.btnDisabled]}
          onPress={handleJoin}
          disabled={joining || !code.trim()}
        >
          {joining ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={[styles.btnText, styles.ghostBtnText]}>Join Session</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.md },
  title: { color: colors.text, fontSize: typography.title, fontWeight: '800', textAlign: 'center' },
  sub: { color: colors.textMuted, fontSize: typography.body, textAlign: 'center', marginBottom: spacing.md },
  btn: { borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  primaryBtn: { backgroundColor: colors.primary },
  primaryBtnText: { color: colors.background, fontWeight: '700', fontSize: typography.body },
  ghostBtn: { borderWidth: 1, borderColor: colors.border },
  ghostBtnText: { color: colors.text, fontSize: typography.body },
  btnText: {},
  btnDisabled: { opacity: 0.5 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { color: colors.textMuted, fontSize: typography.small },
  codeInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: typography.heading,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    textAlign: 'center',
    letterSpacing: 4,
    fontWeight: '700',
  },
});
