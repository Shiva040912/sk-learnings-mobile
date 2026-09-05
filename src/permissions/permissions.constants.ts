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
    actions: ['add', 'edit', 'delete'],
    columns: ['name', 'rollNo', 'course', 'phone'],
    // Student Details popup fields — deliberately separate from `columns`
    // (the table). Student Name / Roll No / Course are always visible in
    // the popup and are not listed here at all.
    sections: ['address', 'phoneNumber', 'aadhar'],
  },
  payments: {
    label: 'Payments',
    // 'editFee' gates Add Fee / Edit Fee (generating a fee cycle and
    // correcting the active one). 'proofNotification' gates the red
    // "new screenshot waiting" dot on the Proof column.
    actions: ['view', 'collect', 'viewDetails', 'editFee', 'proofNotification'],
    columns: ['name', 'rollNo', 'phone', 'course', 'totalFee', 'status', 'proof'],
    sections: ['summary', 'feeBreakdown'],
  },
  // Manages other accounts (create/edit/delete Trainers, and — for a
  // Trainer explicitly granted this — other Trainers too). See
  // UsersService for the one hard rule this doesn't relax: touching an
  // existing admin account, or creating a new one, always still requires
  // the caller to actually be an admin, regardless of this permission.
  users: {
    label: 'Users',
    actions: ['add', 'edit', 'delete'],
    columns: [],
    sections: [],
  },
  // The standalone Settings page (Course & Batch, Payment, Reminders
  // tabs). Payment/due-date settings are also surfaced on the Payments
  // page itself and stay gated by 'payments' access there, not this flag
  // — this only gates the dedicated Settings page and its Trainer-facing
  // sidebar link.
  settings: {
    label: 'Settings',
    actions: [],
    columns: [],
    sections: [],
  },
} as const satisfies Record<string, PageCatalogEntry>;

export type PageKey = keyof typeof PERMISSION_PAGES;
export type PermissionKind = 'actions' | 'columns' | 'sections';

export const PAGE_KEYS = Object.keys(
  PERMISSION_PAGES,
) as PageKey[];

// Permissions that aren't scoped to a single page — "Fees" controls whether
// fee-related data (amounts, balances, fee cards/columns/sections) is
// visible anywhere in the app. Today that's just the Students page; the
// same flag will gate the Payments page once that's built, so it lives
// here rather than nested under `students`.
export const GLOBAL_PERMISSIONS = {
  fees: {
    label: 'Fees',
  },
} as const;

export type GlobalKey = keyof typeof GLOBAL_PERMISSIONS;

export const GLOBAL_KEYS = Object.keys(
  GLOBAL_PERMISSIONS,
) as GlobalKey[];

export interface PagePermission {
  access: boolean;
  actions: Record<string, boolean>;
  columns: Record<string, boolean>;
  sections: Record<string, boolean>;
}

export type PermissionsMap = Record<PageKey, PagePermission> &
  Record<GlobalKey, boolean>;

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

function buildGlobalFlags(
  value: boolean,
): Record<GlobalKey, boolean> {
  return Object.fromEntries(
    GLOBAL_KEYS.map((key) => [key, value]),
  ) as Record<GlobalKey, boolean>;
}

export function buildFullAccessPermissions(): PermissionsMap {
  return {
    ...buildGlobalFlags(true),
    ...Object.fromEntries(
      PAGE_KEYS.map((page) => [
        page,
        buildPage(page, true),
      ]),
    ),
  } as PermissionsMap;
}

export function buildEmptyPermissions(): PermissionsMap {
  return {
    ...buildGlobalFlags(false),
    ...Object.fromEntries(
      PAGE_KEYS.map((page) => [
        page,
        buildPage(page, false),
      ]),
    ),
  } as PermissionsMap;
}

// Mirrors exactly what every Trainer could already do before this
// permission system existed — new trainers created without an explicit
// `permissions` payload, and any trainer saved before this feature shipped,
// get this preset so behavior never silently changes.
export const LEGACY_TRAINER_PERMISSIONS: PermissionsMap = {
  // Matches the old students.sections.feeInfo default (off) this global
  // flag replaces — legacy trainers didn't see fee data, so they still don't.
  fees: false,
  students: {
    access: true,
    actions: {
      add: false,
      edit: false,
      delete: false,
    },
    columns: {
      name: true,
      rollNo: true,
      course: true,
      phone: true,
    },
    sections: {
      address: true,
      phoneNumber: true,
      aadhar: true,
    },
  },
  payments: {
    access: true,
    actions: {
      view: true,
      collect: true,
      viewDetails: false,
      // New actions: default off. Legacy trainers already couldn't do
      // either of these (fee editing rode on 'collect' before it had its
      // own permission, and no trainer ever saw the proof notification
      // dot), so 'false' here is a no-op for existing accounts, not a
      // new restriction.
      editFee: false,
      proofNotification: false,
    },
    columns: {
      name: true,
      rollNo: true,
      phone: true,
      course: true,
      totalFee: false,
      status: true,
      // Matches the Proof column's previous behavior — it was always
      // rendered, ungated by any permission, so 'true' here preserves
      // exactly what legacy trainers could already see.
      proof: true,
    },
    sections: {
      summary: false,
      feeBreakdown: false,
    },
  },
  // Both new pages default fully off — legacy trainers never had a Users
  // or Settings link before, so 'false' here is a no-op, not a new
  // restriction. An admin explicitly opts a Trainer into either from the
  // Users page.
  users: {
    access: false,
    actions: {
      add: false,
      edit: false,
      delete: false,
    },
    columns: {},
    sections: {},
  },
  settings: {
    access: false,
    actions: {},
    columns: {},
    sections: {},
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

  for (const key of GLOBAL_KEYS) {
    result[key] = raw[key] === true;
  }

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
