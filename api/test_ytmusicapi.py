from ytmusicapi import YTMusic

def test():
    yt = YTMusic()
    # Let's get watch playlist for a known video
    # Rick Astley - Never Gonna Give You Up
    watch_playlist = yt.get_watch_playlist(videoId="dQw4w9WgXcQ")
    
    print("Found tracks in up-next / related:")
    for track in watch_playlist.get('tracks', [])[:5]:
        print(f"{track.get('title')} - {track.get('videoId')}")

test()
