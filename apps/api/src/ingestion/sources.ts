export interface FeedSource {
  name: string;
  url: string;
  tier: 1 | 2;
  /** Only needed for sources that cover more than AI -- skips items whose
   * title doesn't look AI-related, so a broad multi-topic feed doesn't
   * dilute the timeline with unrelated posts. */
  topicFilter?: RegExp;
  /** Cap on items taken from this feed in one run, before dedupe. The
   * aggregate search feeds return 100 items each; without a cap they'd
   * crowd out every other source and burn the whole summarisation budget
   * on one publisher's output. */
  maxPerRun?: number;
  /** Google News items are titled "Headline - Publisher". Set on every
   * Google News feed so that suffix is removed. Leaving it on mattered
   * more than it looked: it showed up verbatim in the UI, and it also
   * defeated near-duplicate detection, because two headlines for the same
   * story carrying different publisher suffixes (and, for one item, a raw
   * CDN hostname) no longer looked alike enough to merge. */
  stripPublisherSuffix?: boolean;
  /** Additionally use that stripped publisher as the displayed source, so
   * the aggregate feeds credit Reuters/The Verge/etc. rather than showing
   * dozens of posts all labelled the same. Implies stripPublisherSuffix.
   * Off for single-org queries (e.g. Anthropic), where the configured name
   * is already the right label and the suffix is just noise. */
  deriveSourceFromTitle?: boolean;
  /** Processing order when the run's shared summarisation budget is tight:
   * 1 first, 4 last. Official lab announcements should never be starved by
   * a chatty aggregator. */
  priority: 1 | 2 | 3 | 4;
}

const AI_KEYWORDS =
  /\b(AI|A\.I\.|artificial intelligence|machine learning|ML|LLM|VLMs?|neural|GPT|deep learning|generative|foundation models?|language models?|reinforcement learning|computer vision|transformers?|diffusion|robotics?|agents?|Gemini|Claude|OpenAI|Anthropic|copilot|chatbot|datacent(er|re)s?|GPUs?|Nvidia)\b/i;

