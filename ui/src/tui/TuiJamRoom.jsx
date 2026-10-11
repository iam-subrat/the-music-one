import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import TerminalShell from "./TerminalShell";
import TuiPlaylistPicker from "./TuiPlaylistPicker";
import TuiPlayer from "./TuiPlayer";
import TuiQueueList from "./TuiQueueList";
import { readySong } from "../playback/queuePresentation";
import { useAuth } from "../hooks/useAuth";
import { useSession } from "../hooks/useSession";
import { useQueue } from "../hooks/useQueue";
import { useParticipants } from "../hooks/useParticipants";
import { useSkipVotes } from "../hooks/useSkipVotes";
import {
  joinSession,
  endSession,
  passDjToken,
  setRepeatMode,
  setAutoPilot,
  setPlaybackMode,
} from "../lib/session";
import {
  addToQueue,
  searchAndAddToQueue,
  playNext,
  forceSkip,
  castSkipVote,
  removeSkipVote,
  patchYouTubeLink,
  playSpecificSong,
  playPrevious,
} from "../lib/queue";
import {
  detectPlaylist,
  fetchPlaylistPreview,
  addPlaylistBatch,
} from "../lib/playlist";
import { API_BASE } from "../lib/api";
import { useAnalytics } from "../lib/analytics";
import { FLAGS } from "../lib/flags";
import { getUpcoming } from "../components/QueueList";
import { useResolvedYouTubeVideo } from "../playback/useResolvedYouTubeVideo";
import { useJamPlayback } from "../playback/JamPlaybackContext";
import { useIndependentPlayback } from "../playback/IndependentPlaybackContext";
import s from "./tui.module.css";

const HELP_LINES = [
  ["mode [dj|independent]", "room playback mode (host only to change)"],
  ["add <url>", "queue a song or playlist (yt/yt-music/spotify) by URL"],
  ['add "<name>" [artist]', "queue by name search"],
  ["play | resume", "DJ only — resume playback"],
  ["pause | p", "DJ only — pause playback"],
  ["seek <sec>|±<sec>", "DJ only — jump to absolute or relative position"],
  ["seekend <sec>", "DJ only — jump to N seconds before end"],
  ["next", "DJ only — play next track"],
  ["play <n>", "DJ only — play song n from queue directly"],
  ["prev | previous", "DJ only — play previous song"],

  ["skip [n]", "vote to delete current track or queue song n (DJ removes current immediately)"],
  ["unvote [n]", "remove your vote for current track or queue song n"],
  ["who | participants", "list participants with index/short-id"],
  ["dj <me|@name|N|prefix>", "host or DJ — pass DJ token (see `who`)"],
  ["repeat <none|song|queue>", "DJ only — set repeat mode"],
  ["autopilot <on|off>", "DJ only — auto-queue similar songs"],
  ["invite", "copy invite link to clipboard"],
  ["end", "host only — end session"],
  ["leave", "leave the session"],
  ["clear", "clear terminal log"],
  ["help", "show this help"],
];

function resolveDjTarget(arg, participants, currentUserId) {
  if (arg === "me") return currentUserId;
  if (arg.startsWith("@")) {
    const name = arg.slice(1).toLowerCase();
    const hits = participants.filter((p) =>
      (p.display_name || "").toLowerCase().startsWith(name),
    );
    if (hits.length === 1) return hits[0].id;
    throw new Error(hits.length ? "ambiguous name" : "no match");
  }
  if (/^\d+$/.test(arg)) {
    const p = participants[parseInt(arg, 10) - 1];
    if (!p) throw new Error("index out of range");
    return p.id;
  }
  if (arg.length < 4) throw new Error("id prefix must be 4+ chars");
  const hits = participants.filter((p) => p.id.startsWith(arg));
  if (hits.length === 1) return hits[0].id;
  throw new Error(hits.length ? "ambiguous id" : "no match");
}

