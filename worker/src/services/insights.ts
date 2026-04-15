import type {
  AnalyticsMOMRow,
  BucketAnalysisRow,
  BucketMOMRow,
  FormatDeliveredRow,
  PostWithMetrics,
} from '../db/queries';
import type { AccountRunWithDetails, CompetitorPost } from '../db/competitor-queries';

export interface AnalysisInsights {
  contentDelivered: string;
  impressionsEng: string;
  viewsMOM: string;
  passiveEng: string;
  activeEng: string;
  bucketViews: string;
  bucketAER: string;
  bucketViewsMOM: string;
  bucketAERMOM: string;
  topPosts: string;
  bottomPosts: string;
}

export interface CompetitorInsights {
  overview: string;
  followers: string;
  engRate: string;
  engagement: string;
  likes: string;
  comments: string;
  views: string;
  trend: string;
  posts: string;
}

function fmtNum(value: number | null | undefined): string {
  if (value == null) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${Math.round(value)}`;
}

function fmtPct(value: number | null | undefined): string {
  if (value == null) return 'n/a';
  return `${(value * 100).toFixed(2)}%`;
}

function monthLabel(value: string | null | undefined): string {
  if (!value) return 'this period';
  const match = value.match(/^(\d{4})-(\d{2})/);
  if (!match) return value;
  const year = match[1];
  const monthIndex = Number(match[2]) - 1;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthName = monthNames[monthIndex];
  return monthName ? `${monthName} ${year}` : value;
}

function average(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((value): value is number => value != null);
  if (nums.length === 0) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function mostCommon(values: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let winner: string | null = null;
  let winnerCount = -1;
  for (const [value, count] of counts.entries()) {
    if (count > winnerCount) {
      winner = value;
      winnerCount = count;
    }
  }
  return winner;
}

function mergeSentences(parts: string[]): string {
  return parts.filter(Boolean).join(' ');
}

function buildTopPostsInsight(posts: PostWithMetrics[]): string {
  if (posts.length === 0) return 'No top-performing posts are available for this period.';

  const lead = posts[0]!;
  const dominantFormat = mostCommon(posts.map(post => post.format));
  const dominantBucket = mostCommon(posts.map(post => post.content_bucket));
  const avgRate = average(posts.map(post => post.metrics?.active_eng_rate));

  return mergeSentences([
    dominantFormat
      ? `${dominantFormat} appears most often among the strongest posts${dominantBucket ? `, with ${dominantBucket} recurring most often as the content bucket` : ''}.`
      : 'The strongest posts are coming from a mixed format set.',
    `The best post reached ${fmtPct(lead.metrics?.active_eng_rate)} engagement rate${lead.metrics?.views != null ? ` and ${fmtNum(lead.metrics?.views)} views` : ''}.`,
    avgRate != null
      ? `Across the top five, average engagement rate is ${fmtPct(avgRate)}, which is a solid benchmark for future creative.`
      : 'Use this set as the benchmark for future creative testing.',
  ]);
}

function buildBottomPostsInsight(posts: PostWithMetrics[]): string {
  if (posts.length === 0) return 'No low-performing posts are available for this period.';

  const weakest = posts[0]!;
  const dominantFormat = mostCommon(posts.map(post => post.format));
  const dominantBucket = mostCommon(posts.map(post => post.content_bucket));
  const avgRate = average(posts.map(post => post.metrics?.active_eng_rate));

  return mergeSentences([
    dominantFormat
      ? `${dominantFormat} appears most often in the lowest-performing set${dominantBucket ? `, and ${dominantBucket} is the most common bucket within it` : ''}.`
      : 'The lowest-performing posts span a mixed set of formats.',
    `The weakest post delivered ${fmtPct(weakest.metrics?.active_eng_rate)} engagement rate${weakest.metrics?.views != null ? ` with ${fmtNum(weakest.metrics?.views)} views` : ''}.`,
    avgRate != null
      ? `Average engagement rate across the bottom five is ${fmtPct(avgRate)}, so these posts need stronger hooks, clearer CTAs, or tighter creative targeting.`
      : 'These posts need stronger hooks, clearer CTAs, or tighter creative targeting.',
  ]);
}

export function buildAnalysisFallbackInsights(params: {
  momData: AnalyticsMOMRow[];
  sowData: FormatDeliveredRow[];
  bucketData: BucketAnalysisRow[];
  bucketMOMData: BucketMOMRow[];
  topPosts: PostWithMetrics[];
  bottomPosts: PostWithMetrics[];
}): AnalysisInsights {
  const { momData, sowData, bucketData, bucketMOMData, topPosts, bottomPosts } = params;
  const uniqueBuckets = [...new Set(bucketMOMData.map(row => row.content_bucket))];

  const contentDelivered = (() => {
    if (sowData.length === 0) return 'No content delivery data is available for this period.';
    const byFormat = new Map<string, number>();
    for (const row of sowData) {
      byFormat.set(row.format, (byFormat.get(row.format) ?? 0) + row.post_count);
    }
    const sorted = [...byFormat.entries()].sort((a, b) => b[1] - a[1]);
    const [topFormat, topCount] = sorted[0] ?? ['content', 0];
    const totalPosts = [...byFormat.values()].reduce((sum, value) => sum + value, 0);
    const latestMonth = sowData.at(-1)?.month;

    return mergeSentences([
      `${topFormat} led output with ${topCount} posts, accounting for ${Math.round((topCount / Math.max(totalPosts, 1)) * 100)}% of ${totalPosts} published posts.`,
      latestMonth ? `The latest delivery month in view is ${monthLabel(latestMonth)}, so that is the best checkpoint for format-mix changes.` : '',
      'Keep scaling the leading format, but keep testing secondary formats so output does not become too narrow.',
    ]);
  })();

  const impressionsEng = (() => {
    if (momData.length === 0) return 'No impressions or engagement-rate data is available for this period.';
    if (momData.length === 1) {
      const latest = momData[0]!;
      return `In ${monthLabel(latest.month)}, impressions reached ${fmtNum(latest.total_impressions)} while active engagement rate sat at ${fmtPct(latest.avg_active_eng_rate)}. More history is needed before calling a trend.`;
    }

    const latest = momData[momData.length - 1];
    const previous = momData[momData.length - 2];
    if (!latest || !previous) return 'No impressions or engagement-rate data is available for this period.';

    const impressionChange = ((latest.total_impressions - previous.total_impressions) / Math.max(previous.total_impressions, 1)) * 100;
    const latestRate = latest.avg_active_eng_rate;
    const previousRate = previous.avg_active_eng_rate;
    return mergeSentences([
      `Impressions ${impressionChange === 0 ? 'were flat' : impressionChange > 0 ? 'rose' : 'fell'}${impressionChange === 0 ? '' : ` by ${Math.abs(impressionChange).toFixed(0)}%`} from ${monthLabel(previous.month)} to ${monthLabel(latest.month)}.`,
      latestRate != null && previousRate != null
        ? `Active engagement rate ${latestRate >= previousRate ? 'improved' : 'softened'} to ${fmtPct(latestRate)} over the same interval.`
        : 'Active engagement-rate data is unavailable for at least one of those months, so the quality trend cannot be compared reliably.',
      latestRate != null && previousRate != null && impressionChange >= 0 && latestRate >= previousRate
        ? 'Distribution and engagement quality are moving together, which usually signals strong creative-market fit.'
        : 'Watch whether reach is converting into interaction, because volume and engagement quality is either mixed or only partially measured.',
    ]);
  })();

  const viewsMOM = (() => {
    if (momData.length === 0) return 'No views data is available for this period.';
    const peak = momData.reduce((best, row) => row.total_views > best.total_views ? row : best, momData[0]!);
    const latest = momData[momData.length - 1]!;
    const avgViews = average(momData.map(row => row.total_views)) ?? 0;
    return mergeSentences([
      `Peak views landed in ${monthLabel(peak.month)} at ${fmtNum(peak.total_views)}.`,
      `The latest month, ${monthLabel(latest.month)}, delivered ${fmtNum(latest.total_views)} views, which is ${latest.total_views >= avgViews ? 'above' : 'below'} the period average of ${fmtNum(avgViews)}.`,
      'Use the peak month as the closest reference point for repeatable creative patterns, posting cadence, and platform mix.',
    ]);
  })();

  const passiveEng = (() => {
    if (momData.length === 0) return 'No passive-engagement data is available for this period.';
    const totalPassive = momData.reduce((sum, row) => sum + row.total_passive_eng, 0);
    const totalActive = momData.reduce((sum, row) => sum + row.total_active_eng, 0);
    const ratio = totalActive > 0 ? totalPassive / totalActive : 0;
    return mergeSentences([
      `Passive engagement totals ${fmtNum(totalPassive)} for the selected period, versus ${fmtNum(totalActive)} active engagements.`,
      `That means passive engagement is running at ${ratio.toFixed(1)}x active engagement, which usually indicates strong content consumption but softer direct interaction.`,
      'If you want more comments, saves, or clicks, add stronger prompts and clearer next actions inside the creative.',
    ]);
  })();

  const activeEng = (() => {
    if (momData.length === 0) return 'No active-engagement data is available for this period.';
    const rates = momData.map(row => row.avg_active_eng_rate).filter((value): value is number => value != null);
    if (rates.length === 0) return 'No active engagement-rate data is available for this period.';
    const minRate = Math.min(...rates);
    const maxRate = Math.max(...rates);
    const avgRate = average(rates) ?? 0;
    const latest = momData[momData.length - 1]!;
    return mergeSentences([
      `Active engagement rate ranged from ${fmtPct(minRate)} to ${fmtPct(maxRate)} across the selected months.`,
      latest.avg_active_eng_rate != null
        ? `The latest month sits at ${fmtPct(latest.avg_active_eng_rate)}, which is ${latest.avg_active_eng_rate >= avgRate ? 'above' : 'below'} the period average of ${fmtPct(avgRate)}.`
        : `The latest month has no active engagement-rate reading, so ${fmtPct(avgRate)} remains the best benchmark from the measured months.`,
      'Use months above the average as the benchmark for creative quality and audience-response patterns.',
    ]);
  })();

  const bucketViews = (() => {
    if (bucketData.length === 0) return 'No content-bucket view data is available for this period.';
    const sorted = [...bucketData].sort((a, b) => b.total_views - a.total_views);
    const top = sorted[0];
    if (!top) return 'No content-bucket view data is available for this period.';
    const totalViews = bucketData.reduce((sum, row) => sum + row.total_views, 0);
    return mergeSentences([
      `${top.content_bucket} is the top view driver with ${fmtNum(top.total_views)} views, or ${Math.round((top.total_views / Math.max(totalViews, 1)) * 100)}% of the bucket total.`,
      sorted.length > 1 && sorted[1]
        ? `The gap to the next bucket is ${fmtNum(top.total_views - sorted[1].total_views)} views.`
        : 'It is the only bucket with measurable view volume in this selection.',
      'This is the strongest bucket to study for repeatable reach patterns.',
    ]);
  })();

  const bucketAER = (() => {
    if (bucketData.length === 0) return 'No content-bucket engagement data is available for this period.';
    const measured = bucketData.filter((row): row is BucketAnalysisRow & { avg_active_eng_rate: number } => row.avg_active_eng_rate != null);
    if (measured.length === 0) {
      return 'No active engagement-rate data is available for these content buckets yet, so this chart cannot rank bucket quality reliably.';
    }
    const sorted = [...measured].sort((a, b) => b.avg_active_eng_rate - a.avg_active_eng_rate);
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];
    if (!top || !bottom) return 'No content-bucket engagement data is available for this period.';
    return mergeSentences([
      `${top.content_bucket} leads engagement rate at ${fmtPct(top.avg_active_eng_rate)}.`,
      sorted.length > 1 ? `${bottom.content_bucket} is the lowest at ${fmtPct(bottom.avg_active_eng_rate)}, which shows a clear quality gap across buckets.` : 'It is the only bucket with engagement-rate data in this selection.',
      'Prioritize the strongest bucket when you need efficient engagement, then transplant its creative traits into weaker categories.',
    ]);
  })();

  const bucketViewsMOM = (() => {
    if (bucketMOMData.length === 0) return 'No month-on-month bucket view data is available for this period.';
    const months = [...new Set(bucketMOMData.map(row => row.month))].sort();
    if (months.length < 2) {
      return `${uniqueBuckets.length} bucket(s) are present, but more than one month is needed before calling a trend.`;
    }

    const firstMonth = months[0];
    const lastMonth = months[months.length - 1];
    if (!firstMonth || !lastMonth) return 'No month-on-month bucket view data is available for this period.';

    let bestBucket = uniqueBuckets[0] ?? 'Unknown';
    let bestGrowth = Number.NEGATIVE_INFINITY;

    for (const bucket of uniqueBuckets) {
      const firstValue = bucketMOMData.find(row => row.month === firstMonth && row.content_bucket === bucket)?.total_views ?? 0;
      const lastValue = bucketMOMData.find(row => row.month === lastMonth && row.content_bucket === bucket)?.total_views ?? 0;
      const growth = firstValue > 0 ? (lastValue - firstValue) / firstValue : (lastValue > 0 ? 1 : 0);
      if (growth > bestGrowth) {
        bestGrowth = growth;
        bestBucket = bucket;
      }
    }

    return mergeSentences([
      `${bestBucket} shows the strongest view momentum from ${monthLabel(firstMonth)} to ${monthLabel(lastMonth)}.`,
      `Its change over the interval is ${(bestGrowth * 100).toFixed(0)}%, making it the clearest growth bucket in the series.`,
      'Use this bucket to understand which themes are expanding their reach over time.',
    ]);
  })();

  const bucketAERMOM = (() => {
    if (bucketMOMData.length === 0) return 'No month-on-month bucket engagement-rate data is available for this period.';
    const months = [...new Set(bucketMOMData.map(row => row.month))].sort();
    const latestMonth = months[months.length - 1];
    if (!latestMonth) return 'No month-on-month bucket engagement-rate data is available for this period.';

    const latestRows = uniqueBuckets
      .map(bucket => ({
        bucket,
        rate: bucketMOMData.find(row => row.month === latestMonth && row.content_bucket === bucket)?.avg_active_eng_rate ?? null,
      }))
      .filter((row): row is { bucket: string; rate: number } => row.rate != null);

    if (latestRows.length === 0) {
      return `No bucket engagement-rate data is available for ${monthLabel(latestMonth)}.`;
    }

    const best = latestRows.reduce((winner, row) => row.rate > winner.rate ? row : winner, latestRows[0]!);
    return mergeSentences([
      `In ${monthLabel(latestMonth)}, ${best.bucket} led bucket engagement at ${fmtPct(best.rate)}.`,
      'That makes it the best current template for hook quality, format choice, and audience resonance.',
      'Use it as the baseline when reworking weaker buckets.',
    ]);
  })();

  return {
    contentDelivered,
    impressionsEng,
    viewsMOM,
    passiveEng,
    activeEng,
    bucketViews,
    bucketAER,
    bucketViewsMOM,
    bucketAERMOM,
    topPosts: buildTopPostsInsight(topPosts),
    bottomPosts: buildBottomPostsInsight(bottomPosts),
  };
}

function buildFollowersInsight(results: AccountRunWithDetails[]): string {
  const valid = results.filter(result => result.accountRun.followers != null);
  if (valid.length === 0) return 'No follower data is available for this run.';

  const sorted = [...valid].sort((a, b) => (b.accountRun.followers ?? 0) - (a.accountRun.followers ?? 0));
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  if (!top || !bottom) return 'No follower data is available for this run.';

  if (sorted.length === 1) {
    return `${top.account.label} has ${fmtNum(top.accountRun.followers)} followers in this run. More accounts are needed for a comparison view.`;
  }

  const ratio = (top.accountRun.followers ?? 0) / Math.max(bottom.accountRun.followers ?? 1, 1);
  return mergeSentences([
    `${top.account.label} leads audience size with ${fmtNum(top.accountRun.followers)} followers.`,
    `${bottom.account.label} is at ${fmtNum(bottom.accountRun.followers)}, so the gap is ${ratio.toFixed(1)}x.`,
    'That audience-size spread matters when comparing raw reach or likes between accounts.',
  ]);
}

function buildEngRateInsight(results: AccountRunWithDetails[]): string {
  const valid = results.filter(result => result.accountRun.avg_engagement_rate != null);
  if (valid.length === 0) return 'No engagement-rate data is available for this run.';

  const sorted = [...valid].sort((a, b) => (b.accountRun.avg_engagement_rate ?? 0) - (a.accountRun.avg_engagement_rate ?? 0));
  const top = sorted[0];
  const self = results.find(result => result.account.is_self);
  if (!top) return 'No engagement-rate data is available for this run.';

  return mergeSentences([
    `${top.account.label} has the strongest average engagement rate at ${fmtPct(top.accountRun.avg_engagement_rate)}.`,
    self && self.account.label !== top.account.label
      ? `Your account, ${self.account.label}, is currently at ${fmtPct(self.accountRun.avg_engagement_rate)}.`
      : '',
    'This metric is the cleanest read on audience quality because it normalizes interaction against account size.',
  ]);
}

function buildLikesInsight(results: AccountRunWithDetails[]): string {
  const valid = results.filter(result => result.accountRun.avg_likes != null);
  if (valid.length === 0) return 'No like-volume data is available for this run.';

  const sorted = [...valid].sort((a, b) => (b.accountRun.avg_likes ?? 0) - (a.accountRun.avg_likes ?? 0));
  const top = sorted[0];
  if (!top) return 'No like-volume data is available for this run.';

  const averageLikes = average(valid.map(result => result.accountRun.avg_likes)) ?? 0;
  return mergeSentences([
    `${top.account.label} leads average likes with ${fmtNum(top.accountRun.avg_likes)} per post.`,
    `That is ${averageLikes > 0 ? Math.round((((top.accountRun.avg_likes ?? 0) / averageLikes) - 1) * 100) : 0}% above the comparison-set average of ${fmtNum(averageLikes)}.`,
    'Higher like volume usually signals stronger first-impression creative or better audience-fit on the feed.',
  ]);
}

function buildEngagementInsight(results: AccountRunWithDetails[]): string {
  const valid = results.filter(result => result.accountRun.avg_engagement != null);
  if (valid.length === 0) return 'No engagement data is available for this run.';

  const sorted = [...valid].sort((a, b) => (b.accountRun.avg_engagement ?? 0) - (a.accountRun.avg_engagement ?? 0));
  const top = sorted[0];
  if (!top) return 'No engagement data is available for this run.';

  const self = results.find(r => r.account.is_self);
  const avgEng = average(valid.map(r => r.accountRun.avg_engagement)) ?? 0;
  return mergeSentences([
    `${top.account.label} leads avg. engagement per post with ${fmtNum(top.accountRun.avg_engagement)}.`,
    self && self.account.label !== top.account.label
      ? `Your account (${self.account.label}) averages ${fmtNum(self.accountRun.avg_engagement)} engagements per post.`
      : null,
    avgEng > 0
      ? `The comparison-set average is ${fmtNum(avgEng)} engagements per post.`
      : null,
  ].filter(Boolean) as string[]);
}

function buildCommentsInsight(results: AccountRunWithDetails[]): string {
  const valid = results.filter(result => result.accountRun.avg_comments != null);
  if (valid.length === 0) return 'No comments data is available for this run.';

  const sorted = [...valid].sort((a, b) => (b.accountRun.avg_comments ?? 0) - (a.accountRun.avg_comments ?? 0));
  const top = sorted[0];
  if (!top) return 'No comments data is available for this run.';

  const self = results.find(r => r.account.is_self);
  const avgComments = average(valid.map(r => r.accountRun.avg_comments)) ?? 0;
  return mergeSentences([
    `${top.account.label} generates the most comments per post at ${fmtNum(top.accountRun.avg_comments)}.`,
    self && self.account.label !== top.account.label
      ? `Your account (${self.account.label}) averages ${fmtNum(self.accountRun.avg_comments)} comments per post.`
      : null,
    'Higher comment volume often signals content that sparks opinions or questions in the audience.',
  ].filter(Boolean) as string[]);
}

function buildViewsInsight(results: AccountRunWithDetails[]): string {
  const valid = results.filter(result => result.accountRun.avg_views != null && (result.accountRun.avg_views ?? 0) > 0);
  if (valid.length === 0) return 'No view data is available for this run, likely because the sample has little or no video content.';

  const sorted = [...valid].sort((a, b) => (b.accountRun.avg_views ?? 0) - (a.accountRun.avg_views ?? 0));
  const top = sorted[0];
  if (!top) return 'No view data is available for this run, likely because the sample has little or no video content.';

  return mergeSentences([
    `${top.account.label} leads average views with ${fmtNum(top.accountRun.avg_views)} per post.`,
    `${results.length - valid.length} account(s) in the run have no meaningful view data, which usually points to lower video volume.`,
    'This is the clearest signal of which account is winning short-form visibility.',
  ]);
}

function getTrendValue(post: CompetitorPost, metric: 'engagement' | 'engagement_rate' | 'likes' | 'views'): number {
  if (metric === 'engagement') return post.engagement;
  if (metric === 'engagement_rate') return post.engagement_rate ?? 0;
  if (metric === 'likes') return post.likes;
  return post.views ?? 0;
}

function buildTrendInsight(results: AccountRunWithDetails[]): string {
  const improvements = results
    .filter(result => result.posts.length >= 2)
    .map(result => {
      const posts = [...result.posts].sort((a, b) => new Date(a.published_at ?? 0).getTime() - new Date(b.published_at ?? 0).getTime());
      const first = posts[0];
      const last = posts[posts.length - 1];
      if (!first || !last) return null;
      return {
        label: result.account.label,
        delta: getTrendValue(last, 'engagement') - getTrendValue(first, 'engagement'),
      };
    })
    .filter((row): row is { label: string; delta: number } => row != null);

  if (improvements.length === 0) {
    return 'There is not enough post history in this run to calculate a meaningful trend.';
  }

  const best = improvements.reduce((winner, row) => row.delta > winner.delta ? row : winner, improvements[0]!);
  return mergeSentences([
    `${best.label} shows the strongest engagement movement across its earliest and latest sampled posts.`,
    `The change across that span is ${fmtNum(Math.abs(best.delta))}, which points to the clearest momentum shift in the comparison set.`,
    best.delta >= 0
      ? 'That account is the best one to benchmark for recent improvement.'
      : 'The set is generally softening, so recent creative or timing choices should be reviewed.',
  ]);
}

function buildPostsInsight(results: AccountRunWithDetails[]): string {
  const postsByType = new Map<string, number>();
  let bestAccount: string | null = null;
  let bestAvgEngagement = Number.NEGATIVE_INFINITY;

  for (const result of results) {
    for (const post of result.posts) {
      if (post.post_type) {
        postsByType.set(post.post_type, (postsByType.get(post.post_type) ?? 0) + 1);
      }
    }

    const avgEngagement = average(result.posts.map(post => post.engagement));
    if (avgEngagement != null && avgEngagement > bestAvgEngagement) {
      bestAvgEngagement = avgEngagement;
      bestAccount = result.account.label;
    }
  }

  const dominantType = [...postsByType.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'content';

  return mergeSentences([
    `${dominantType} is the most common post type in the sampled competitor content.`,
    bestAccount ? `${bestAccount} has the strongest average post-level engagement across the run.` : 'No account has enough post-level data for a reliable winner.',
    'Use the winning account and dominant post type together to review the creative patterns that repeatedly travel well.',
  ]);
}

export function buildCompetitorFallbackInsights(results: AccountRunWithDetails[]): CompetitorInsights {
  const overview = (() => {
    if (results.length === 0) return 'No competitor results are available for this run.';

    const followerLeader = [...results]
      .filter(result => result.accountRun.followers != null)
      .sort((a, b) => (b.accountRun.followers ?? 0) - (a.accountRun.followers ?? 0))[0];

    const engLeader = [...results]
      .filter(result => result.accountRun.avg_engagement_rate != null)
      .sort((a, b) => (b.accountRun.avg_engagement_rate ?? 0) - (a.accountRun.avg_engagement_rate ?? 0))[0];

    return mergeSentences([
      followerLeader
        ? `${followerLeader.account.label} currently leads on audience size with ${fmtNum(followerLeader.accountRun.followers)} followers.`
        : 'Audience-size data is limited in this run.',
      engLeader
        ? `${engLeader.account.label} leads on engagement rate at ${fmtPct(engLeader.accountRun.avg_engagement_rate)}.`
        : 'Engagement-rate data is limited in this run.',
      followerLeader && engLeader && followerLeader.account.label !== engLeader.account.label
        ? 'Scale and audience quality are being led by different accounts, so the competitive picture is split rather than dominated by one profile.'
        : 'The same leader appears to be winning on both scale and quality, which suggests a clear market leader in this sample.',
    ]);
  })();

  return {
    overview,
    followers:  buildFollowersInsight(results),
    engRate:    buildEngRateInsight(results),
    engagement: buildEngagementInsight(results),
    likes:      buildLikesInsight(results),
    comments:   buildCommentsInsight(results),
    views:      buildViewsInsight(results),
    trend:      buildTrendInsight(results),
    posts:      buildPostsInsight(results),
  };
}

