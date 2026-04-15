'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Link2, Unlink, Loader2, CheckCircle, AlertCircle,
  Clock, ChevronDown, ChevronUp, Copy, Eye, EyeOff,
  KeyRound, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '../lib/trpc';

// ─── Platform config ──────────────────────────────────────────────────────────

type OAuthKey = 'meta' | 'linkedin' | 'twitter' | 'youtube';

interface PlatformConfig {
  label:       string;
  oauthKey:    OAuthKey;
  dbPlatforms: string[];
  color:       string;
  abbr:        string;
  credHint:    string;
  idLabel:     string;   // what the platform calls the client ID
  secretLabel: string;   // what the platform calls the client secret
}

const PLATFORMS: PlatformConfig[] = [
  {
    label:       'Instagram & Facebook',
    oauthKey:    'meta',
    dbPlatforms: ['Instagram', 'Facebook'],
    color:       'from-pink-500 via-purple-500 to-orange-400',
    abbr:        'META',
    credHint:    'Meta for Developers → Your App → App Settings → Basic',
    idLabel:     'App ID',
    secretLabel: 'App Secret',
  },
  {
    label:       'LinkedIn',
    oauthKey:    'linkedin',
    dbPlatforms: ['LinkedIn'],
    color:       'from-blue-600 to-blue-800',
    abbr:        'LI',
    credHint:    'LinkedIn Developer Portal → Your App → Auth',
    idLabel:     'Client ID',
    secretLabel: 'Client Secret',
  },
  {
    label:       'Twitter / X',
    oauthKey:    'twitter',
    dbPlatforms: ['Twitter'],
    color:       'from-sky-400 to-sky-600',
    abbr:        'TW',
    credHint:    'developer.twitter.com → Your App → Keys and Tokens → OAuth 2.0',
    idLabel:     'Client ID',
    secretLabel: 'Client Secret',
  },
  {
    label:       'YouTube',
    oauthKey:    'youtube',
    dbPlatforms: ['YouTube'],
    color:       'from-red-500 to-red-700',
    abbr:        'YT',
    credHint:    'Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID',
    idLabel:     'Client ID',
    secretLabel: 'Client Secret',
  },
];

// ─── Token expiry badge ───────────────────────────────────────────────────────

function ExpiryBadge({ expiry }: { expiry: string | null }) {
  if (!expiry) return null;
  const msLeft  = new Date(expiry).getTime() - Date.now();
  const daysLeft = Math.floor(msLeft / (1000 * 60 * 60 * 24));
  if (daysLeft > 7) return null;
  return (
    <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
      <Clock size={9} />
      {daysLeft <= 0 ? 'Expired' : `${daysLeft}d left`}
    </span>
  );
}

// ─── Per-platform card ────────────────────────────────────────────────────────

type AccountRow = {
  id: string;
  platform: string;
  account_id: string;
  username: string | null;
  token_expiry: string | null;
};

