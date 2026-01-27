import { X } from "lucide-react";
import { useState } from "react";

interface CreateSubdomainModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (subdomain: string) => void;
  isPending: boolean;
  error: string | null;
  setError: (error: string | null) => void;
}

export function CreateSubdomainModal({
  isOpen,
  onClose,
  onCreate,
  isPending,
  error,
  setError,
}: CreateSubdomainModalProps) {
  const [newSubdomain, setNewSubdomain] = useState("");

  if (!isOpen) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    onCreate(newSubdomain);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0A0A0A] border border-white/10 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">
            Reserve Subdomain
          </h2>
          <button
            title="close modal"
            onClick={() => {
              onClose();
              setNewSubdomain("");
            }}
            className="text-gray-500 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">
              Subdomain
            </label>
            <div className="flex items-center">
              <input
                type="text"
                value={newSubdomain}
                onChange={(e) => setNewSubdomain(e.target.value)}
                placeholder="my-app"
                className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-l-xl px-4 py-2.5 text-white focus:outline-none focus:border-accent/50 focus:bg-white/10 transition-all"
                autoFocus
              />
              <div className="shrink-0 bg-white/5 border border-l-0 border-white/10 rounded-r-xl px-4 py-2.5 text-gray-400">
                .outray.app
              </div>
            </div>
            {error && <p className="text-red-400 mt-2 text-sm">{error}</p>}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                setNewSubdomain("");
              }}
              className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newSubdomain || isPending}
              className="flex-1 px-4 py-2.5 bg-white hover:bg-gray-200 text-black rounded-xl transition-colors disabled:opacity-50 font-medium"
            >
              {isPending ? "Reserving..." : "Reserve"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
