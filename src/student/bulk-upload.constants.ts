// Single source of truth for the bulk-upload template's columns, shared
// by both the template generator and the upload parser so the two can
// never drift apart.

export interface BulkUploadColumn {
  header: string;
  field:
    | 'studentName'
    | 'rollNo'
    | 'parentName'
    | 'phone'
    | 'alternatePhone'
    | 'email'
    | 'course'
    | 'idproof'
    | 'batch'
    | 'schoolName'
    | 'address';
  required: boolean;
}

export const BULK_UPLOAD_COLUMNS: BulkUploadColumn[] = [
  { header: 'Student Name *', field: 'studentName', required: true },
  { header: 'Roll No *', field: 'rollNo', required: true },
  { header: 'Parent Name *', field: 'parentName', required: true },
  { header: 'Phone *', field: 'phone', required: true },
  { header: 'Alternate Phone', field: 'alternatePhone', required: false },
  { header: 'Email', field: 'email', required: false },
  { header: 'Course *', field: 'course', required: true },
  { header: 'Aadhaar Number *', field: 'idproof', required: true },
  { header: 'Batch', field: 'batch', required: false },
  { header: 'School Name', field: 'schoolName', required: false },
  { header: 'Address', field: 'address', required: false },
];

export const BULK_UPLOAD_EXAMPLE_ROWS: Record<string, string | number>[] = [
  {
    studentName: 'Arun Kumar',
    rollNo: 'SK-LN-101',
    parentName: 'Suresh Kumar',
    phone: '98765 43210',
    alternatePhone: '',
    email: 'arun.kumar@example.com',
    course: 'NEET',
    idproof: '1234 5678 9012',
    batch: 'Morning — 10:00 AM - 1:00 PM',
    schoolName: 'St. Xavier School',
    address: '12, Gandhi Street, Chennai',
  },
  {
    studentName: 'Divya Ramesh',
    rollNo: 'SK-LN-102',
    parentName: 'Ramesh Babu',
    phone: '87654 32109',
    alternatePhone: '98123 45678',
    email: '',
    course: 'JEE',
    idproof: '9876 5432 1098',
    batch: '',
    schoolName: '',
    address: '',
  },
];

export const BULK_UPLOAD_INSTRUCTIONS: string[][] = [
  ['SK Learnings — Bulk Student Upload Instructions'],
  [''],
  ['1. Required fields (must not be left blank):'],
  ['   Student Name, Roll No, Parent Name, Phone, Course, Aadhaar Number'],
  [''],
  ['2. Optional fields:'],
  ['   Alternate Phone, Email, Batch, School Name, Address'],
  [''],
  ['3. Expected formats:'],
  ['   Phone / Alternate Phone : 10 digits starting with 6-9, written as "98765 43210"'],
  ['   Aadhaar Number          : 12 digits written as "1234 5678 9012"'],
  ['   Email                   : a valid email address, e.g. name@example.com'],
  [''],
  ['4. Fees are not part of this upload — generate each student\'s fee from the Payments'],
  ['   page after importing them.'],
  [''],
  ['5. Course and Batch must exactly match a course/batch already configured on the website'],
  ['   (Settings > Academic). See the "Course & Batch Options" sheet in this file for the exact,'],
  ['   copy-pasteable values — any row with an unrecognized Course or Batch is rejected as invalid.'],
  ['   Batch is optional, but if provided it must match one of the listed options.'],
  [''],
  ['6. Duplicate rules (a row is rejected if it matches an EXISTING student, or an earlier row in this same file):'],
  ['   - Roll No must be unique'],
  ['   - Aadhaar Number must be unique'],
  ['   - Email must be unique (if provided)'],
  ['   - The same Phone number is only allowed to repeat across rows that share the same Parent Name'],
  [''],
  ['7. Supported file formats: .xlsx and .csv'],
  ['   (legacy .xls files are not supported — please save/export as .xlsx first)'],
  [''],
  ['8. Do not rename, remove, or reorder the column headers on the "Student Data" sheet.'],
  ['   Remove the two example rows before uploading your real data.'],
];
