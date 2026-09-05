import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class ExplainerService {
  private readonly ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

  async explain(title: string, summary: string, source: string): Promise<string> {
    const model = this.ai.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });
    const prompt = `You explain AI news to someone with no technical background.

Headline: "${title}"
Source: ${source}
One-line summary: ${summary}

Write a short breakdown in plain language, no jargon. Use exactly this format,
each line short (one sentence):
What happened: <one sentence>
Why it matters: <one sentence>
Worth knowing: <one short, concrete detail or caveat>`;

    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  }
}
