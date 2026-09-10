import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Music, Users, ArrowRight } from "lucide-react";

export default function Home() {
  const [code, setCode] = useState("");
  const navigate = useNavigate();

  const handleJoin = (e) => {
    e.preventDefault();
    if (code.trim()) {
      navigate(`/jam/${code.trim()}`);
    }
  };

  return (
    <div className="min-h-screen p-6 max-w-md mx-auto flex flex-col pt-12 pb-24">
      <header className="mb-12">
        <div className="text-sm font-bold tracking-wider text-green-800 uppercase mb-2">
          MusicOne
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight leading-tight">
          Where do you want to jam?
        </h1>
      </header>

      <div className="space-y-6">
        <button
          onClick={() => navigate("/jam/new")}
          className="w-full bg-lime-accent border-2 border-black rounded-[16px] p-6 text-left shadow-brutal transition-transform active:translate-x-1 active:translate-y-1 active:shadow-none flex items-center justify-between"
        >
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Users size={20} />
              <span className="font-bold uppercase text-xs tracking-wider">
                Host
              </span>
            </div>
            <h2 className="text-2xl font-bold">Start a new Jam</h2>
            <p className="text-sm font-medium opacity-80 mt-1">
              Create a room and invite your friends
            </p>
          </div>
          <ArrowRight size={28} />
        </button>

        <form
          onSubmit={handleJoin}
          className="bg-white border-2 border-black rounded-[16px] p-6 shadow-brutal"
        >
          <div className="flex items-center gap-2 mb-4">
            <Music size={20} />
            <span className="font-bold uppercase text-xs tracking-wider">
              Guest
            </span>
          </div>
          <h2 className="text-2xl font-bold mb-4">Join existing Jam</h2>

          <div className="relative">
            <input
              type="text"
              placeholder="Enter Jam Code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full bg-gray-50 border-2 border-black rounded-lg px-4 py-3 font-bold text-lg outline-none focus:ring-2 focus:ring-lime-accent"
            />
            <button
              type="submit"
              disabled={!code.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black text-lime-accent rounded-md flex items-center justify-center disabled:opacity-50"
            >
              <ArrowRight size={20} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
