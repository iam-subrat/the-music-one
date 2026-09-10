import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useSession } from "../hooks/useSession";
import { useQueue } from "../hooks/useQueue";
import { useParticipants } from "../hooks/useParticipants";
import { addToQueue, searchAndAddToQueue, playSpecificSong, playNext } from "../lib/queue";
import PlayerControls from "../components/PlayerControls";
import { Search, Users, Copy, Check, Music, ArrowLeft } from "lucide-react";

export default function JamRoom() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const { session, loading: sessionLoading } = useSession(code);
  const { items: queueItems, refresh } = useQueue(session?.id);
  const { participants } = useParticipants(session?.id);

  const [query, setQuery] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login?next=/jam/" + code);
  }, [user, authLoading, code, navigate]);

  if (authLoading || sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f5f0]">
        <div className="w-16 h-16 border-4 border-black border-t-lime-accent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f4f5f0] p-6">
        <h1 className="text-3xl font-black mb-2">Jam not found</h1>
        <p className="font-medium text-gray-600 mb-6">
          This room doesn't exist or has ended.
        </p>
        <button
          onClick={() => navigate("/")}
          className="brutal-btn w-full max-w-sm py-4"
        >
          Go Home
        </button>
      </div>
    );
  }

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsAdding(true);
    try {
      const text = query.trim();
      if (text.startsWith("http://") || text.startsWith("https://")) {
        await addToQueue(session.id, text);
      } else {
        await searchAndAddToQueue(session.id, text, "");
      }
      refresh();
      setQuery("");
    } catch (err) {
      console.error(err);
      alert(`Could not add song: ${err.message}`);
    } finally {
      setIsAdding(false);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const playingItem = queueItems.find((i) => i.status === "playing");
  const isHost = [String(session.host_id), String(session.dj_id), String(session.dj_user_id), String(session.creator_id), String(session.owner_id), String(session.user_id)].includes(String(user?.id));

  return (
    <div className="min-h-screen bg-[#f4f5f0] flex flex-col">
      <header className="p-6 border-b-2 border-black bg-white sticky top-0 z-10 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="bg-white border-2 border-black rounded-lg p-2 flex items-center justify-center active:scale-90 transition-transform">
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="text-xs font-bold tracking-wider text-green-800 uppercase">
              Jam Session
            </div>
            <h1 className="text-2xl font-black">{session.name}</h1>
          </div>
        </div>
        <button
          onClick={copyCode}
          className="brutal-card p-2 flex items-center gap-2 hover:bg-gray-50 active:scale-95"
        >
          {copied ? (
            <Check size={18} className="text-green-600" />
          ) : (
            <Copy size={18} />
          )}
          <span className="font-bold">{code}</span>
        </button>
      </header>

      <main className="flex-1 p-6 pb-40 overflow-y-auto">
        <div className="flex gap-4 mb-6 overflow-x-auto pb-2">
          {participants.map((p) => (
            <div
              key={p.id}
              className="brutal-card px-4 py-2 flex items-center gap-2 whitespace-nowrap shrink-0 bg-lime-accent/20"
            >
              <Users size={16} />
              <span className="font-bold text-sm">{p.display_name}</span>
            </div>
          ))}
        </div>

        <form onSubmit={handleSearch} className="mb-8">
          <div className="relative">
            <input
              className="w-full brutal-card px-4 py-4 pr-12 text-lg font-bold outline-none focus:ring-4 focus:ring-lime-accent"
              placeholder="Search to add a song..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isAdding}
            />
            <button
              type="submit"
              disabled={isAdding || !query.trim()}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-lime-accent border-2 border-black rounded-lg flex items-center justify-center active:scale-90"
            >
              {isAdding ? (
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <Search size={20} />
              )}
            </button>
          </div>
        </form>

        <h2 className="text-xl font-black mb-4">Up Next</h2>
        {!playingItem && queueItems.length > 0 && (
          <button
            onClick={() => isHost ? playNext(session.id).then(() => refresh()).catch(e => alert("Could not play: " + e.message)) : alert("Only the host can start the jam!")}
            className="w-full bg-lime-accent border-2 border-black rounded-lg py-4 mb-4 text-lg font-black shadow-brutal active:translate-x-1 active:translate-y-1 active:shadow-none transition-all"
          >
            Start Playing First Song
          </button>
        )}
        <div className="space-y-3">
          {queueItems.map((item) => (
            <button
              key={item.id}
              onClick={() => isHost ? playSpecificSong(session.id, item.id).then(() => refresh()).catch(e => alert("Could not skip to this song: " + e.message)) : null}
              disabled={!isHost}
              className={`w-full text-left brutal-card p-4 flex gap-4 transition-transform ${item.status === "playing" ? "bg-lime-accent/50 border-lime-600 border-4" : "hover:-translate-y-1"}`}
            >
              <div className="w-12 h-12 bg-black rounded flex items-center justify-center shrink-0">
                <Music className="text-lime-accent" size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg truncate">{item.title}</h3>
                <p className="text-sm font-medium text-gray-600 truncate">
                  {item.artist || "Unknown Artist"}
                </p>
                {item.status === "playing" && (
                  <span className="text-xs font-black uppercase text-lime-700 tracking-wider">
                    Now Playing
                  </span>
                )}
              </div>
            </button>
          ))}
          {queueItems.length === 0 && (
            <div className="text-center p-8 border-2 border-dashed border-gray-400 rounded-xl">
              <p className="font-bold text-gray-500">
                Queue is empty. Add a song!
              </p>
            </div>
          )}
        </div>
      </main>

      <PlayerControls
        session={session}
        playingItem={playingItem}
        isHost={isHost}
        queueItems={queueItems}
        refresh={refresh}
      />
    </div>
  );
}
