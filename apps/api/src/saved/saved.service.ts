import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

const DEFAULT_SAVED_LIMIT = 50;
const MAX_SAVED_LIMIT = 200;

@Injectable()
export class SavedService {
  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent -- clicking an already-filled bookmark icon (a double
   * click, or two tabs open on the same post) shouldn't error, it should
   * just leave the post saved. P2002 (the unique (userId, postId) pair
   * already exists) is exactly that case. P2003 (the FK target -- a bad
   * postId -- doesn't exist) becomes a clean 404 instead of a raw Prisma
   * error reaching the client. */
  async save(userId: string, postId: string): Promise<{ saved: true }> {
    try {
      await this.prisma.savedPost.create({ data: { userId, postId } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') return { saved: true };
        if (err.code === 'P2003') throw new NotFoundException(`No post with id "${postId}"`);
      }
      throw err;
    }
    return { saved: true };
  }

  /** Also idempotent -- deleteMany doesn't throw when nothing matches, so
   * unsaving something that was never saved (or was already removed by a
   * second tab) is a quiet no-op rather than an error. */
  async unsave(userId: string, postId: string): Promise<{ saved: false }> {
    await this.prisma.savedPost.deleteMany({ where: { userId, postId } });
    return { saved: false };
  }

  /** Lightweight membership check for the feed -- just the ids, so every
   * card's bookmark icon can render filled/unfilled without pulling full
   * post data twice (the feed already has it). */
  async listIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.savedPost.findMany({ where: { userId }, select: { postId: true } });
    return rows.map((r) => r.postId);
  }

  /** Full post data, most recently saved first -- what the account page's
   * "Saved posts" section actually renders. Capped: this was unbounded,
   * which is fine at 20 saved posts and progressively worse after that,
   * since it returns every field of every saved post in one response. */
  async list(userId: string, limit = DEFAULT_SAVED_LIMIT) {
    const take = Math.min(Math.max(limit, 1), MAX_SAVED_LIMIT);
    const rows = await this.prisma.savedPost.findMany({
      where: { userId },
      include: { post: true },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows.map((r) => ({ ...r.post, savedAt: r.createdAt }));
  }

  /** Total saved, so the UI can say "showing 50 of 214" rather than
   * silently truncating. */
  async count(userId: string): Promise<number> {
    return this.prisma.savedPost.count({ where: { userId } });
  }
}
