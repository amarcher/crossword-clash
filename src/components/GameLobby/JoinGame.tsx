import { useState } from "react";

interface JoinGameProps {
  onJoin: (code: string, displayName: string) => void;
  onBack: () => void;
  loading: boolean;
  error: string | null;
  initialCode?: string;
}

export function JoinGame({ onJoin, onBack, loading, error, initialCode }: JoinGameProps) {
  const [code, setCode] = useState(initialCode ?? "");
  const [displayName, setDisplayName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length === 6 && displayName.trim()) {
      onJoin(code.toUpperCase(), displayName.trim());
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-50 p-8">
      <h1 className="text-3xl font-bold mb-2">Join Game</h1>
      <p className="text-neutral-500 mb-8">Enter the 6-character game code</p>

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-600 mb-1">
            Your Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter your name"
            maxLength={20}
            className="w-full px-4 py-2.5 rounded-lg border border-neutral-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-600 mb-1">
            Game Code
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder="ABC123"
            maxLength={6}
            className="w-full px-4 py-2.5 rounded-lg border border-neutral-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-center font-mono text-2xl tracking-[0.3em] uppercase"
          />
        </div>

        {error && (
          <p className="text-red-600 text-sm text-center">{error}</p>
        )}

        <button
          type="submit"
          disabled={code.length !== 6 || !displayName.trim() || loading}
          className="w-full px-6 py-3 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-300 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Joining..." : "Join Game"}
        </button>

        <button
          type="button"
          onClick={onBack}
          className="w-full px-6 py-2 rounded-lg text-neutral-500 hover:text-neutral-700 transition-colors text-sm"
        >
          Back
        </button>
      </form>
    </div>
  );
}
