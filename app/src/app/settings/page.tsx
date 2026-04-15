'use client';

import { useState } from 'react';
import { Instagram, CheckCircle, AlertTriangle, Loader2, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '../../lib/trpc';
import { ConnectedAccounts } from '../../components/ConnectedAccounts';

export default function SettingsPage() {
  const [handle, setHandle]   = useState('');
  const [password, setPassword] = useState('');

  const connectionQuery = trpc.settings.getIgConnection.useQuery();
  const saveMutation    = trpc.settings.saveIgConnection.useMutation({
    onSuccess: () => {
      toast.success('Instagram account connected');
      setHandle('');
      setPassword('');
      connectionQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });
  const removeMutation  = trpc.settings.removeIgConnection.useMutation({
    onSuccess: () => {
      toast.success('Instagram account disconnected');
      connectionQuery.refetch();
    },
    onError: (e) => toast.error(e.message),
  });

  const connected = connectionQuery.data?.connected ?? false;
  const connectedHandle = connectionQuery.data?.handle ?? null;
  const isBusy = saveMutation.isPending || removeMutation.isPending;

  return (
    <main className="max-w-2xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage account connections and integrations.</p>
      </div>

      {/* Instagram Connector Card */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 via-purple-500 to-orange-400 flex items-center justify-center">
            <Instagram size={16} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Instagram Account</p>
            <p className="text-xs text-gray-500">Used for authenticated scraping via Apify</p>
          </div>
          {connected && (
            <span className="ml-auto flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
              <CheckCircle size={11} />
              Connected
            </span>
          )}
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Warning banner */}
          <div className="flex gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-700">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>
              Two-Factor Authentication must be disabled on this account.
              Instagram may occasionally flag automated logins — if scraping fails, reconnect here.
            </span>
          </div>

          {connected ? (
            /* Connected state */
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Connected as</p>
                <p className="text-sm font-medium text-gray-900">@{connectedHandle}</p>
              </div>
              <button
                onClick={() => removeMutation.mutate()}
                disabled={isBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-60 transition-colors"
              >
                {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Unlink size={13} />}
                Disconnect
              </button>
            </div>
          ) : (
            /* Not connected state */
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Instagram Handle</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">@</span>
                  <input
                    type="text"
                    value={handle}
                    onChange={e => setHandle(e.target.value.replace(/^@/, ''))}
                    placeholder="grapesworldwide"
                    className="w-full pl-7 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-300"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-300"
                />
              </div>

              <button
                onClick={() => saveMutation.mutate({ handle, password })}
                disabled={!handle.trim() || !password.trim() || isBusy}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-60 transition-colors"
              >
                {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Instagram size={14} />}
                Connect Account
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Official API Connected Accounts */}
      <ConnectedAccounts />
    </main>
  );
}
