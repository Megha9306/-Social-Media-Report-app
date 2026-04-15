'use client';

import type { ReportTotals } from '../types';
import { fmtNum, fmtPct } from '../utils/formatters';

interface Props {
  totals: ReportTotals;
  visibleCols: Set<string>;
}

export function TotalsRow({ totals, visibleCols }: Props) {
  const s = (col: string) => visibleCols.has(col);
  const C = 'px-3 py-2 text-right';

  return (
    <tr className="bg-brand-50 font-semibold text-sm text-brand-900 sticky top-[38px] z-10">
      {/* Checkbox column — always visible, holds the TOTALS label */}
      <td className="px-3 py-2 whitespace-nowrap" colSpan={1}>TOTALS</td>

      {s('platform')           && <td className={C}></td>}
      {s('post_type')          && <td className={C}></td>}
      {s('bucket')             && <td className={C}></td>}
      {s('sub_bucket')         && <td className={C}></td>}
      {s('campaign')           && <td className={C}></td>}
      {s('tags')               && <td className={C}></td>}
      {s('format')             && <td className={C}></td>}
      {s('post')               && <td className={C}></td>}
      {s('date')               && <td className={C}></td>}
      {s('impressions')  && <td className={C}>{fmtNum(totals.totalImpressions)}</td>}
      {s('reach')        && <td className={C}>{fmtNum(totals.totalReach)}</td>}
      {s('clicks')       && <td className={C}>{fmtNum(totals.totalClicks)}</td>}
      {s('ctr')          && <td className={C}>—</td>}
      {s('views')        && <td className={C}>{fmtNum(totals.totalViews)}</td>}
      {s('vtr')          && <td className={C}>—</td>}
      {s('likes')        && <td className={C}>{fmtNum(totals.totalLikes)}</td>}
      {s('comments')     && <td className={C}>{fmtNum(totals.totalComments)}</td>}
      {s('shares')       && <td className={C}>{fmtNum(totals.totalShares)}</td>}
      {s('saves')        && <td className={C}>{fmtNum(totals.totalSaves)}</td>}
      {s('others')       && <td className={C}>—</td>}
      {s('active_eng')   && <td className={C}>{fmtNum(totals.totalActiveEng)}</td>}
      {s('eng_rate')     && <td className={C}>{fmtPct(totals.avgEngRate)}</td>}
      {s('passive_eng')  && <td className={C}>{fmtNum(totals.totalPassiveEng)}</td>}
      {s('passive_rate') && <td className={C}>—</td>}
      {s('trend')        && <td className={C}></td>}
      {s('status')       && <td className={C}></td>}
      {/* Actions always visible */}
      <td className={C}></td>
    </tr>
  );
}
