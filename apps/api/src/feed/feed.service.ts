import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ExplainerService } from './explainer.service.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const TRENDING_WINDOW_DAYS = 7;
const TRENDING_LIMIT = 6;

function parseDateOrThrow(value: string, paramName: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`Invalid ${paramName}: "${value}"`);
  }
  return date;
}

/** `source` is a comma-separated list from the query string -- multi-select
 * on the frontend's filter checkboxes. */
function sourceWhere(source?: string): Prisma.PostWhereInput {
  if (!source) return {};
  const sources = source
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return sources.length ? { source: { in: sources } } : {};
}

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly explainer: ExplainerService,
  ) {}

  async getFeed(before?: string, limit?: string, source?: string) {
    const take = limit ? Math.min(Math.max(parseInt(limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT) : DEFAULT_LIMIT;

    return this.prisma.post.findMany({
      where: {
        ...(before ? { publishedAt: { lt: parseDateOrThrow(before, 'before') } } : {}),
        ...sourceWhere(source),
      },
      orderBy: { publishedAt: 'desc' },
      take,
    });
  }

  async getByDate(date: string, source?: string) {
    const start = parseDateOrThrow(`${date}T00:00:00.000Z`, 'date');
    const end = parseDateOrThrow(`${date}T23:59:59.999Z`, 'date');

    return this.prisma.post.findMany({
      where: {
        publishedAt: { gte: start, lte: end },
        ...sourceWhere(source),
      },
      orderBy: { publishedAt: 'desc' },
    });
  }

  async search(q: string, before?: string, limit?: string, source?: string) {
    const take = limit ? Math.min(Math.max(parseInt(limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT) : DEFAULT_LIMIT;

    return this.prisma.post.findMany({
      where: {
        ...(before ? { publishedAt: { lt: parseDateOrThrow(before, 'before') } } : {}),
        ...sourceWhere(source),
        OR: [
          { title: { contains: q, mode: Prisma.QueryMode.insensitive } },
          { summary: { contains: q, mode: Prisma.QueryMode.insensitive } },
        ],
      },
      orderBy: { publishedAt: 'desc' },
      take,
    });
  }

  async getSources(): Promise<string[]> {
    const rows = await this.prisma.post.findMany({
      distinct: ['source'],
      select: { source: true },
      orderBy: { source: 'asc' },
    });
    return rows.map((r) => r.source);
  }

  /** Lightweight "trending" -- this week's MAJOR-flagged posts (already the
   * signal we compute at ingestion time), newest first. Not a real topic
   * clustering system -- see docs/research/topic-of-the-week.md for what a
   * fuller version would take. */
  async getTrending() {
    const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    return this.prisma.post.findMany({
      where: { isMajor: true, publishedAt: { gte: since } },
      orderBy: { publishedAt: 'desc' },
      take: TRENDING_LIMIT,
      select: { id: true, title: true, source: true, publishedAt: true },
    });
  }

  async hasUpdates(since: string) {
    const sinceDate = parseDateOrThrow(since, 'since');

    const [majorCount, totalCount] = await Promise.all([
      this.prisma.post.count({ where: { publishedAt: { gt: sinceDate }, isMajor: true } }),
      this.prisma.post.count({ where: { publishedAt: { gt: sinceDate } } }),
    ]);

    return { major: majorCount > 0, count: totalCount };
  }

  async getDetail(id: string): Promise<{ detail: string; cached: boolean }> {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) {
      throw new NotFoundException(`No post with id "${id}"`);
    }

    if (post.detailBreakdown) {
      return { detail: post.detailBreakdown, cached: true };
    }

    const detail = await this.explainer.explain(post.title, post.summary, post.source, post.url);
    await this.prisma.post.update({ where: { id }, data: { detailBreakdown: detail } });

    return { detail, cached: false };
  }
}
