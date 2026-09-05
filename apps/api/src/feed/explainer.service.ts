import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

const MAX_ARTICLE_CHARS = 8000;
const FETCH_TIMEOUT_MS = 8000;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

@Injectable()
export class ExplainerService {
  private readonly logger = new Logger(ExplainerService.name);
  private readonly ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

  /** Best-effort: grounds the breakdown in the real article when we can fetch
   * it, falls back to the stored one-line summary when we can't (paywall,
   * bot-blocking, timeout, etc.) rather than failing the whole request. */
  private async fetchArticleText(url: string): Promise<string | null> {
    try {
      // Several sources (OpenAI's included) return a bot-block page to
      // requests without a browser-like User-Agent -- a real one is enough
      // to get past that on the sources we've checked, no headless browser
      // needed.
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      if (!res.ok) {
        this.logger.warn(`Article fetch for ${url} returned ${res.status}`);
        return null;
      }
      const html = await res.text();
      const text = stripHtml(html);
      return text.length > 200 ? text.slice(0, MAX_ARTICLE_CHARS) : null;
    } catch (err) {
      this.logger.warn(`Could not fetch article body for ${url}: ${(err as Error).message}`);
      return null;
    }
  }

  async explain(title: string, summary: string, source: string, url: string): Promise<string> {
    const articleText = await this.fetchArticleText(url);
    const model = this.ai.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });

    const grounding = articleText
      ? `Here is the actual article text (it may include site navigation or boilerplate mixed in -- ignore that, focus on the substance):\n"""${articleText}"""`
      : `Only a one-line summary is available: ${summary}`;

    const prompt = `You explain AI news to someone with no technical background, using only what's
actually said below -- don't invent details that aren't there.

Headline: "${title}"
Source: ${source}
${grounding}

Write a breakdown in plain language, no jargon. Use exactly this format, 1-2
short sentences per line:
What happened: <what was announced or found, concretely>
Why it matters: <the real-world implication>
Who it affects: <who benefits or is impacted>
Worth knowing: <one concrete detail, number, or caveat from the actual text -- omit this line if nothing further is genuinely available>`;

    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  }
}
