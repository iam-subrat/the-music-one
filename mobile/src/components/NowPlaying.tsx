import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
  Linking,
  Alert,
} from 'react-native';
import { QueueItem, patchYouTubeLink, playNext } from '../lib/queue';
import { setRepeatMode } from '../lib/session';
import { api } from '../lib/api';
import {
  extractYouTubeId,
  isYouTubeSearchUrl,
  extractSearchQuery,
  preferredLink,
  PLATFORM_META,
} from '../lib/platform';
import { colors, spacing, radius, typography } from '../constants/theme';
import YouTubePlayer from './YouTubePlayer';
import SkipVoteButton from './SkipVoteButton';
import RepeatModeButton from './RepeatModeButton';

type RepeatMode = 'none' | 'song' | 'queue';

interface Props {
  nowPlaying: QueueItem | null;
  sessionId: string;
  isDJ: boolean;
  preferredPlatform?: string | null;
  participantCount: number;
  userId: string;
  onQueueChange?: () => void;
  repeatMode: RepeatMode;
  onRepeatModeChange?: (mode: RepeatMode) => void;
}

interface YouTubeResolveResult {
  id: string | null;
  title: string | null;
}

export default function NowPlaying({
  nowPlaying,
  sessionId,
  isDJ,
  preferredPlatform,
  participantCount,
  userId,
  onQueueChange,
  repeatMode,
  onRepeatModeChange,
}: Props) {
  const [ytId, setYtId] = useState<string | null>(null);
  const [ytResolvedTitle, setYtResolvedTitle] = useState<string | null>(null);
  const resolveKey = useRef<string | null>(null);

  // Resolve YouTube video ID for current song (DJ only)
  useEffect(() => {
    if (!nowPlaying || !isDJ) {
      setYtId(null);
      setYtResolvedTitle(null);
      return;
    }

    const key = nowPlaying.id;
    resolveKey.current = key;
    setYtResolvedTitle(null);
    // Keep ytId mounted so iOS autoplay unlock persists on the same player instance

    // 1. Direct YouTube link
    const ytUrl = nowPlaying.platform_links?.youtube || nowPlaying.platform_links?.youtubemusic;
    const directId = extractYouTubeId(ytUrl ?? null);
    if (directId) {
      setYtId(directId);
      return;
    }

    // 2. YouTube search URL → resolve via backend
    if (ytUrl && isYouTubeSearchUrl(ytUrl)) {
      const q = extractSearchQuery(ytUrl);
      if (q) {
        api(`/youtube/?q=${encodeURIComponent(q)}`)
          .then((res) => (res.ok ? res.json() : { id: null, title: null }))
          .then(({ id, title }: YouTubeResolveResult) => {
            if (resolveKey.current !== key) return;
            if (id) {
              setYtId(id);
              setYtResolvedTitle(title);
            }
          })
          .catch(() => {});
        return;
      }
    }

    // 3. Fallback: title + artist search, patch result for all clients
    api(`/youtube/?q=${encodeURIComponent(`${nowPlaying.title} ${nowPlaying.artist}`)}`)
      .then((res) => (res.ok ? res.json() : { id: null, title: null }))
      .then(({ id, title }: YouTubeResolveResult) => {
        if (resolveKey.current !== key) return;
        if (id) {
          setYtId(id);
          setYtResolvedTitle(title);
          patchYouTubeLink(nowPlaying.id, `https://www.youtube.com/watch?v=${id}`);
        }
      })
      .catch(() => {});
  }, [nowPlaying?.id, isDJ]);

  async function handleEnded() {
    if (!isDJ) return;
    try {
      const next = await playNext(sessionId);
      onQueueChange?.();
      if (!next) Alert.alert('Queue empty', 'No more songs in the queue.');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to advance queue');
    }
  }

  async function handleNext() {
    if (!isDJ) return;
    try {
      const next = await playNext(sessionId);
      onQueueChange?.();
      if (!next) Alert.alert('Queue empty', 'No more songs in the queue.');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    }
  }

  async function handleRepeatChange(mode: RepeatMode) {
    onRepeatModeChange?.(mode);
    try {
      await setRepeatMode(sessionId, mode);
    } catch (e: unknown) {
      onRepeatModeChange?.(repeatMode); // revert optimistic update
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to set repeat mode');
    }
  }

  if (!nowPlaying) {
    return (
      <View style={styles.container}>
        <Text style={styles.label}>Now Playing</Text>
        {/* Keep player mounted (invisible) so iOS stays "activated" after first tap */}
        {ytId && isDJ && (
          <View style={styles.hiddenPlayer}>
            <YouTubePlayer
              videoId={ytId}
              onEnded={handleEnded}
              repeat={repeatMode === 'song'}
            />
          </View>
        )}
        <Text style={styles.idle}>
          {isDJ ? 'Tap "Play Next" to start.' : 'Waiting for DJ to start…'}
        </Text>
        {isDJ && (
          <Pressable style={styles.btn} onPress={handleNext}>
            <Text style={styles.btnText}>Play Next ▶</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const pref = preferredLink(nowPlaying.platform_links, preferredPlatform ?? null);
  const prefMeta = pref ? PLATFORM_META[pref.platform] : null;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <View style={styles.pulse} />
        <Text style={styles.label}>Now Playing</Text>
      </View>

      <View style={styles.meta}>
        {nowPlaying.thumbnail_url ? (
          <Image source={{ uri: nowPlaying.thumbnail_url }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]} />
        )}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>{nowPlaying.title}</Text>
          <Text style={styles.artist} numberOfLines={1}>{nowPlaying.artist}</Text>
          <Text style={styles.addedBy}>
            Added by {nowPlaying.profiles?.display_name ?? 'someone'}
          </Text>
        </View>
      </View>

      {pref && prefMeta && (
        <Pressable
          style={[styles.openBtn, { borderColor: prefMeta.color }]}
          onPress={() => Linking.openURL(pref.url)}
        >
          <Text style={[styles.openBtnText, { color: prefMeta.color }]}>
            Open on {prefMeta.name} ↗
          </Text>
        </Pressable>
      )}

      {ytId && isDJ && (
        <>
          {ytResolvedTitle && (
            <Text style={styles.ytLabel}>▶ Playing via YouTube: {ytResolvedTitle}</Text>
          )}
          <YouTubePlayer
            videoId={ytId}
            onEnded={handleEnded}
            repeat={repeatMode === 'song'}
          />
        </>
      )}

      {/* DJ and skip controls */}
      <View style={styles.controls}>
        {isDJ && (
          <Pressable style={styles.btn} onPress={handleNext}>
            <Text style={styles.btnText}>Next ▶</Text>
          </Pressable>
        )}
        {isDJ && (
          <RepeatModeButton mode={repeatMode} onChange={handleRepeatChange} />
        )}
        <SkipVoteButton
          queueItemId={nowPlaying.id}
          userId={userId}
          sessionId={sessionId}
          participantCount={participantCount}
          onVoted={onQueueChange}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  label: {
    color: colors.textMuted,
    fontSize: typography.small,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  idle: {
    color: colors.textMuted,
    fontSize: typography.body,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  hiddenPlayer: {
    height: 0,
    overflow: 'hidden',
  },
  meta: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
  },
  thumbPlaceholder: {
    backgroundColor: colors.surfaceElevated,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: '700',
  },
  artist: {
    color: colors.textMuted,
    fontSize: typography.small,
  },
  addedBy: {
    color: colors.textMuted,
    fontSize: typography.caption,
  },
  openBtn: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  openBtnText: {
    fontSize: typography.small,
    fontWeight: '600',
  },
  ytLabel: {
    color: colors.textMuted,
    fontSize: typography.caption,
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  btn: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  btnText: {
    color: colors.text,
    fontSize: typography.small,
    fontWeight: '600',
  },
});
