// Single source of truth for the permission system: which pages exist and
// which actions/columns/sections each one exposes. The DTO validator, the
// guard, the default-preset generator and the frontend Trainer permission
// UI all read from this one catalog — adding a future page (attendance,
// courses, reports, ...) means adding one entry here, nothing else.

export interface PageCatalogEntry {
  label: string;
  actions: string[];
  columns: string[];
  sections: string[];
}

export const PERMISSION_PAGES = {
  students: {
    label: 'Students',
    actions: ['view', 'add', 'edit', 'delete'],
    columns: ['name', 'rollNo', 'phone', 'course', 'totalFee'],
    sections: ['identityDetails', 'feeInfo'],
  },
  payments: {
    label: 'Payments',
    actions: ['view', 'collect', 'viewDetails'],
    columns: ['name', 'rollNo', 'phone', 'course', 'totalFee', 'status'],
    sections: ['summary', 'feeBreakdown'],
  },
} as const satisfies Record<string, PageCatalogEntry>;

export type PageKey = keyof typeof PERMISSION_PAGES;
export type PermissionKind = 'actions' | 'columns' | 'sections';

export const PAGE_KEYS = Object.keys(
  PERMISSION_PAGES,
) as PageKey[];

export interface PagePermission {
  access: boolean;
  actions: Record<string, boolean>;
  columns: Record<string, boolean>;
  sections: Record<string, boolean>;
}

export type PermissionsMap = Record<PageKey, PagePermission>;

function buildPage(
  page: PageKey,
  value: boolean,
): PagePermission {
  const catalog = PERMISSION_PAGES[page];

  const toFlags = (keys: readonly string[]) =>
    Object.fromEntries(
      keys.map((key) => [key, value]),
    );

  return {
    access: value,
    actions: toFlags(catalog.actions),
    columns: toFlags(catalog.columns),
    sections: toFlags(catalog.sections),
  };
}

export function buildFullAccessPermissions(): PermissionsMap {
  return Object.fromEntries(
    PAGE_KEYS.map((page) => [
      page,
      buildPage(page, true),
    ]),
  ) as PermissionsMap;
}

export function buildEmptyPermissions(): PermissionsMap {
  return Object.fromEntries(
    PAGE_KEYS.map((page) => [
      page,
      buildPage(page, false),
    ]),
  ) as PermissionsMap;
}

// Mirrors exactly what every Trainer could already do before this
// permission system existed — new trainers created without an explicit
// `permissions` payload, and any trainer saved before this feature shipped,
// get this preset so behavior never silently changes.
export const LEGACY_TRAINER_PERMISSIONS: PermissionsMap = {
  students: {
    access: true,
    actions: {
      view: true,
      add: false,
      edit: false,
      delete: false,
    },
    columns: {
      name: true,
      rollNo: true,
      phone: true,
      course: true,
      totalFee: false,
    },
    sections: {
      identityDetails: true,
      feeInfo: false,
    },
  },
  payments: {
    access: true,
    actions: {
      view: true,
      collect: true,
      viewDetails: false,
    },
    columns: {
      name: true,
      rollNo: true,
      phone: true,
      course: true,
      totalFee: false,
      status: true,
    },
    sections: {
      summary: false,
      feeBreakdown: false,
    },
  },
};

export function buildDefaultTrainerPermissions(): PermissionsMap {
  return JSON.parse(
    JSON.stringify(LEGACY_TRAINER_PERMISSIONS),
  );
}

// Clamps arbitrary input (a request body, a stored document that predates a
// catalog change) down to exactly the pages/actions/columns/sections the
// catalog currently declares, defaulting anything missing/unknown to false.
// This is the only place permission data is trusted to leave "shape
// unknown" — everything downstream can assume a complete, catalog-shaped map.
export function sanitizePermissions(
  input: unknown,
): PermissionsMap {
  const raw =
    input && typeof input === 'object'
      ? (input as Record<string, any>)
      : {};

  const result = {} as PermissionsMap;

  for (const page of PAGE_KEYS) {
    const catalog = PERMISSION_PAGES[page];
    const rawPage = raw[page] || {};

    const sanitizeFlags = (
      keys: readonly string[],
      rawFlags: any,
    ) => {
      const source =
        rawFlags && typeof rawFlags === 'object'
          ? rawFlags
          : {};

      return Object.fromEntries(
        keys.map((key) => [
          key,
          source[key] === true,
        ]),
      );
    };

    result[page] = {
      access: rawPage.access === true,
      actions: sanitizeFlags(
        catalog.actions,
        rawPage.actions,
      ),
      columns: sanitizeFlags(
        catalog.columns,
        rawPage.columns,
      ),
      sections: sanitizeFlags(
        catalog.sections,
        rawPage.sections,
      ),
    };
  }

  return result;
}
