import { SetMetadata } from '@nestjs/common';

import { PageKey, PermissionKind } from './permissions.constants';

export const PERMISSION_METADATA_KEY = 'permission';

export interface RequiredPermission {
  page: PageKey;
  kind: PermissionKind | 'access';
  key?: string;
}

// Marks a route as requiring page access only.
export const RequirePageAccess = (page: PageKey) =>
  SetMetadata(PERMISSION_METADATA_KEY, {
    page,
    kind: 'access',
  } satisfies RequiredPermission);

// Marks a route as requiring a specific action/column/section to be on
// (which also implies page access — see PermissionsGuard).
export const RequirePermission = (
  page: PageKey,
  kind: PermissionKind,
  key: string,
) =>
  SetMetadata(PERMISSION_METADATA_KEY, {
    page,
    kind,
    key,
  } satisfies RequiredPermission);
