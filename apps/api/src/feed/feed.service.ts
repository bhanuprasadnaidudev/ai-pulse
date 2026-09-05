import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

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
  constructor(private readonly prisma: PrismaService) {}

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
}
