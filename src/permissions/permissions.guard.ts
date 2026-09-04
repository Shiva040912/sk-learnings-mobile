import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PermissionsService } from './permissions.service';
import {
  PERMISSION_METADATA_KEY,
  RequiredPermission,
} from './permissions.decorator';

// Runs after JwtAuthGuard (req.user is already populated). Admins always
// pass. A route with no @RequirePageAccess/@RequirePermission decorator is
// left alone — this guard is opt-in per route, so routes using the existing
// admin-only ensureAdministrator() pattern are unaffected by adding it to a
// controller's guard list.
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const required =
      this.reflector.get<RequiredPermission>(
        PERMISSION_METADATA_KEY,
        context.getHandler(),
      );

    if (!required) {
      return true;
    }

    const req = context
      .switchToHttp()
      .getRequest();

    const user = req.user;

    if (!user) {
      return false;
    }

    if (user.role === 'admin') {
      return true;
    }

    const effective =
      await this.permissionsService.effectivePermissionsForUserId(
        user.userId,
        user.role,
      );

    const allowed =
      required.kind === 'access'
        ? this.permissionsService.hasPageAccess(
            effective,
            required.page,
          )
        : this.permissionsService.can(
            effective,
            required.page,
            required.kind,
            required.key!,
          );

    if (!allowed) {
      throw new ForbiddenException(
        'You do not have permission to perform this action',
      );
    }

    return true;
  }
}
