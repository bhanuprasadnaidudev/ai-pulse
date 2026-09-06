import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { SavedService } from './saved.service.js';

// Every route here is inherently personal -- there's no meaningful public
// version of "my saved posts" -- so the guard sits at the class level,
// unlike AuthController's selective per-method use.
@Controller('saved')
@UseGuards(AuthGuard)
export class SavedController {
  constructor(private readonly saved: SavedService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.saved.list(user.id);
  }

  @Get('ids')
  listIds(@CurrentUser() user: User) {
    return this.saved.listIds(user.id);
  }

  @Post(':postId')
  save(@CurrentUser() user: User, @Param('postId') postId: string) {
    return this.saved.save(user.id, postId);
  }

  @Delete(':postId')
  unsave(@CurrentUser() user: User, @Param('postId') postId: string) {
    return this.saved.unsave(user.id, postId);
  }
}
