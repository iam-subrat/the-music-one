import React, { useState } from 'react';
import {
  View,
  TextInput,
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { addToQueue, searchAndAddToQueue, QueueItem } from '../lib/queue';
import { detectPlaylist, fetchPlaylistPreview, addPlaylistBatch } from '../lib/playlist';
import { colors, spacing, typography, radius } from '../constants/theme';

interface Props {
  sessionId: string;
  onAdded?: (item: QueueItem) => void;
}

export default function AddSongForm({ sessionId, onAdded }: Props) {
  const [searchMode, setSearchMode] = useState(false);
  const [url, setUrl] = useState('');
  const [songName, setSongName] = useState('');
  const [songArtist, setSongArtist] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleAdd() {
    if (busy) return;
    setBusy(true);
    try {
      let item: QueueItem;
      if (searchMode) {
        const name = songName.trim();
        if (!name) return;
        item = await searchAndAddToQueue(sessionId, name, songArtist.trim());
        setSongName('');
        setSongArtist('');
      } else {
        const trimmed = url.trim();
        if (!trimmed) return;

        if (detectPlaylist(trimmed)) {
          const preview = await fetchPlaylistPreview(trimmed);
          await new Promise<void>((resolve) => {
            Alert.alert(
              `Import "${preview.name}"`,
              `Add ${preview.tracks.length} tracks from this playlist?`,
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
                {
                  text: 'Add all',
                  onPress: async () => {
                    try {
                      await addPlaylistBatch(sessionId, preview.tracks);
                      setUrl('');
                    } catch (err) {
                      Alert.alert('Error', err instanceof Error ? err.message : 'Import failed');
                    }
                    resolve();
                  },
                },
              ],
            );
          });
          return;
        }

        item = await addToQueue(sessionId, trimmed);
        setUrl('');
      }
      onAdded?.(item);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not add song');
    } finally {
      setBusy(false);
    }
  }

  const modes = ['URL', 'Search'];

  return (
    <View style={styles.container}>
      <View style={styles.modeToggle}>
        {modes.map((m, i) => {
          const isActive = searchMode ? i === 1 : i === 0;
          return (
            <Pressable
              key={m}
              style={[styles.modeBtn, isActive && styles.modeBtnActive]}
              onPress={() => setSearchMode(i === 1)}
            >
              <Text style={[styles.modeBtnText, isActive && styles.modeBtnTextActive]}>{m}</Text>
            </Pressable>
          );
        })}
      </View>

      {searchMode ? (
        <View style={styles.row}>
          <View style={styles.inputGroup}>
            <TextInput
              style={styles.input}
              value={songName}
              onChangeText={setSongName}
              placeholder="Song name…"
              placeholderTextColor={colors.textMuted}
              returnKeyType="next"
              editable={!busy}
            />
            <TextInput
              style={styles.input}
              value={songArtist}
              onChangeText={setSongArtist}
              placeholder="Artist (optional)…"
              placeholderTextColor={colors.textMuted}
              returnKeyType="search"
              onSubmitEditing={handleAdd}
              editable={!busy}
            />
          </View>
          <Pressable
            style={[styles.addBtn, busy && styles.addBtnDisabled]}
            onPress={handleAdd}
            disabled={busy}
          >
            {busy
              ? <ActivityIndicator color={colors.background} size="small" />
              : <Text style={styles.addBtnText}>Add</Text>
            }
          </Pressable>
        </View>
      ) : (
        <View style={styles.row}>
          <TextInput
            style={[styles.input, styles.urlInput]}
            value={url}
            onChangeText={setUrl}
            placeholder="Paste a song URL…"
            placeholderTextColor={colors.textMuted}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleAdd}
            editable={!busy}
          />
          <Pressable
            style={[styles.addBtn, busy && styles.addBtnDisabled]}
            onPress={handleAdd}
            disabled={busy}
          >
            {busy
              ? <ActivityIndicator color={colors.background} size="small" />
              : <Text style={styles.addBtnText}>Add</Text>
            }
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: 2,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: radius.sm - 2,
  },
  modeBtnActive: { backgroundColor: colors.surfaceElevated },
  modeBtnText: { color: colors.textMuted, fontSize: typography.small },
  modeBtnTextActive: { color: colors.text, fontWeight: '600' },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  inputGroup: { flex: 1, gap: spacing.xs },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: typography.body,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
  },
  urlInput: { flex: 1 },
  addBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { color: colors.background, fontWeight: '700', fontSize: typography.body },
});
