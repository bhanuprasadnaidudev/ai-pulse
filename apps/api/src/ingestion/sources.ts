export interface FeedSource {
  name: string;
  url: string;
  tier: 1 | 2;
}

// Verified official RSS feeds — Appendix A of the project roadmap.
// arXiv deliberately left out for v1 (100-300 papers/day would dwarf every
// other source and dilute the "official company updates" feel).
export const FEED_SOURCES: FeedSource[] = [
  { name: 'OpenAI', url: 'https://openai.com/news/rss.xml', tier: 1 },
  { name: 'Google DeepMind', url: 'https://deepmind.google/blog/feed/basic/', tier: 1 },
  { name: 'Google AI', url: 'https://research.google/blog/rss', tier: 1 },
  { name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml', tier: 2 },
];
