import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GeminiQuotaService } from '../gemini/gemini-quota.service.js';

export interface SummaryAndClassification {
  summary: string;
  isMajor: boolean;
}

// What "MAJOR" means for this feed -- deliberately about the news itself,
// not the headline's wording. A keyword check on the title (the previous
// approach) missed real launches whose copy avoids formulaic words like
// "launch"/"announcing" (e.g. "GPT-6 Astra: A new generation of
// intelligence"), and would just as easily flag a routine post that happens
// to use one of those words. Judging the actual content is worth the same
// Gemini call we're already making for the summary -- no extra quota spent.
const MAJOR_CRITERIA = `Whether this is MAJOR: a genuinely big deal for the AI field -- a new flagship model or product launch, a landmark research result, or a large-scale deal/funding announcement. Routine posts (a case study of an existing product, an incremental blog update, a minor research note, an internal culture post) are NOT major, even from a top lab.`;

@Injectable()
export class SummarizeService {
  private readonly ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

  constructor(private readonly quota: GeminiQuotaService) {}

  /** One Gemini call, used during ingestion: produces the plain-language
   * summary and the majority judgment together, so accuracy doesn't cost an
   * extra API call against the 15-req/min free-tier quota. */
  async summarizeAndClassify(title: string, sourceTier: number): Promise<SummaryAndClassification> {
    // Throwing (rather than returning a placeholder) is deliberate: the
    // source agent treats a failure as "leave this item unclaimed", so the
    // story is picked up by a later run instead of being stored with a
    // fabricated summary.
    if (!(await this.quota.tryConsume('ingestion'))) {
      throw new ServiceUnavailableException("Daily Gemini budget for ingestion is spent -- this item waits for tomorrow's runs.");
    }

    const model = this.ai.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });
    const prompt = `You are labeling one item for an AI news feed. Given the headline below, answer two things:
1. A one-sentence, plain-language summary of what it means for a non-technical reader (no jargon).
2. ${MAJOR_CRITERIA}

Headline: "${title}"

Respond in exactly this format, nothing else:
SUMMARY: <one sentence>
MAJOR: <yes or no>`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim();
    const summaryMatch = raw.match(/SUMMARY:\s*(.+)/i);
    const majorMatch = raw.match(/MAJOR:\s*(yes|no)/i);

    // Tier gate is a product decision, not a model judgment -- only the
    // flagship-lab sources are eligible for the MAJOR badge at all, even if
    // the model thinks a smaller source's post reads as significant.
    const isMajor = sourceTier === 1 && majorMatch?.[1]?.toLowerCase() === 'yes';
    // If parsing fails outright (model ignored the format), fall back to the
    // raw text as the summary rather than surfacing nothing.
    const summary = summaryMatch?.[1]?.trim() || raw;

    return { summary, isMajor };
  }

  /** Cheaper re-judgment used for backfilling already-ingested posts: reuses
   * the existing summary instead of regenerating it, one Gemini call each. */
  async classifyOnly(title: string, summary: string, sourceTier: number): Promise<boolean> {
    if (sourceTier !== 1) return false;
    const model = this.ai.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });
    const prompt = `You are labeling one item for an AI news feed.

Headline: "${title}"
Summary: "${summary}"

${MAJOR_CRITERIA}

Respond with exactly one word: yes or no.`;

    const result = await model.generateContent(prompt);
    const raw = result.response.text().trim().toLowerCase();
    return raw.startsWith('yes');
  }
}
