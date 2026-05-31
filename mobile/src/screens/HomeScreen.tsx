import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  ActivityIndicator, StyleSheet, Image, Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { colors, spacing, typography, radius } from '../constants/theme';
import PlatformLinksGrid from '../components/PlatformLinksGrid';
import OdesliAttribution from '../components/OdesliAttribution';

interface SongMeta {
  title: string;
  artist: string;
  thumbnailUrl?: string;
  platformLinks: Record<string, string | undefined>;
}

type Status = 'idle' | 'loading' | 'done' | 'error';

export default function HomeScreen() {
  const [inputUrl, setInputUrl] = useState('');
  const [song, setSong] = useState<SongMeta | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function runSearch(url: string) {
    setStatus('loading');
    setSong(null);
    setErrorMsg('');
    try {
      const res = await api(`/song/?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
      const meta: SongMeta = await res.json();
      setSong(meta);
      setStatus('done');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to fetch song info.');
      setStatus('error');
    }
  }

  function handleSubmit() {
    const trimmed = inputUrl.trim();
    if (!trimmed) return;
    runSearch(trimmed);
  }

  function handleReset() {
    setSong(null);
    setStatus('idle');
    setInputUrl('');
  }

  async function handleShare() {
    if (!song) return;
    try {
      await Share.share({ message: `${song.title} by ${song.artist}\nFind it on all platforms: ${inputUrl}` });
    } catch { /* user cancelled */ }
  }

  // Clipboard import retained for future paste-from-clipboard feature
  void Clipboard;

  const searchQuery = song ? `${song.title} ${song.artist}` : '';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>MusicOne</Text>
          <Text style={styles.heroSub}>Paste any streaming link — listen on every platform</Text>
        </View>

        {status !== 'done' && (
          <View style={styles.searchRow}>
            <TextInput
              style={styles.input}
              value={inputUrl}
              onChangeText={setInputUrl}
              placeholder="Spotify, YouTube Music, Apple Music…"
              placeholderTextColor={colors.textMuted}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleSubmit}
            />
            <Pressable style={styles.searchBtn} onPress={handleSubmit}>
              <Text style={styles.searchBtnText}>Find</Text>
            </Pressable>
          </View>
        )}

        {status === 'loading' && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.mutedText}>Looking up song…</Text>
          </View>
        )}

        {status === 'error' && (
          <View style={styles.center}>
            <Text style={styles.errorText}>{errorMsg}</Text>
            <Pressable style={styles.ghostBtn} onPress={handleReset}>
              <Text style={styles.ghostBtnText}>← Try another link</Text>
            </Pressable>
          </View>
        )}

        {status === 'done' && song && (
          <>
            <View style={styles.songCard}>
              {song.thumbnailUrl && (
                <Image source={{ uri: song.thumbnailUrl }} style={styles.thumb} />
              )}
              <View style={styles.songInfo}>
                <View style={styles.foundBadge}>
                  <Text style={styles.foundBadgeText}>Found</Text>
                </View>
                <Text style={styles.songTitle}>{song.title}</Text>
                <Text style={styles.songArtist}>{song.artist}</Text>
              </View>
              <View style={styles.songActions}>
                <Pressable style={styles.ghostBtn} onPress={handleShare}>
                  <Text style={styles.ghostBtnText}>Share</Text>
                </Pressable>
                <Pressable style={styles.ghostBtn} onPress={handleReset}>
                  <Text style={styles.ghostBtnText}>← New</Text>
                </Pressable>
              </View>
            </View>
            <PlatformLinksGrid platformLinks={song.platformLinks} searchQuery={searchQuery} />
          </>
        )}
        <OdesliAttribution />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.lg },
  hero: { alignItems: 'center', paddingTop: spacing.xl },
  heroTitle: { color: colors.text, fontSize: typography.title, fontWeight: '800', letterSpacing: -0.5 },
  heroSub: { color: colors.textMuted, fontSize: typography.small, textAlign: 'center', marginTop: spacing.sm },
  searchRow: { flexDirection: 'row', gap: spacing.sm },
  input: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, color: colors.text, fontSize: typography.body,
    paddingHorizontal: spacing.md, paddingVertical: 12,
  },
  searchBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, justifyContent: 'center',
  },
  searchBtnText: { color: colors.background, fontWeight: '700', fontSize: typography.body },
  center: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  mutedText: { color: colors.textMuted, fontSize: typography.small },
  errorText: { color: colors.danger, fontSize: typography.body, textAlign: 'center' },
  songCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.border, padding: spacing.md, flexDirection: 'row',
    alignItems: 'flex-start', gap: spacing.md,
  },
  thumb: { width: 64, height: 64, borderRadius: radius.sm },
  songInfo: { flex: 1, gap: 4 },
  foundBadge: { backgroundColor: colors.primary + '22', borderRadius: 4, alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2 },
  foundBadgeText: { color: colors.primary, fontSize: typography.caption, fontWeight: '700' },
  songTitle: { color: colors.text, fontSize: typography.body, fontWeight: '700' },
  songArtist: { color: colors.textMuted, fontSize: typography.small },
  songActions: { gap: spacing.xs },
  ghostBtn: {
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.sm, paddingVertical: 6,
  },
  ghostBtnText: { color: colors.text, fontSize: typography.caption },
});
