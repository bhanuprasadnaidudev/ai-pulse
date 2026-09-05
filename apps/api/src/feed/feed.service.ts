import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { ExplainerService } from './explainer.service.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function parseDateOrThrow(value: string, paramName: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`Invalid ${paramName}: "${value}"`);
  }
  return date;
}

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly explainer: ExplainerService,
  ) {}

  async getFeed(before?: string, limit?: string) {
    const take = limit ? Math.min(Math.max(parseInt(limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT) : DEFAULT_LIMIT;

    return this.prisma.post.findMany({
      where: before ? { publishedAt: { lt: parseDateOrThrow(before, 'before') } } : undefined,
      orderBy: { publishedAt: 'desc' },
      take,
    });
  }

  async getByDate(date: string) {
    const start = parseDateOrThrow(`${date}T00:00:00.000Z`, 'date');
    const end = parseDateOrThrow(`${date}T23:59:59.999Z`, 'date');

    return this.prisma.post.findMany({
      where: { publishedAt: { gte: start, lte: end } },
      orderBy: { publishedAt: 'desc' },
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

    const detail = await this.explainer.explain(post.title, post.summary, post.source);
    await this.prisma.post.update({ where: { id }, data: { detailBreakdown: detail } });

    return { detail, cached: false };
  }
}