export default function TuiJamRoom() {
  const { code } = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const { user, profile, loading: authLoading } = auth;
  const { session, loading: sessionLoading, error: sessionError, setSession, refresh: refreshSession } = useSession(code);
  const {
    items: queueItems,
    ready: queueReady,
    refresh: refreshQueue,
    addItem,
  } = useQueue(session?.id);
  const { participants, refresh: refreshParticipants } = useParticipants(
    session?.id,
  );
  const { capture } = useAnalytics();

  const [log, setLog] = useState(() => [
    { kind: "info", text: "connecting to jam session…" },
  ]);
  const [input, setInput] = useState("");
  const [cmdHistory, setCmdHistory] = useState([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [playlistPicker, setPlaylistPicker] = useState(null);
  const [playbackSnapshot, setPlaybackSnapshot] = useState({
    currentTime: 0,
    duration: 0,
    playerState: -1,
  });

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const didJoinRef = useRef(false);
  const sessionIdRef = useRef(null);
  const controlsBusyRef = useRef(false);
  const [controlsBusy, setControlsBusy] = useState(false);

  async function playerCommand(command) {
    if (controlsBusyRef.current) return;
    controlsBusyRef.current = true; setControlsBusy(true);
    try { await exec(command); }
    finally { controlsBusyRef.current = false; setControlsBusy(false); }
  }

  const independent = session?.playback_mode === "independent";
  const local = useIndependentPlayback(session, queueItems, user?.id,
    queueReady && !authLoading && !sessionLoading && (!independent || participants.some(p => p.id === user?.id)));
  const nowPlaying = independent ? local.state.item : queueItems.find((i) => i.status === "playing") ?? null;
  const displayItem = nowPlaying ?? readySong(queueItems, session?.repeat_mode);
  const isDJ = !independent && !!session && session.dj_user_id === user?.id;
  const isHost = !!session && session.host_user_id === user?.id;
  const { count: skipVotes, hasVoted } = useSkipVotes(
    independent ? null : nowPlaying?.id,
    user?.id,
    session?.id,
  );
  const skipThreshold = Math.floor(participants.length / 2) + 1;
  const { videoId: ytId } = useResolvedYouTubeVideo(nowPlaying, isDJ);
  const { registerPlayback, requestStart, clearPlayback, play, pause, seek, replay, getTime, getDuration, getState } = useJamPlayback();

  function append(...lines) {
    setLog((prev) => [...prev, ...lines]);
  }

  useEffect(() => {
    if (!authLoading && !user) navigate(`/login?next=/jam/${code}`);
  }, [authLoading, user, code, navigate]);

  useEffect(() => {
    if (!session?.id || session.status !== 'active' || !user?.id || didJoinRef.current) return;
    didJoinRef.current = true;
    sessionIdRef.current = session.id;
    joinSession(session.id)
      .then((data) => {
        if (data.expires_at) setSession(prev => prev?.id === session.id ? { ...prev, expires_at: data.expires_at } : prev);
        refreshParticipants();
        append(
          { kind: "ok", text: `✓ joined session ${session.invite_code}` },
          {
            kind: "dim",
            text: `  host=${session.host_user_id?.slice(0, 8)}  dj=${session.dj_user_id?.slice(0, 8)}`,
          },
          { kind: "dim", text: "  type `help` to see commands" },
        );
        capture("jam_session_joined", {
          session_code: code,
          participant_count: participants.length + 1,
        });
      })
      .catch((err) =>
        append({ kind: "err", text: `✗ join failed: ${err.message}` }),
      );
    // Run once per session+user pair; didJoinRef guards against re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.status, user?.id]);

  useEffect(() => {
    sessionIdRef.current = session?.id ?? null;
  }, [session?.id]);

  useEffect(() => {
    const handlePageHide = () => {
      if (sessionIdRef.current)
        navigator.sendBeacon(
          `${API_BASE}/api/sessions/${sessionIdRef.current}/leave`,
        );
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, []);

  useEffect(() => {
    if (session?.status === "ended") clearPlayback(session.id);
  }, [session?.id, session?.status, clearPlayback]);

  useEffect(() => {
    if (independent) return;
    registerPlayback({
      owner: "tui",
      ready: queueReady && !authLoading && !sessionLoading,
      isDJ,
      sessionId: session?.id ?? null,
      modeVersion: session?.playback_mode_version ?? 0,
      queueItemId: nowPlaying?.id ?? null,
      videoId: ytId,
      enabled: !!(session?.status === 'active' && FLAGS.AUTO_PLAY_QUEUE && isDJ && nowPlaying && ytId),
      repeat: session?.repeat_mode === "song",
      metadata: nowPlaying && {
        title: nowPlaying.title,
        artist: nowPlaying.artist,
        artwork: nowPlaying.thumbnail_url,
      },
      onEnded: async () => {
        if (!session?.id || !isDJ) return;
        try {
          const next = await playNext(session.id, session.playback_mode_version ?? 0);
          if (next?.next_item_id === nowPlaying?.id) replay();
          refreshQueue();
          if (!next?.next_item_id) append({ kind: "warn", text: "~ queue empty" });
        } catch (e) {
          append({ kind: "err", text: `✗ auto-advance failed: ${e.message}` });
        }
      },
    });
  }, [independent, session?.status, session?.playback_mode_version, session?.id, nowPlaying?.id, ytId, isDJ, session?.repeat_mode, registerPlayback, refreshQueue, queueReady, authLoading, sessionLoading]);

  useEffect(() => {
    if (!nowPlaying) {
      setPlaybackSnapshot({ currentTime: 0, duration: 0, playerState: -1 });
      return undefined;
    }

    const updatePlaybackSnapshot = () => {
      const next = {
        currentTime: getTime(),
        duration: getDuration(),
        playerState: getState(),
      };
      setPlaybackSnapshot((current) => (
        current.currentTime === next.currentTime
        && current.duration === next.duration
        && current.playerState === next.playerState
          ? current
          : next
      ));
    };

    updatePlaybackSnapshot();
    const intervalId = window.setInterval(updatePlaybackSnapshot, 500);
    return () => window.clearInterval(intervalId);
  }, [getDuration, getState, getTime, nowPlaying?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [log]);

  async function exec(raw) {
    const cmd = raw.trim();
    if (!cmd) return;
    const user_label =
      profile?.display_name?.toLowerCase().replace(/\s+/g, "") || "user";

    if (pendingConfirm) {
      append({ kind: "normal", text: `confirm (y/N)> ${cmd}` });
      const pc = pendingConfirm;
      setPendingConfirm(null);
      if (/^(y|yes)$/i.test(cmd)) await pc.action();
      else append({ kind: "dim", text: "  cancelled." });
      return;
    }

    append({ kind: "normal", text: `${user_label}@jam:${code}$ ${cmd}` });
    setCmdHistory((h) => [...h, cmd]);
    setHistIdx(-1);

    if (/^https?:\/\//i.test(cmd)) {
      return doAdd(cmd);
    }

    const [head, ...rest] = cmd.split(/\s+/);
    const arg = rest.join(" ");

    if (head === "mode") {
      if (!arg) { append({ kind: "info", text: `mode: ${independent ? "Shared Queue" : "DJ-led"}` }); return; }
      if (!isHost) { append({ kind: "err", text: "Host only" }); return; }
      if (!["dj", "independent"].includes(arg) || (arg === "independent" && !(FLAGS.INDEPENDENT_PLAYBACK && FLAGS.YOUTUBE_EMBED))) {
        append({ kind: "warn", text: "usage: mode <dj|independent> (Shared Queue must be enabled)" }); return;
      }
      const version = session.playback_mode_version ?? 0;
      setPendingConfirm({ action: async () => {
        try { setSession(await setPlaybackMode(session.id, arg, version)); append({ kind: "ok", text: "Room mode changed. Playback is paused." }); }
        catch (error) { append({ kind: "err", text: error.message }); }
      } });
      append({ kind: "warn", text: `Switch to ${arg === "dj" ? "DJ-led" : "Shared Queue"} for everyone? Playback will pause. [y/N]` });
      return;
    }
    if (independent) {
      const command = head.toLowerCase();
      if (["unvote", "dj", "autopilot"].includes(command)) {
        append({ kind: "warn", text: "Unavailable in Shared Queue. Playback controls affect this device only." }); return;
      }
      if (["play", "resume", "pause", "p", "next", "n", "skip", "prev", "previous", "repeat", "seek", "seekend"].includes(command)) {
        if (command === "play" && arg) {
          const number = Number(arg), item = upcoming[number - 1];
          if (!Number.isInteger(number) || !item) { append({ kind: "warn", text: "usage: play <queue number>" }); return; }
          if (['failed', 'resolving'].includes(item.resolve_status)) { append({ kind: "warn", text: "Song is not ready for playback" }); return; }
          await local.select(item);
        } else if (["play", "resume"].includes(command)) local.play();
        else if (["pause", "p"].includes(command)) local.pause();
        else if (["next", "n", "skip"].includes(command)) await local.next();
        else if (["prev", "previous"].includes(command)) local.previous();
        else if (command === "repeat") {
          if (!["none", "song", "queue"].includes(arg)) { append({ kind: "warn", text: "usage: repeat <none|song|queue>" }); return; }
          local.repeat(arg);
        } else {
          const value = Number(arg);
          if (!arg || !Number.isFinite(value) || (command === "seekend" && value < 0)) { append({ kind: "warn", text: "Enter a valid number of seconds" }); return; }
          local.seek(Math.max(0, command === "seekend" ? local.getDuration() - value : /^[+-]/.test(arg) ? local.getTime() + value : value));
        }
        append({ kind: "ok", text: command === "skip" ? "Skipped on this device" : `${command}: this device only` }); return;
      }
    }
    switch (head.toLowerCase()) {
      case "help":
      case "?":
        append({ kind: "info", text: "commands:" });
        HELP_LINES.filter(([c]) => !independent || !/^(unvote|dj |autopilot)/.test(c)).forEach(([c, d]) =>
          append({ kind: "dim", text: `  ${c.padEnd(26)} ${independent ? c.startsWith("skip") ? "skip on this device" : d.replace("DJ only —", "This device —") : d}` }),
        );
        break;
      case "clear":
      case "cls":
        setLog([]);
        break;
      case "add":
      case "queue":
      case "q":
        if (!arg) {
          append({
            kind: "warn",
            text: 'usage: add <url>  or  add "<name>" [artist]',
          });
          break;
        }
        return doAdd(arg);
      case "prev":
      case "previous":
        if (!isDJ) {
          append({ kind: "err", text: "✗ DJ only" });
          break;
        }
        if (!nowPlaying && displayItem) {
          const target = queueItems.filter(item => item.status !== 'skipped' && item.position < displayItem.position)
            .sort((a, b) => b.position - a.position)[0];
          if (!target) { append({ kind: "warn", text: "No previous song" }); break; }
          try { await playSpecificSong(session.id, target.id, session.playback_mode_version ?? 0); refreshQueue(); }
          catch (error) { append({ kind: "err", text: error.message }); }
          break;
        }
        if (
          session.repeat_mode === "song" ||
          getTime() > 5
        ) {
          seek(0);
          play();
          append({ kind: "ok", text: "⏮ restarted song from beginning" });
          break;
        }
        try {
          const res = await playPrevious(session.id);
          if (res?.next_item_id) {
            append({ kind: "ok", text: "⏮ previous song" });
            refreshQueue();
          } else {
            seek(0);
            play();
            append({ kind: "warn", text: "~ no previous song" });
          }
        } catch (e) {
          append({ kind: "err", text: `✗ ${e.message}` });
        }
        break;
      case "next":
      case "n":
        if (!isDJ) {
          append({ kind: "err", text: "✗ DJ only" });
          break;
        }
        if (!nowPlaying && displayItem) {
          const eligible = queueItems.filter(item => item.status !== 'skipped').sort((a, b) => a.position - b.position);
          const target = eligible.find(item => item.position > displayItem.position)
            ?? (session.repeat_mode === 'queue' ? eligible.find(item => item.id !== displayItem.id) : null);
          if (!target) { append({ kind: "warn", text: "No next song" }); break; }
          try { await playSpecificSong(session.id, target.id, session.playback_mode_version ?? 0); refreshQueue(); }
          catch (error) { append({ kind: "err", text: error.message }); }
          break;
        }
        if (session.repeat_mode === "song") {
          seek(0);
          play();
          append({ kind: "ok", text: "↺ replaying song (repeat mode: song)" });
          break;
        }
        try {
          await playNext(session.id);
          append({ kind: "ok", text: "✓ advanced queue" });
          refreshQueue();
        } catch (e) {
          append({ kind: "err", text: `✗ ${e.message}` });
        }
        break;
      case "pause":
      case "p":
        if (!isDJ) {
          append({ kind: "err", text: "✗ DJ only" });
          break;
        }
        if (getState() === -1) {
          append({ kind: "warn", text: "~ no player active" });
          break;
        }
        pause();
        append({ kind: "ok", text: "⏸ paused" });
        break;
      case "play":
      case "resume":
        if (rest.length > 0) {
          if (!isDJ) {
            append({ kind: "err", text: "✗ DJ only" });
            break;
          }
          const n = parseInt(rest[0], 10);
          if (isNaN(n) || n < 1 || n > upcoming.length) {
            append({
              kind: "warn",
              text: `~ invalid queue number: ${rest[0]}`,
            });
            break;
          }
          const target = upcoming[n - 1];
          if (['failed', 'resolving'].includes(target.resolve_status)) { append({ kind: "warn", text: "Song is not ready for playback" }); break; }
          const cancelStart = !nowPlaying ? requestStart(session.id, target.id, session.playback_mode_version ?? 0) : null;
          try {
            await playSpecificSong(session.id, target.id, session.playback_mode_version ?? 0);
            append({ kind: "ok", text: `▶ jumping to #${n}: ${target.title}` });
            refreshQueue();
          } catch (e) {
            cancelStart?.();
            append({ kind: "err", text: `✗ ${e.message}` });
          }
          break;
        }
        if (!isDJ) {
          append({ kind: "err", text: "✗ DJ only" });
          break;
        }
        if (!nowPlaying && displayItem) {
          const cancelStart = requestStart(session.id, displayItem.id, session.playback_mode_version ?? 0);
          try {
            await playSpecificSong(session.id, displayItem.id, session.playback_mode_version ?? 0);
            refreshQueue();
            append({ kind: "ok", text: `▶ started ${displayItem.title}` });
          } catch (error) { cancelStart(); append({ kind: "err", text: error.message }); }
          break;
        }
        if (getState() === -1) {
          append({ kind: "warn", text: "~ no player active" });
          break;
        }
        play();
        append({ kind: "ok", text: "▶ resumed" });
        break;
      case "seekend": {
        if (!isDJ) {
          append({ kind: "err", text: "✗ DJ only" });
          break;
        }
        if (getState() === -1) {
          append({ kind: "warn", text: "~ no player active" });
          break;
        }
        const n = parseFloat(arg);
        if (!Number.isFinite(n) || n < 0) {
          append({ kind: "warn", text: "usage: seekend <sec>" });
          break;
        }
        const duration = getDuration();
        if (!duration) {
          append({ kind: "warn", text: "~ duration not available yet" });
          break;
        }
        const target = Math.max(0, duration - n);
        seek(target);
        append({
          kind: "ok",
          text: `⇥ seekend -${n}s → ${target.toFixed(1)}s / ${duration.toFixed(1)}s`,
        });
        break;
      }
      case "seek": {
        if (!isDJ) {
          append({ kind: "err", text: "✗ DJ only" });
          break;
        }
        if (getState() === -1) {
          append({ kind: "warn", text: "~ no player active" });
          break;
        }
        const trimmed = arg.trim();
        const delta = parseFloat(trimmed);
        if (!Number.isFinite(delta)) {
          append({
            kind: "warn",
            text: "usage: seek <sec> | seek -<sec> | seek +<sec>",
          });
          break;
        }
        const isRelative = /^[+-]/.test(trimmed);
        const current = getTime();
        const target = Math.max(0, isRelative ? current + delta : delta);
        seek(target);
        append({
          kind: "ok",
          text: isRelative
            ? `⇥ seek ${delta >= 0 ? "+" : ""}${delta}s → ${target.toFixed(1)}s`
            : `⇥ seek=${target}s`,
        });
        break;
      }
      case "skip":
        const queueTarget = arg.trim()
          ? getUpcoming(queueItems, session.repeat_mode ?? "none")[Number(arg) - 1]
          : nowPlaying;
        if (!queueTarget) {
          append({ kind: "warn", text: arg.trim() ? "usage: skip <queue number>" : "~ nothing playing" });
          break;
        }
        if (arg.trim() && (!Number.isInteger(Number(arg)) || Number(arg) < 1)) {
          append({ kind: "warn", text: "usage: skip <queue number>" });
          break;
        }
        if (isDJ && !arg.trim()) {
          try {
            await forceSkip(session.id);
            append({ kind: "ok", text: "✓ track skipped" });
            refreshQueue();
          } catch (e) {
            append({ kind: "err", text: `✗ ${e.message}` });
          }
        } else {
          try {
            const skipped = await castSkipVote(queueTarget.id, skipThreshold);
            if (skipped) refreshQueue();
            append({
              kind: "ok",
              text: skipped
                ? `✓ skip threshold reached — removed: ${queueTarget.title}`
                : `✓ vote cast for ${queueTarget.title}`,
            });
          } catch (e) {
            append({ kind: "err", text: `✗ ${e.message}` });
          }
        }
        break;
      case "unvote": {
        const queueTarget = arg.trim()
          ? getUpcoming(queueItems, session.repeat_mode ?? "none")[Number(arg) - 1]
          : nowPlaying;
        if (!queueTarget) {
          append({ kind: "warn", text: arg.trim() ? "usage: unvote <queue number>" : "~ no vote to remove" });
          break;
        }
        try {
          await removeSkipVote(queueTarget.id);
          append({ kind: "ok", text: `✓ vote removed for ${queueTarget.title}` });
        } catch (e) {
          append({ kind: "err", text: `✗ ${e.message}` });
        }
        break;
      }
      case "who":
      case "participants": {
        if (!participants.length) {
          append({ kind: "dim", text: "(no participants)" });
          break;
        }
        participants.forEach((p, i) => {
          const tags = [];
          if (p.id === session.dj_user_id) tags.push("DJ");
          if (p.id === session.host_user_id) tags.push("host");
          if (p.id === user?.id) tags.push("you");
          const suffix = tags.length ? `  (${tags.join(", ")})` : "";
          append({
            kind: "dim",
            text: `  ${i + 1}. ${p.id.slice(0, 8)}  ${p.display_name || "Guest"}${suffix}`,
          });
        });
        break;
      }
      case "dj":
        if (!isHost && !isDJ) {
          append({ kind: "err", text: "✗ host or DJ only" });
          break;
        }
        if (!arg) {
          append({
            kind: "warn",
            text: "usage: dj <me|@name|N|id-prefix>  (type `who` to list)",
          });
          break;
        }
        try {
          const target = resolveDjTarget(arg, participants, user.id);
          await passDjToken(session.id, target);
          append({ kind: "ok", text: `✓ DJ passed to ${target.slice(0, 8)}` });
        } catch (e) {
          append({ kind: "err", text: `✗ ${e.message}` });
        }
        break;
      case "repeat": {
        if (!isDJ) {
          append({ kind: "err", text: "✗ DJ only" });
          break;
        }
        const REPEAT_ALIASES = { one: "song", all: "queue", off: "none" };
        const mode = REPEAT_ALIASES[arg] ?? arg;
        if (!["none", "song", "queue"].includes(mode)) {
          append({ kind: "warn", text: "usage: repeat <none|song|queue>" });
          break;
        }
        try {
          await setRepeatMode(session.id, mode);
          setSession((prev) => ({ ...prev, repeat_mode: mode }));
          append({ kind: "ok", text: `✓ repeat=${mode}` });
        } catch (e) {
          append({ kind: "err", text: `✗ ${e.message}` });
        }
        break;
      }
      case "autopilot": {
        if (!isDJ) {
          append({ kind: "err", text: "✗ DJ only" });
          break;
        }
        const enabled = arg === "on" || arg === "true" || arg === "1";
        if (arg !== "on" && arg !== "off") {
          append({ kind: "warn", text: "usage: autopilot <on|off>" });
          break;
        }
        try {
          await setAutoPilot(session.id, enabled);
          setSession((prev) => ({ ...prev, auto_pilot: enabled }));
          append({ kind: "ok", text: `✓ autopilot=${enabled ? "on" : "off"}` });
        } catch (e) {
          append({ kind: "err", text: `✗ ${e.message}` });
        }
        break;
      }
      case "invite":
        navigator.clipboard.writeText(`${location.origin}/jam/${code}`).then(
          () => append({ kind: "ok", text: "✓ invite link copied" }),
          () => append({ kind: "err", text: "✗ clipboard unavailable" }),
        );
        break;
      case "end":
        if (!isHost) {
          append({ kind: "err", text: "✗ host only" });
          break;
        }
        append({
          kind: "warn",
          text: "? end this jam for everyone? press `y` then enter to confirm",
        });
        setPendingConfirm({
          action: async () => {
            try {
              await endSession(session.id);
              capture("jam_session_ended", { session_code: code });
              navigate("/");
            } catch (e) {
              append({ kind: "err", text: `✗ ${e.message}` });
            }
          },
        });
        break;
      case "leave":
        if (sessionIdRef.current)
          navigator.sendBeacon(
            `${API_BASE}/api/sessions/${sessionIdRef.current}/leave`,
          );
        navigate("/");
        break;
      default:
        append({
          kind: "err",
          text: `unknown command: ${head}. try \`help\`.`,
        });
    }
  }

  async function doAdd(arg) {
    try {
      if (
        /^https?:\/\//i.test(arg) &&
        FLAGS.PLAYLIST_IMPORT &&
        detectPlaylist(arg)
      ) {
        append({ kind: "info", text: "~ fetching playlist…" });
        const preview = await fetchPlaylistPreview(arg);
        if (!preview.tracks?.length) {
          append({ kind: "warn", text: "~ playlist empty" });
          return;
        }
        inputRef.current?.blur();
        setPlaylistPicker({ name: preview.name, tracks: preview.tracks });
        return;
      }
      let item;
      if (/^https?:\/\//i.test(arg)) {
        item = await addToQueue(session.id, arg);
      } else {
        const m = arg.match(/^"([^"]+)"\s*(.*)$/);
        item = await searchAndAddToQueue(
          session.id,
          m ? m[1] : arg,
          m?.[2] || undefined,
        );
      }
      addItem(item);
      append({ kind: "ok", text: `✓ queued: ${item.title} — ${item.artist}` });
      refreshQueue();
    } catch (e) {
      append({ kind: "err", text: `✗ ${e.message}` });
    }
  }

  function onKey(e) {
    if (playlistPicker) {
      e.preventDefault();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      exec(input);
      setInput("");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!cmdHistory.length) return;
      const next =
        histIdx < 0 ? cmdHistory.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(next);
      setInput(cmdHistory[next]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx < 0) return;
      const next = histIdx + 1;
      if (next >= cmdHistory.length) {
        setHistIdx(-1);
        setInput("");
      } else {
        setHistIdx(next);
        setInput(cmdHistory[next]);
      }
    } else if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      setLog([]);
    }
  }

  if (authLoading || sessionLoading) {
    return (
      <TerminalShell title="musicone.sh ~ jam" status="connecting…" auth={auth}>
        <div className={`${s.logLine} ${s.dim}`}>
          <span className={s.spin}>◴</span> resolving session…
        </div>
      </TerminalShell>
    );
  }
  if (!session) {
    return (
      <TerminalShell title="musicone.sh ~ jam" status={sessionError ? "connection failed" : "not found"} auth={auth}>
        <div className={`${s.logLine} ${s.err}`}>
          {sessionError || `session not found: ${code}`}
        </div>
        {sessionError && <button type="button" className={s.authBtn} onClick={refreshSession}>Retry</button>}
        <div className={s.hint}>
          <a href="/">
            cd ~
          </a>{" "}
          · go home
        </div>
      </TerminalShell>
    );
  }
  if (session.status === "ended") {
    const played = queueItems.filter((i) =>
      ["played", "playing", "skipped"].includes(i.status),
    );
    return (
      <TerminalShell title="musicone.sh ~ jam" status={session.expired ? 'expired' : 'ended'} auth={auth}>
        <div className={`${s.logLine} ${s.warn}`}>
          ~ session {session.expired ? 'expired' : 'ended'} · {played.length} song{played.length !== 1 ? "s" : ""}{" "}
          played
        </div>
        <div className={s.divider}>──────── recap ────────</div>
        <table className={s.queueTable}>
          <tbody>
            {played.map((it, i) => (
              <tr key={it.id} className={s[it.status]}>
                <td className={s.idx}>{String(i + 1).padStart(2, "0")}</td>
                <td>{it.title}</td>
                <td className={s.dim}>{it.artist}</td>
                <td className={s.status}>{it.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className={s.hint} style={{ marginTop: 18 }}>
          <a href="/">
            [ back home ]
          </a>
        </div>
      </TerminalShell>
    );
  }

  const upcoming = getUpcoming(queueItems, session.repeat_mode ?? "none", independent);
  const autoPilotStatus = session.auto_pilot ? " · AI ✈️" : "";
  const statusLine = `${independent ? "Shared Queue · this device" : "DJ-led"} · ${participants.length} online${isDJ ? " · you are DJ" : ""}${isHost ? " · host" : ""}${autoPilotStatus}`;

  return (
    <TerminalShell
      title={`musicone.sh ~ jam/${code}`}
      status={statusLine}
      onScreenClick={() => inputRef.current?.focus()}
      auth={auth}
    >

      {sessionError && <div role="alert" className={`${s.logLine} ${s.err}`}>
        {sessionError} <button type="button" className={s.authBtn} onClick={refreshSession}>Retry</button>
      </div>}
      <div className={s.jamGrid}>
        <TuiPlayer item={displayItem} snapshot={nowPlaying ? playbackSnapshot : { playerState: -1, currentTime: 0, duration: 0 }}
          repeat={independent ? local.state.repeat : session.repeat_mode} canControl={independent || isDJ}
          started={independent ? !!local.state.started : !!nowPlaying}
          busy={controlsBusy || (independent ? local.state.loading : !queueReady)}
          error={independent ? local.state.error : null} scope={independent ? 'This device' : isDJ ? 'DJ controls' : 'Controlled by DJ'} onCommand={playerCommand}>
                {!independent && nowPlaying && <div
                  className={`${s.logLine} ${s.dim}`}
                  style={{ marginTop: 6 }}
                >
                  delete votes:{" "}
                  <b title={hasVoted ? "Remove your vote with unvote" : isDJ ? "The DJ can remove the current track immediately with skip" : "Vote to remove from this room's queue with skip"}
                    style={{ color: hasVoted ? "var(--tui-lime)" : "var(--tui-amber)" }}>
                    {skipVotes}/{skipThreshold}
                  </b>
                </div>}
        </TuiPlayer>
        <TuiQueueList items={upcoming} currentId={independent ? local.state.item?.id : !nowPlaying ? displayItem?.id : undefined} autoPilot={!independent && session.auto_pilot} />

        <div className={s.panel}>
          <div className={s.panelLabel}>
            participants ({participants.length})
          </div>
          <div className={s.participantList}>
            {participants.map((p) => {
              const isYou = p.id === user?.id;
              const tag =
                session.host_user_id === p.id
                  ? "host"
                  : session.dj_user_id === p.id
                    ? "dj"
                    : null;
              return (
                <div key={p.id} className={s.participantRow}>
                  <span>●</span>
                  <span className={isYou ? s.you : ""}>
                    {p.display_name || p.id?.slice(0, 8) || "guest"}
                    {isYou ? " (you)" : ""}
                  </span>
                  {tag && <span className={`${s.badge} ${s[tag]}`}>{tag}</span>}
                </div>
              );
            })}
          </div>
          <div
            style={{
              marginTop: 12,
              fontSize: 11.5,
              color: "var(--tui-fg-dim)",
            }}
          >
            invite code:
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <div className={s.inviteCode}>{session.invite_code}</div>
            <button
              type="button"
              className={s.authBtn}
              style={{ fontSize: 11, padding: "4px 10px" }}
              onClick={() =>
                navigator.clipboard
                  .writeText(`${location.origin}/jam/${code}`)
                  .then(
                    () => append({ kind: "ok", text: "✓ invite link copied" }),
                    () =>
                      append({ kind: "err", text: "✗ clipboard unavailable" }),
                  )
              }
            >
              [ copy link ]
            </button>
          </div>
        </div>
      </div>

      <div className={s.divider}>──────────── log ────────────</div>
      <div className={s.log}>
        {log.map((line, i) => (
          <div key={i} className={`${s.logLine} ${s[line.kind] || ""}`}>
            {line.text}
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          exec(input);
          setInput("");
        }}
        className={s.prompt}
      >
        <span className={s.promptSymbol}>
          {pendingConfirm
            ? "confirm (y/N)>"
            : `${profile?.display_name?.toLowerCase().replace(/\s+/g, "") || "user"}@jam:${code}$`}
        </span>
        <input
          ref={inputRef}
          autoFocus
          className={s.promptInput}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="type `help` or `add <url>`"
          spellCheck="false"
          autoComplete="off"
        />
        <span className={s.cursor} />
      </form>

      <div className={s.hint}>
        <kbd>↑</kbd> <kbd>↓</kbd> history · <kbd>⌘L</kbd> clear ·{" "}
        <kbd>enter</kbd> run
      </div>

      <div ref={bottomRef} />

      {playlistPicker && (
        <TuiPlaylistPicker
          name={playlistPicker.name}
          tracks={playlistPicker.tracks}
          onCancel={() => {
            setPlaylistPicker(null);
            append({ kind: "dim", text: "  playlist cancelled." });
            inputRef.current?.focus();
          }}
          onConfirm={async (picks) => {
            const picker = playlistPicker;
            setPlaylistPicker(null);
            inputRef.current?.focus();
            try {
              const { added } = await addPlaylistBatch(session.id, picks);
              append({
                kind: "ok",
                text: `✓ queued ${added.length}/${picker.tracks.length} from "${picker.name}"`,
              });
              refreshQueue();
            } catch (e) {
              append({ kind: "err", text: `✗ ${e.message}` });
            }
          }}
        />
      )}
    </TerminalShell>
  );
}
