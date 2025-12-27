import { Globe, Trash2 } from "lucide-react";

interface Subdomain {
  id: string;
  subdomain: string;
  createdAt: string;
}

interface SubdomainCardProps {
  subdomain: Subdomain;
  onDelete: (id: string) => void;
}

export function SubdomainCard({ subdomain, onDelete }: SubdomainCardProps) {
  return (
    <div className="flex items-center justify-between bg-white/2 border border-white/5 rounded-2xl p-6 hover:border-white/10 transition-all">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400 border border-purple-500/20">
          <Globe size={20} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-white">
              {subdomain.subdomain}.outray.app
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 text-xs border border-green-500/20">
              Reserved
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Created on {new Date(subdomain.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>
      <button
        onClick={() => {
          if (confirm("Are you sure you want to release this subdomain?")) {
            onDelete(subdomain.id);
          }
        }}
        className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
