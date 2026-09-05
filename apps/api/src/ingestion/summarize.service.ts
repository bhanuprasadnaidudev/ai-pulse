import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class SummarizeService {
  private readonly ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

  async summarize(title: string): Promise<string> {
    const model = this.ai.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });
    const prompt = `In one plain-language sentence (no jargon), summarize what this AI news headline likely means for someone non-technical: "${title}"`;
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  }
}
