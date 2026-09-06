import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

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
   * "Saved posts" section actually renders. */
  async list(userId: string) {
    const rows = await this.prisma.savedPost.findMany({
      where: { userId },
      include: { post: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({ ...r.post, savedAt: r.createdAt }));
  }
}
