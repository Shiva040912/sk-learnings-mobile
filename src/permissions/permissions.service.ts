import { Injectable } from '@nestjs/common';

import { UsersService } from '../users/users.service';
import {
  PERMISSION_PAGES,
  PageKey,
  PermissionKind,
  PermissionsMap,
  buildDefaultTrainerPermissions,
  buildFullAccessPermissions,
  sanitizePermissions,
} from './permissions.constants';

export interface FieldGate {
  kind: PermissionKind;
  key: string;
  fields: string[];
}

@Injectable()
export class PermissionsService {
  constructor(
    private readonly usersService: UsersService,
  ) {}

  getCatalog() {
    return PERMISSION_PAGES;
  }

  // Admins are always full-access and never persist a permissions document
  // (the catalog is the only source of truth for what "full access" means).
  // Trainers created/edited through this feature always have a complete,
  // catalog-shaped permissions map stored (see UsersService); a trainer with
  // nothing stored at all predates this feature and gets the exact
  // restrictions Trainers always had, so existing accounts don't change
  // behavior until an admin explicitly reconfigures them.
  effectivePermissionsFor(user: {
    role?: string;
    permissions?: unknown;
  }): PermissionsMap {
    if (user.role === 'admin') {
      return buildFullAccessPermissions();
    }

    const hasStoredPermissions =
      user.permissions &&
      typeof user.permissions === 'object' &&
      Object.keys(user.permissions).length > 0;

    if (!hasStoredPermissions) {
      return buildDefaultTrainerPermissions();
    }

    return sanitizePermissions(user.permissions);
  }

  async effectivePermissionsForUserId(
    userId: string,
    role?: string,
  ): Promise<PermissionsMap> {
    if (role === 'admin') {
      return buildFullAccessPermissions();
    }

    const user =
      await this.usersService.getUserById(userId);

    return this.effectivePermissionsFor(user);
  }

  hasPageAccess(
    effective: PermissionsMap,
    page: PageKey,
  ): boolean {
    return effective[page]?.access === true;
  }

  can(
    effective: PermissionsMap,
    page: PageKey,
    kind: PermissionKind,
    key: string,
  ): boolean {
    if (!this.hasPageAccess(effective, page)) {
      return false;
    }

    return effective[page]?.[kind]?.[key] === true;
  }

  // Generalized version of the response-boundary field stripping this
  // codebase already does for fee data — strips `fields` for a page/kind/key
  // gate whenever that permission is off, leaving the object untouched
  // otherwise (admins always pass every gate, since their effective
  // permissions are all-true).
  pickAllowedFields<T extends Record<string, any>>(
    obj: T,
    effective: PermissionsMap,
    page: PageKey,
    gates: FieldGate[],
  ): Record<string, any> {
    const plain =
      typeof (obj as any).toObject === 'function'
        ? (obj as any).toObject()
        : obj;

    const result: Record<string, any> = {
      ...plain,
    };

    for (const gate of gates) {
      const allowed =
        effective[page]?.[gate.kind]?.[gate.key] ===
        true;

      if (!allowed) {
        for (const field of gate.fields) {
          delete result[field];
        }
      }
    }

    return result;
  }
}