function PlatformCard({
  platform,
  accounts,
  workerUrl,
  workerUrlLoading,
  onDisconnect,
  disconnecting,
}: {
  platform:         PlatformConfig;
  accounts:         AccountRow[];
  workerUrl:        string;
  workerUrlLoading: boolean;
  onDisconnect:     (id: string) => void;
  disconnecting:    boolean;
}) {
  const utils = trpc.useUtils();

  const [expanded,    setExpanded]    = useState(false);
  const [clientId,    setClientId]    = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showSecret,  setShowSecret]  = useState(false);
  const [copied,      setCopied]      = useState(false);

  const redirectUri = `${workerUrl.replace(/\/$/, '')}/api/auth/${platform.oauthKey}/callback`;

  const { data: credsData, isLoading: credsLoading } =
    trpc.settings.getOAuthCreds.useQuery({ platform: platform.oauthKey });

  const saveMutation = trpc.settings.saveOAuthCreds.useMutation({
    onSuccess: () => {
      toast.success(`${platform.label} credentials saved`);
      void utils.settings.getOAuthCreds.invalidate({ platform: platform.oauthKey });
      setExpanded(false);
      setClientSecret('');
    },
    onError: (e) => toast.error(e.message),
  });

  const removeMutation = trpc.settings.removeOAuthCreds.useMutation({
    onSuccess: () => {
      toast.success(`${platform.label} credentials removed`);
      void utils.settings.getOAuthCreds.invalidate({ platform: platform.oauthKey });
      setExpanded(false);
      setClientId('');
      setClientSecret('');
    },
    onError: (e) => toast.error(e.message),
  });

  const isConfigured     = credsData?.configured ?? false;
  const connectedAccounts = accounts.filter(a => platform.dbPlatforms.includes(a.platform));

  function handleExpand() {
    if (!expanded && credsData?.clientId) setClientId(credsData.clientId);
    setExpanded(v => !v);
  }

  function handleSave() {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error(`Both ${platform.idLabel} and ${platform.secretLabel} are required`);
      return;
    }
    saveMutation.mutate({
      platform:     platform.oauthKey,
      clientId:     clientId.trim(),
      clientSecret: clientSecret.trim(),
    });
  }

  function handleCancel() {
    setExpanded(false);
    setClientId('');
    setClientSecret('');
  }

  function handleCopy() {
    navigator.clipboard.writeText(redirectUri).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => toast.error('Failed to copy'));
  }

  return (
    <div className="px-5 py-4">
      {/* ── Top row ── */}
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${platform.color} flex items-center justify-center shrink-0`}>
          <span className="text-white text-[10px] font-bold">{platform.abbr}</span>
        </div>

        {/* Name + credential status */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{platform.label}</p>
          {credsLoading ? (
            <p className="text-xs text-gray-400 mt-0.5">Loading…</p>
          ) : isConfigured ? (
            <p className="text-xs text-emerald-600 flex items-center gap-1 mt-0.5">
              <KeyRound size={10} /> API credentials saved
            </p>
          ) : (
            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
              <AlertCircle size={10} /> API credentials not configured
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Connect button — only show when creds are saved */}
          {isConfigured && (
            <button
              onClick={() => { window.location.href = `/api/auth/${platform.oauthKey}/init`; }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              <Link2 size={11} />
              {connectedAccounts.length > 0 ? 'Reconnect' : 'Connect'}
            </button>
          )}
          {/* Configure / Edit toggle */}
          <button
            onClick={handleExpand}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors"
          >
            <KeyRound size={11} />
            {isConfigured ? 'Edit' : 'Configure'}
            {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
        </div>
      </div>

      {/* ── Connected accounts list ── */}
      {connectedAccounts.length > 0 && (
        <div className="mt-2 ml-11 space-y-1">
          {connectedAccounts.map(acct => (
            <div key={acct.id} className="flex items-center gap-2 flex-wrap">
              <CheckCircle size={11} className="text-emerald-500 shrink-0" />
              <span className="text-xs text-gray-700 font-medium truncate">
                {acct.username ?? acct.account_id}
              </span>
              <span className="text-xs text-gray-400">({acct.platform})</span>
              <ExpiryBadge expiry={acct.token_expiry} />
              <button
                onClick={() => onDisconnect(acct.id)}
                disabled={disconnecting}
                className="ml-auto shrink-0 flex items-center gap-1 text-[11px] text-red-500 hover:text-red-700 border border-red-200 rounded px-1.5 py-0.5 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <Unlink size={9} /> Disconnect
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Credentials form (expandable) ── */}
      {expanded && (
        <div className="mt-3 ml-11 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
          <p className="text-xs text-gray-500">
            Get credentials from:{' '}
            <span className="font-medium text-gray-700">{platform.credHint}</span>
          </p>

          {/* Client ID */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {platform.idLabel}
            </label>
            <input
              type="text"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              placeholder={`Paste your ${platform.idLabel} here`}
              className="w-full text-xs px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
            />
          </div>

          {/* Client Secret */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              {platform.secretLabel}
            </label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={clientSecret}
                onChange={e => setClientSecret(e.target.value)}
                placeholder={isConfigured ? '(leave blank to keep existing secret)' : `Paste your ${platform.secretLabel} here`}
                className="w-full text-xs px-3 py-2 pr-9 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
              />
              <button
                type="button"
                onClick={() => setShowSecret(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>

          {/* Redirect URI */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Redirect URI{' '}
              <span className="font-normal text-gray-400">
                — copy this and add it to your OAuth app settings
              </span>
            </label>
            {workerUrlLoading ? (
              <div className="h-8 bg-gray-100 rounded animate-pulse" />
            ) : (
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] bg-white border border-gray-200 rounded px-2.5 py-1.5 text-gray-700 font-mono truncate select-all">
                  {redirectUri}
                </code>
                <button
                  onClick={handleCopy}
                  className="shrink-0 flex items-center gap-1 text-xs text-gray-600 border border-gray-200 rounded px-2.5 py-1.5 hover:bg-white transition-colors whitespace-nowrap"
                >
                  <Copy size={11} />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )}
          </div>

          {/* Save / Cancel / Remove */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {saveMutation.isPending && <Loader2 size={11} className="animate-spin" />}
              Save Credentials
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            {isConfigured && (
              <button
                onClick={() => removeMutation.mutate({ platform: platform.oauthKey })}
                disabled={removeMutation.isPending}
                className="ml-auto flex items-center gap-1 text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                {removeMutation.isPending
                  ? <Loader2 size={11} className="animate-spin" />
                  : <Trash2 size={11} />
                }
                Remove credentials
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ConnectedAccounts() {
  const searchParams = useSearchParams();
  const utils = trpc.useUtils();

  const { data: accounts = [], isLoading } = trpc.accounts.list.useQuery();
  const { data: workerUrlData, isLoading: workerUrlLoading } = trpc.settings.getWorkerUrl.useQuery();
  const workerUrl = workerUrlData?.url ?? '';

  const disconnectMutation = trpc.accounts.disconnect.useMutation({
    onSuccess: () => {
      toast.success('Account disconnected');
      void utils.accounts.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  // Show toast when returning from OAuth flow
  useEffect(() => {
    const connected = searchParams.get('connected');
    const error     = searchParams.get('error');
    if (connected) {
      const p = PLATFORMS.find(pl => pl.oauthKey === connected);
      toast.success(`${p?.label ?? connected} connected successfully`);
      const url = new URL(window.location.href);
      url.searchParams.delete('connected');
      window.history.replaceState({}, '', url.toString());
    }
    if (error) {
      toast.error(decodeURIComponent(error));
      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
          <Link2 size={16} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">Official API Connections</p>
          <p className="text-xs text-gray-500">
            Add API credentials per platform, then connect accounts to auto-populate impressions, reach &amp; clicks
          </p>
        </div>
        {isLoading && <Loader2 size={14} className="ml-auto animate-spin text-gray-400" />}
      </div>

      {/* Platform rows */}
      <div className="divide-y divide-gray-100">
        {PLATFORMS.map(platform => (
          <PlatformCard
            key={platform.oauthKey}
            platform={platform}
            accounts={accounts}
            workerUrl={workerUrl}
            workerUrlLoading={workerUrlLoading}
            onDisconnect={(id) => disconnectMutation.mutate({ id })}
            disconnecting={disconnectMutation.isPending}
          />
        ))}
      </div>
    </div>
  );
}
