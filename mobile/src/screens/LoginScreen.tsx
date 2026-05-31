import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGoogleSignIn } from '../hooks/useAuth';
import { colors, spacing, typography, radius } from '../constants/theme';

export default function LoginScreen() {
  const { signIn, ready } = useGoogleSignIn();
  const [loading, setLoading] = React.useState(false);

  async function handleSignIn() {
    setLoading(true);
    try {
      await signIn();
    } catch (e: unknown) {
      Alert.alert('Sign in failed', e instanceof Error ? e.message : 'Please try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>MusicOne</Text>
        <Text style={styles.sub}>Sign in to create and join jam sessions</Text>

        <Pressable
          style={[styles.googleBtn, (!ready || loading) && styles.btnDisabled]}
          onPress={handleSignIn}
          disabled={!ready || loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.googleBtnText}>Sign in with Google</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.lg },
  title: { color: colors.text, fontSize: typography.title, fontWeight: '800', letterSpacing: -0.5 },
  sub: { color: colors.textMuted, fontSize: typography.body, textAlign: 'center' },
  googleBtn: { backgroundColor: '#ffffff', borderRadius: radius.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, minWidth: 220, alignItems: 'center' },
  googleBtnText: { color: '#1a1a1a', fontWeight: '700', fontSize: typography.body },
  btnDisabled: { opacity: 0.5 },
});
