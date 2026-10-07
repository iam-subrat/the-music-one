import { useEffect, useRef } from "react";

export default function BridgePlayer() {
  const playerRef = useRef(null);
  const progressInterval = useRef(null);
  const requestedVideo = useRef(null);

  useEffect(() => {
    let isMounted = true;
    const initPlayer = () => {
      if (!isMounted) return;
      playerRef.current = new window.YT.Player("bridge-player", {
        width: "100%",
        height: "100%",
        videoId: "",
        playerVars: {
          autoplay: 1,
          controls: 0,
          playsinline: 1,
          modestbranding: 1,
          rel: 0
        },
        events: {
          onReady: () => window.parent.postMessage({ type: "READY", protocol: 2 }, "*"),
          onStateChange: (event) => {
            const actualVideo = event.target?.getVideoData?.().video_id;
            if (actualVideo && actualVideo !== requestedVideo.current) return;
            window.parent.postMessage({ type: "STATE_CHANGE", state: event.data, videoId: requestedVideo.current,
              duration: playerRef.current?.getDuration?.() || 0 }, "*");
            if (event.data === window.YT.PlayerState.PLAYING) {
              if (progressInterval.current) clearInterval(progressInterval.current);
              progressInterval.current = setInterval(() => {
                if (playerRef.current && playerRef.current.getCurrentTime) {
                  window.parent.postMessage({
                    type: "PROGRESS",
                    videoId: requestedVideo.current,
                    currentTime: playerRef.current.getCurrentTime(),
                    duration: playerRef.current.getDuration()
                  }, "*");
                }
              }, 500);
            } else {
              if (progressInterval.current) clearInterval(progressInterval.current);
            }
          },
          onError: (event) => window.parent.postMessage({ type: "ERROR", error: event.data, videoId: requestedVideo.current }, "*"),
          onAutoplayBlocked: () => window.parent.postMessage({ type: "BLOCKED", videoId: requestedVideo.current }, "*")
        }
      });
    };

    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      window.onYouTubeIframeAPIReady = initPlayer;
    } else if (window.YT && window.YT.Player) {
      initPlayer();
    }
    
    return () => { isMounted = false; clearInterval(progressInterval.current); playerRef.current?.destroy?.(); };
  }, []);

  useEffect(() => {
    const handleMessage = (event) => {
      const data = event.data;
      if (event.source !== window.parent || !data || !playerRef.current || !playerRef.current.loadVideoById) return;
      
      const player = playerRef.current;
      try {
        switch (data.type) {
          case "LOAD":
            requestedVideo.current = data.videoId;
            if (data.videoId) {
              if (data.autoplay === false) player.cueVideoById(data.videoId);
              else player.loadVideoById(data.videoId);
            }
            else player.stopVideo();
            break;
          case "CUE":
            requestedVideo.current = data.videoId;
            if (/^[A-Za-z0-9_-]{11}$/.test(data.videoId)) player.cueVideoById(data.videoId);
            break;
          case "PLAY": player.playVideo(); break;
          case "PAUSE": player.pauseVideo(); break;
          case "SEEK": if (typeof data.time === "number") player.seekTo(data.time, true); break;
        }
      } catch (err) {
        console.error("[BridgePlayer] Command error", err);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#000", overflow: "hidden" }}>
      <div id="bridge-player"></div>
    </div>
  );
}
