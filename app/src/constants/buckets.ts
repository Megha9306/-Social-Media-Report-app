export const BUCKETS = ['Brand', 'Offerings', 'Consumer', 'Topical', 'Moment'] as const;

export const SUB_BUCKETS: Record<string, string[] | 'freetext'> = {
  Brand:     ['Mission & Values', 'Behind the Scenes', 'Team Spotlight', 'Culture & Workplace', 'Milestones & Achievements', 'CSR & Community', 'Awards & Recognition', 'Brand Story', 'Partnerships & Collaborations'],
  Offerings: 'freetext',
  Consumer:  ['Customer Reviews', 'User Generated Content', 'Client Stories', 'Testimonial Videos'],
  Topical:   ['Industry Trends', 'Thought Leadership', 'Seasonal & Festive'],
  Moment:    ['Company Events', 'Industry Events', 'Trending Moments'],
};
