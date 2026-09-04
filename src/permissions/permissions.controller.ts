import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';

import { PermissionsService } from './permissions.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(
    private readonly permissionsService: PermissionsService,
    private readonly usersService: UsersService,
  ) {}

  private ensureAdministrator(role?: string) {
    if (role !== 'admin') {
      throw new ForbiddenException(
        'Administrator access required',
      );
    }
  }

  // Used only to render the Trainer permission editor in the Users page.
  @Get('catalog')
  getCatalog(@Req() req: any) {
    this.ensureAdministrator(req.user?.role);

    return this.permissionsService.getCatalog();
  }

  // Resolves a trainer's *effective* permissions (falling back to the
  // legacy preset for a trainer with nothing explicitly configured yet) so
  // the edit form shows what the trainer can actually do today, not a
  // possibly-empty raw document.
  @Get('effective/:userId')
  async getEffectiveForUser(
    @Req() req: any,
    @Param('userId') userId: string,
  ) {
    this.ensureAdministrator(req.user?.role);

    const user =
      await this.usersService.getUserById(userId);

    return this.permissionsService.effectivePermissionsFor(
      user,
    );
  }
}