// Every URL below was fetched and confirmed to return live, parseable
// RSS/Atom with recent items before being added (see the verification pass
// in this commit's message). Feeds that 404'd, returned HTML, blocked the
// request, or hadn't published in over a year were rejected rather than
// added hopefully -- a dead source is worse than a missing one, because it
// looks like coverage while producing nothing.
//
// Deliberately excluded after verification:
//   - Synced, Stanford AI Lab, Sebastian Ruder, blog.research.google:
//     all parse fine but haven't published in 1-4 years.
//   - VentureBeat, MarkTechPost, AI News, Analytics India: 403/429 to
//     non-browser clients. Their stories still reach us via the Google
//     News aggregate feeds below.
//   - Anthropic, Meta AI, Cohere, xAI, Perplexity, Stability, LangChain,
//     IBM Research: no working public feed at all. Anthropic is covered by
//     a Google News site: query instead (see below) -- the rest surface
//     through the topic feeds when they make news.
//   - arXiv: 100-300 papers/day would dwarf everything else.
export const FEED_SOURCES: FeedSource[] = [
  // ---------------------------------------------------------------
  // Tier 1 -- official lab and first-party engineering announcements
  // ---------------------------------------------------------------
  { name: 'OpenAI', url: 'https://openai.com/news/rss.xml', tier: 1, priority: 1 },
  { name: 'Google DeepMind', url: 'https://deepmind.google/blog/feed/basic/', tier: 1, priority: 1 },
  { name: 'Google AI', url: 'https://research.google/blog/rss', tier: 1, priority: 1 },
  // Anthropic publishes no RSS of any kind; this is a Google News query
  // scoped to their own domain, so it carries their announcements only.
  {
    name: 'Anthropic',
    url: 'https://news.google.com/rss/search?q=site:anthropic.com&hl=en-US&gl=US&ceid=US:en',
    tier: 1,
    priority: 1,
    maxPerRun: 3,
    stripPublisherSuffix: true,
  },
  // Research-only blog, so no topicFilter -- a keyword filter here was
  // actually dropping real AI posts that use jargon (VLM, DFT) rather than
  // the literal word "AI".
  { name: 'Microsoft Research', url: 'https://www.microsoft.com/en-us/research/feed/', tier: 1, priority: 1 },
  { name: 'NVIDIA', url: 'https://blogs.nvidia.com/feed/', tier: 1, priority: 1, topicFilter: AI_KEYWORDS },
  { name: 'Apple Machine Learning Research', url: 'https://machinelearning.apple.com/rss.xml', tier: 1, priority: 1 },
  { name: 'Allen Institute for AI', url: 'https://allenai.org/rss.xml', tier: 1, priority: 1 },
  { name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml', tier: 2, priority: 1 },
  { name: 'Mistral AI', url: 'https://mistral.ai/rss.xml', tier: 1, priority: 2, maxPerRun: 2 },
  { name: 'Together AI', url: 'https://www.together.ai/blog/rss.xml', tier: 2, priority: 2, maxPerRun: 2 },
  { name: 'Databricks', url: 'https://www.databricks.com/feed', tier: 2, priority: 2, topicFilter: AI_KEYWORDS },
  { name: 'AWS Machine Learning', url: 'https://aws.amazon.com/blogs/machine-learning/feed/', tier: 2, priority: 2, maxPerRun: 2 },
  { name: 'NVIDIA Developer', url: 'https://developer.nvidia.com/blog/feed/', tier: 2, priority: 3, maxPerRun: 2 },
  { name: 'Amazon Science', url: 'https://www.amazon.science/index.rss', tier: 2, priority: 3, topicFilter: AI_KEYWORDS },
  { name: 'Meta Engineering', url: 'https://engineering.fb.com/feed/', tier: 2, priority: 3, topicFilter: AI_KEYWORDS },

  // ---------------------------------------------------------------
  // Tier 2 -- industry press. This is what surfaces the business side:
  // layoffs, funding, lawsuits, adoption -- none of which ever appears on
  // a company's own research blog.
  // ---------------------------------------------------------------
  { name: 'TechCrunch', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', tier: 2, priority: 2, maxPerRun: 3 },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', tier: 2, priority: 2, maxPerRun: 3 },
  { name: 'Ars Technica', url: 'https://arstechnica.com/ai/feed/', tier: 2, priority: 2, maxPerRun: 2 },
  { name: 'Wired', url: 'https://www.wired.com/feed/tag/ai/latest/rss', tier: 2, priority: 2, maxPerRun: 2 },
  { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', tier: 2, priority: 2, maxPerRun: 2 },
  { name: 'The Decoder', url: 'https://the-decoder.com/feed/', tier: 2, priority: 3, maxPerRun: 2 },
  { name: 'The Register', url: 'https://www.theregister.com/software/ai_ml/headlines.atom', tier: 2, priority: 3, maxPerRun: 2 },
  { name: 'CNBC', url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html', tier: 2, priority: 3, topicFilter: AI_KEYWORDS, maxPerRun: 2 },
  { name: 'Techmeme', url: 'https://www.techmeme.com/feed.xml', tier: 2, priority: 3, topicFilter: AI_KEYWORDS, maxPerRun: 2 },
  { name: 'Engadget', url: 'https://www.engadget.com/rss.xml', tier: 2, priority: 4, topicFilter: AI_KEYWORDS, maxPerRun: 2 },
  { name: 'MIT News', url: 'https://news.mit.edu/rss/topic/artificial-intelligence2', tier: 2, priority: 3, topicFilter: AI_KEYWORDS },

  // ---------------------------------------------------------------
  // Aggregate search feeds -- the catch-everything layer. Each is a Google
  // News query, so between them they pull from thousands of publishers
  // (including the ones that block direct RSS access), and the topic
  // queries cover the angles a pure tech feed misses. deriveSourceFromTitle
  // credits the real publisher on each item.
  // ---------------------------------------------------------------
  {
    name: 'AI News',
    url: 'https://news.google.com/rss/search?q=%22artificial+intelligence%22+when:2d&hl=en-US&gl=US&ceid=US:en',
    tier: 2,
    priority: 2,
    maxPerRun: 4,
    deriveSourceFromTitle: true,
    topicFilter: AI_KEYWORDS,
  },
  {
    name: 'AI & Jobs',
    url: 'https://news.google.com/rss/search?q=(layoffs+OR+%22job+cuts%22+OR+%22job+losses%22+OR+hiring)+AI+when:7d&hl=en-US&gl=US&ceid=US:en',
    tier: 2,
    priority: 2,
    maxPerRun: 3,
    deriveSourceFromTitle: true,
    topicFilter: AI_KEYWORDS,
  },
  {
    name: 'AI Funding',
    url: 'https://news.google.com/rss/search?q=AI+(startup+OR+company)+(funding+OR+raises+OR+valuation+OR+acquisition)+when:7d&hl=en-US&gl=US&ceid=US:en',
    tier: 2,
    priority: 3,
    maxPerRun: 3,
    deriveSourceFromTitle: true,
    topicFilter: AI_KEYWORDS,
  },
  {
    name: 'AI Policy',
    url: 'https://news.google.com/rss/search?q=AI+(regulation+OR+lawsuit+OR+policy+OR+copyright+OR+ban)+when:7d&hl=en-US&gl=US&ceid=US:en',
    tier: 2,
    priority: 3,
    maxPerRun: 3,
    deriveSourceFromTitle: true,
    topicFilter: AI_KEYWORDS,
  },
  {
    name: 'AI in India',
    url: 'https://news.google.com/rss/search?q=artificial+intelligence+India+when:3d&hl=en-IN&gl=IN&ceid=IN:en',
    tier: 2,
    priority: 3,
    maxPerRun: 2,
    deriveSourceFromTitle: true,
    topicFilter: AI_KEYWORDS,
  },
  {
    name: 'AI in Business',
    url: 'https://news.google.com/rss/search?q=(enterprise+OR+business)+AI+adoption+when:2d&hl=en-US&gl=US&ceid=US:en',
    tier: 2,
    priority: 3,
    maxPerRun: 2,
    deriveSourceFromTitle: true,
    topicFilter: AI_KEYWORDS,
  },
  {
    name: 'Hacker News',
    url: 'https://hnrss.org/newest?q=AI+OR+LLM+OR+OpenAI+OR+Anthropic&points=100',
    tier: 2,
    priority: 4,
    maxPerRun: 2,
    topicFilter: AI_KEYWORDS,
  },

  // ---------------------------------------------------------------
  // Video. LinkedIn was requested here and isn't possible: it publishes no
  // public feed, its API is partner-gated, and scraping it breaches their
  // terms and gets server IPs blocked. Of the open social/community
  // alternatives tested, Reddit rate-limited (429) from a datacenter IP
  // and Bluesky/Mastodon RSS carry their text in the body with an empty
  // title, so neither survives as a headline. YouTube's channel feeds are
  // the ones that verified clean.
  // ---------------------------------------------------------------
  {
    name: 'Two Minute Papers',
    url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCbfYPyITQ-7l4upoX8nvctg',
    tier: 2,
    priority: 4,
    maxPerRun: 1,
  },
  {
    name: 'DeepMind (video)',
    url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCP7jMXSY2xbc3KCAE0MHQ-A',
    tier: 2,
    priority: 4,
    maxPerRun: 1,
  },

  // ---------------------------------------------------------------
  // Analysis and newsletters -- slower cadence, higher signal. Low
  // priority because a weekly essay can wait for a run with spare budget.
  // ---------------------------------------------------------------
  { name: 'Import AI', url: 'https://importai.substack.com/feed', tier: 2, priority: 4, maxPerRun: 1 },
  { name: 'Last Week in AI', url: 'https://lastweekin.ai/feed', tier: 2, priority: 4, maxPerRun: 1 },
  { name: 'One Useful Thing', url: 'https://www.oneusefulthing.org/feed', tier: 2, priority: 4, maxPerRun: 1 },
  { name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/', tier: 2, priority: 4, maxPerRun: 2, topicFilter: AI_KEYWORDS },
  { name: 'Interconnects', url: 'https://www.interconnects.ai/feed', tier: 2, priority: 4, maxPerRun: 1 },
  { name: 'Ahead of AI', url: 'https://magazine.sebastianraschka.com/feed', tier: 2, priority: 4, maxPerRun: 1 },
];

/** Sources in the order a run should process them, so a tight budget is
 * spent on official announcements and breaking coverage first. */
export function sourcesByPriority(): FeedSource[] {
  return [...FEED_SOURCES].sort((a, b) => a.priority - b.priority);
}
