'use client';

interface Props {
  text: string | undefined;
  loading: boolean;
  error?: boolean;
}

export function InsightCard({ text, loading, error }: Props) {
  if (!loading && !text && !error) return null;

  return (
    <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-indigo-400 text-sm">✦</span>
        <span className="text-xs font-semibold text-indigo-500 uppercase tracking-wide">Insight</span>
      </div>

      {loading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-3 bg-indigo-100 rounded-full w-full" />
          <div className="h-3 bg-indigo-100 rounded-full w-5/6" />
          <div className="h-3 bg-indigo-100 rounded-full w-4/6" />
        </div>
      ) : error ? (
        <p className="text-xs text-indigo-300 italic">Could not generate insight for this chart.</p>
      ) : (
        <p className="text-sm text-gray-700 leading-relaxed">{text}</p>
      )}
    </div>
  );
}
