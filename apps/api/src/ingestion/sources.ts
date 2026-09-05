export interface FeedSource {
  name: string;
  url: string;
  tier: 1 | 2;
  /** Only needed for sources that cover more than AI -- skips items whose
   * title doesn't look AI-related, so a broad multi-topic feed doesn't
   * dilute the timeline with unrelated posts. */
  topicFilter?: RegExp;
}

const AI_KEYWORDS =
  /\b(AI|A\.I\.|artificial intelligence|machine learning|ML|LLM|VLMs?|neural|GPT|deep learning|generative|foundation models?|language models?|reinforcement learning|computer vision|transformers?|diffusion|robotics?|agents?|Gemini|Claude)\b/i;

// Verified official RSS feeds -- each URL was fetched and confirmed to
// return real, valid RSS/Atom content before being added here (not guessed).
// arXiv deliberately left out for v1 (100-300 papers/day would dwarf every
// other source and dilute the "official company updates" feel).
//
// Anthropic has no official RSS feed as of this writing -- only unofficial
// third-party mirrors exist, which we won't rely on for an "official only"
// product. Meta AI, IBM Research, Mistral, Cohere and Stability AI don't
// have a confirmed official feed either; revisit if one appears, or build a
// scheduled fetch-and-diff scraper for their newsroom pages (same approach
// noted in the original roadmap for sources without RSS).
export const FEED_SOURCES: FeedSource[] = [
  { name: 'OpenAI', url: 'https://openai.com/news/rss.xml', tier: 1 },
  { name: 'Google DeepMind', url: 'https://deepmind.google/blog/feed/basic/', tier: 1 },
  { name: 'Google AI', url: 'https://research.google/blog/rss', tier: 1 },
  { name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml', tier: 2 },
  // No topicFilter here -- unlike NVIDIA/Amazon Science/MIT News below, this
  // is a research-only blog, not a general company blog, so the false-
  // positive rate from *not* filtering is low, and a keyword filter was
  // actually dropping real AI posts that use jargon (VLM, DFT, etc.)
  // instead of the literal word "AI".
  { name: 'Microsoft Research', url: 'https://www.microsoft.com/en-us/research/feed/', tier: 1 },
  { name: 'NVIDIA', url: 'https://blogs.nvidia.com/feed/', tier: 1, topicFilter: AI_KEYWORDS },
  { name: 'Apple Machine Learning Research', url: 'https://machinelearning.apple.com/rss.xml', tier: 1 },
  { name: 'Amazon Science', url: 'https://www.amazon.science/index.rss', tier: 2, topicFilter: AI_KEYWORDS },
  { name: 'Allen Institute for AI', url: 'https://allenai.org/rss.xml', tier: 1 },
  {
    name: 'MIT News (AI)',
    url: 'https://news.mit.edu/rss/topic/artificial-intelligence2',
    tier: 2,
    topicFilter: AI_KEYWORDS,
  },
];
