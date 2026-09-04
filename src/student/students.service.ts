import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Readable } from 'stream';
import * as ExcelJS from 'exceljs';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import {
  Student,
  StudentDocument,
} from './students.schema';

import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { PaymentsService } from '../payments/payments.service';
import { AcademicService } from '../academic/academic.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PermissionsMap } from '../permissions/permissions.constants';
import {
  BULK_UPLOAD_COLUMNS,
  BULK_UPLOAD_EXAMPLE_ROWS,
  BULK_UPLOAD_INSTRUCTIONS,
} from './bulk-upload.constants';

export interface BulkUploadRowResult {
  row: number;
  studentName: string;
  status: 'valid' | 'duplicate' | 'invalid';
  reason: string;
  data: Record<string, any>;
}

@Injectable()
export class StudentsService {
  constructor(
    @InjectModel(Student.name)
    private readonly studentModel: Model<StudentDocument>,

    private readonly paymentsService: PaymentsService,
    private readonly academicService: AcademicService,
    private readonly permissionsService: PermissionsService,
  ) {}

  private normalizeParentName(parentName: string) {
    return parentName
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  private normalizeForCompare(value: string) {
    return value
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  private formatBatchLabel(batch: {
    batchName: string;
    startTime: string;
    endTime: string;
  }) {
    return `${batch.batchName} — ${batch.startTime} - ${batch.endTime}`;
  }

  // ExcelJS reports a cell's `.value` as a plain string/number/boolean for
  // simple cells, but as one of several wrapper shapes for anything richer
  // (rich text runs, formulas, hyperlinks, dates). Pasting data in from
  // another source — the normal way an admin builds a multi-row upload —
  // routinely produces rich-text cells, so every one of those shapes needs
  // to be unwrapped or the value is silently lost.
  private extractCellValue(value: any): any {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value !== 'object') {
      return value;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value.richText)) {
      return value.richText
        .map((run: any) => run?.text ?? '')
        .join('');
    }

    if ('result' in value) {
      return this.extractCellValue(value.result);
    }

    if (typeof value.text === 'string') {
      return value.text;
    }

    return '';
  }

  private async validateUniqueFields(
    data: {
      parentName?: string;
      rollNo?: string;
      phone?: string;
      alternatePhone?: string;
      email?: string;
      idproof?: string;
    },
    excludeStudentId?: string,
  ) {
    const excludeQuery = excludeStudentId
      ? {
          _id: {
            $ne: excludeStudentId,
          },
        }
      : {};

    if (data.rollNo) {
      const existingRollNo =
        await this.studentModel.findOne({
          ...excludeQuery,
          rollNo: data.rollNo.trim(),
        });

      if (existingRollNo) {
        throw new ConflictException(
          'Roll number already exists',
        );
      }
    }

    if (data.phone && data.parentName) {
      const existingStudents =
        await this.studentModel.find({
          ...excludeQuery,
          $or: [
            {
              phone: data.phone.trim(),
            },
            {
              alternatePhone: data.phone.trim(),
            },
          ],
        });

      const currentParent =
        this.normalizeParentName(
          data.parentName,
        );

      const differentParent =
        existingStudents.find(
          (existingStudent) =>
            this.normalizeParentName(
              existingStudent.parentName,
            ) !== currentParent,
        );

      if (differentParent) {
        throw new ConflictException(
          'Phone number is already registered with another parent',
        );
      }
    }

    if (
      data.phone &&
      data.alternatePhone &&
      data.phone.trim() ===
        data.alternatePhone.trim()
    ) {
      throw new ConflictException(
        'Phone number and alternative phone number cannot be the same',
      );
    }

    if (
      data.alternatePhone &&
      data.parentName
    ) {
      const existingStudents =
        await this.studentModel.find({
          ...excludeQuery,
          $or: [
            {
              phone:
                data.alternatePhone.trim(),
            },
            {
              alternatePhone:
                data.alternatePhone.trim(),
            },
          ],
        });

      const currentParent =
        this.normalizeParentName(
          data.parentName,
        );

      const differentParent =
        existingStudents.find(
          (existingStudent) =>
            this.normalizeParentName(
              existingStudent.parentName,
            ) !== currentParent,
        );

      if (differentParent) {
        throw new ConflictException(
          'Alternative phone number is already registered with another parent',
        );
      }
    }

    if (data.email) {
      const existingEmail =
        await this.studentModel.findOne({
          ...excludeQuery,
          email: data.email
            .trim()
            .toLowerCase(),
        });

      if (existingEmail) {
        throw new ConflictException(
          'Email ID already exists',
        );
      }
    }

    if (data.idproof) {
      const existingAadhaar =
        await this.studentModel.findOne({
          ...excludeQuery,
          idproof: data.idproof.trim(),
        });

      if (existingAadhaar) {
        throw new ConflictException(
          'Aadhaar number already exists',
        );
      }
    }
  }

  async create(
    createStudentDto: CreateStudentDto,
  ) {
    await this.validateUniqueFields({
      parentName:
        createStudentDto.parentName,

      rollNo:
        createStudentDto.rollNo,

      phone:
        createStudentDto.phone,

      alternatePhone:
        createStudentDto.alternatePhone,

      email:
        createStudentDto.email,

      idproof:
        createStudentDto.idproof,
    });

    const student = new this.studentModel({
      ...createStudentDto,

      studentName:
        createStudentDto.studentName.trim(),

      parentName:
        createStudentDto.parentName
          .trim()
          .replace(/\s+/g, ' '),

      rollNo:
        createStudentDto.rollNo.trim(),

      phone:
        createStudentDto.phone.trim(),

      alternatePhone:
        createStudentDto.alternatePhone
          ?.trim() || undefined,

      email:
        createStudentDto.email
          ?.trim()
          .toLowerCase() || undefined,

      course:
        createStudentDto.course.trim(),

      idproof:
        createStudentDto.idproof.trim(),

      paidAmount: 0,

      pendingAmount:
        createStudentDto.totalFee,

      paymentStatus: 'unpaid',

      paymentMethod: undefined,

      isActive: true,
    });

    return student.save();
  }

  async findAll() {
    return this.studentModel
      .find()
      .sort({ createdAt: -1 });
  }

  async findOne(id: string) {
    const student =
      await this.studentModel.findById(id);

    if (!student) {
      throw new NotFoundException(
        'Student not found',
      );
    }

    return student;
  }

  // Fee amounts (totalFee/paidAmount/pendingAmount) must never reach a
  // caller without the students.feeInfo permission — stripped here, at the
  // response boundary, rather than relying on the frontend to just not
  // render them. Driven by PermissionsService so admins (always full-access)
  // and trainers (per-trainer configured) both go through one code path.
  private omitFeeFields(
    student: StudentDocument,
    effective: PermissionsMap,
  ) {
    return this.permissionsService.pickAllowedFields(
      student,
      effective,
      'students',
      [
        {
          kind: 'sections',
          key: 'feeInfo',
          fields: [
            'totalFee',
            'paidAmount',
            'pendingAmount',
          ],
        },
      ],
    );
  }

  async findAllForRole(
    role?: string,
    userId?: string,
  ) {
    const students =
      await this.findAll();

    const effective =
      await this.permissionsService.effectivePermissionsForUserId(
        userId || '',
        role,
      );

    return students.map((student) =>
      this.omitFeeFields(student, effective),
    );
  }

  async findOneForRole(
    id: string,
    role?: string,
    userId?: string,
  ) {
    const student =
      await this.findOne(id);

    const effective =
      await this.permissionsService.effectivePermissionsForUserId(
        userId || '',
        role,
      );

    return this.omitFeeFields(
      student,
      effective,
    );
  }

  async update(
    id: string,
    updateStudentDto: UpdateStudentDto,
  ) {
    const student =
      await this.findOne(id);

    const previousPaymentStatus =
      student.paymentStatus;

    const {
      paymentMethod,
      paidAmount,
      pendingAmount,
      ...studentUpdateData
    } = updateStudentDto;

    const finalParentName =
      studentUpdateData.parentName ??
      student.parentName;

    const finalPhone =
      studentUpdateData.phone ??
      student.phone;

    const finalAlternatePhone =
      studentUpdateData.alternatePhone ??
      student.alternatePhone;

    if (
      finalPhone &&
      finalAlternatePhone &&
      finalPhone.trim() ===
        finalAlternatePhone.trim()
    ) {
      throw new ConflictException(
        'Phone number and alternative phone number cannot be the same',
      );
    }

    await this.validateUniqueFields(
      {
        parentName:
          finalParentName,

        rollNo:
          studentUpdateData.rollNo,

        phone:
          finalPhone,

        alternatePhone:
          finalAlternatePhone,

        email:
          studentUpdateData.email,

        idproof:
          studentUpdateData.idproof,
      },
      id,
    );

    const requestedPaymentStatus =
      updateStudentDto.paymentStatus;

    const isChangingToPaid =
      previousPaymentStatus !== 'paid' &&
      requestedPaymentStatus === 'paid';

    if (
      isChangingToPaid &&
      !paymentMethod
    ) {
      throw new BadRequestException(
        'Payment method is required when marking student as paid',
      );
    }

    if (
      paymentMethod &&
      ![
        'cash',
        'bank',
        'upi',
        'qr',
      ].includes(paymentMethod)
    ) {
      throw new BadRequestException(
        'Invalid payment method',
      );
    }

    if (
      studentUpdateData.studentName
    ) {
      studentUpdateData.studentName =
        studentUpdateData.studentName.trim();
    }

    if (
      studentUpdateData.parentName
    ) {
      studentUpdateData.parentName =
        studentUpdateData.parentName
          .trim()
          .replace(/\s+/g, ' ');
    }

    if (
      studentUpdateData.rollNo
    ) {
      studentUpdateData.rollNo =
        studentUpdateData.rollNo.trim();
    }

    if (
      studentUpdateData.phone
    ) {
      studentUpdateData.phone =
        studentUpdateData.phone.trim();
    }

    if (
      studentUpdateData.alternatePhone
    ) {
      studentUpdateData.alternatePhone =
        studentUpdateData.alternatePhone.trim();
    }

    if (
      studentUpdateData.email
    ) {
      studentUpdateData.email =
        studentUpdateData.email
          .trim()
          .toLowerCase();
    }

    if (
      studentUpdateData.course
    ) {
      studentUpdateData.course =
        studentUpdateData.course.trim();
    }

    if (
      studentUpdateData.idproof
    ) {
      studentUpdateData.idproof =
        studentUpdateData.idproof.trim();
    }

    const cleanStudentUpdateData =
      Object.fromEntries(
        Object.entries(
          studentUpdateData,
        ).filter(
          ([, value]) =>
            value !== undefined,
        ),
      );

    Object.assign(
      student,
      cleanStudentUpdateData,
    );

    if (requestedPaymentStatus === 'paid') {
      student.paidAmount =
        student.totalFee;

      if (paymentMethod) {
        student.paymentMethod =
          paymentMethod;
      }
    } else if (
      requestedPaymentStatus === 'unpaid'
    ) {
      student.paidAmount = 0;

      student.paymentMethod =
        undefined;
    }

    // A generic edit (e.g. editing name/phone/totalFee) does not
    // touch paymentStatus at all, so paidAmount is left as-is above
    // and payment fields are simply re-derived from it below —
    // this keeps a 'partial' balance intact across unrelated edits
    // and keeps pendingAmount in sync if totalFee itself changes.
    student.paidAmount = Math.min(
      Math.max(student.paidAmount || 0, 0),
      student.totalFee,
    );

    student.pendingAmount = Math.max(
      0,
      student.totalFee - student.paidAmount,
    );

    student.paymentStatus =
      student.paidAmount <= 0
        ? 'unpaid'
        : student.paidAmount >=
            student.totalFee
          ? 'paid'
          : 'partial';

    const updatedStudent =
      await student.save();

    if (isChangingToPaid) {
      await this.paymentsService.createPayment({
        studentId:
          updatedStudent._id.toString(),

        studentName:
          updatedStudent.studentName,

        phone:
          updatedStudent.phone,

        course:
          updatedStudent.course,

        amount:
          updatedStudent.totalFee,

        paymentMethod:
          paymentMethod as
            | 'cash'
            | 'bank'
            | 'upi'
            | 'qr',

        paymentProofImage:
          updatedStudent.paymentProofImage ||
          undefined,
      });
    }

    return updatedStudent;
  }

  async collectPayment(
    id: string,
    amount: number,
    paymentMethod?:
      | 'cash'
      | 'bank'
      | 'upi'
      | 'qr',
    role?: string,
    userId?: string,
  ) {
    const student =
      await this.findOne(id);

    const collectAmount =
      Number(amount);

    if (
      !Number.isFinite(
        collectAmount,
      ) ||
      collectAmount <= 0
    ) {
      throw new BadRequestException(
        'Enter a valid amount to collect',
      );
    }

    if (
      paymentMethod &&
      ![
        'cash',
        'bank',
        'upi',
        'qr',
      ].includes(paymentMethod)
    ) {
      throw new BadRequestException(
        'Invalid payment method',
      );
    }

    const currentPending = Math.max(
      0,
      student.totalFee -
        (student.paidAmount || 0),
    );

    if (currentPending <= 0) {
      throw new BadRequestException(
        'This student has already paid the full fee',
      );
    }

    if (collectAmount > currentPending) {
      throw new BadRequestException(
        role === 'admin'
          ? `Amount exceeds the pending balance of ₹${currentPending}`
          : 'Amount exceeds the pending balance for this student',
      );
    }

    student.paidAmount =
      (student.paidAmount || 0) +
      collectAmount;

    student.pendingAmount = Math.max(
      0,
      student.totalFee -
        student.paidAmount,
    );

    student.paymentStatus =
      student.paidAmount >=
      student.totalFee
        ? 'paid'
        : 'partial';

    if (paymentMethod) {
      student.paymentMethod =
        paymentMethod;
    }

    const updatedStudent =
      await student.save();

    await this.paymentsService.recordCollection(
      {
        studentId:
          updatedStudent._id.toString(),

        studentName:
          updatedStudent.studentName,

        phone:
          updatedStudent.phone,

        course:
          updatedStudent.course,

        amount: collectAmount,

        paymentMethod:
          paymentMethod ||
          updatedStudent.paymentMethod ||
          'upi',

        paymentProofImage:
          updatedStudent.paymentProofImage ||
          undefined,
      },
    );

    const effective =
      await this.permissionsService.effectivePermissionsForUserId(
        userId || '',
        role,
      );

    return this.omitFeeFields(
      updatedStudent,
      effective,
    );
  }

  async generateBulkUploadTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    const dataSheet = workbook.addWorksheet('Student Data');

    dataSheet.columns = BULK_UPLOAD_COLUMNS.map(
      (column) => ({
        header: column.header,
        key: column.field,
        width: 22,
      }),
    );

    dataSheet.getRow(1).font = {
      bold: true,
    };

    for (const example of BULK_UPLOAD_EXAMPLE_ROWS) {
      dataSheet.addRow(example);
    }

    const instructionsSheet =
      workbook.addWorksheet('Instructions');

    instructionsSheet.getColumn(1).width = 100;

    for (const line of BULK_UPLOAD_INSTRUCTIONS) {
      instructionsSheet.addRow(line);
    }

    instructionsSheet.getRow(1).font = {
      bold: true,
      size: 13,
    };

    const [officialCourses, officialBatches] =
      await Promise.all([
        this.academicService.getCourses(),
        this.academicService.getBatches(),
      ]);

    const optionsSheet = workbook.addWorksheet(
      'Course & Batch Options',
    );

    optionsSheet.columns = [
      { header: 'Course (copy exactly)', key: 'course', width: 30 },
      { header: 'Batch (copy exactly)', key: 'batch', width: 40 },
    ];

    optionsSheet.getRow(1).font = { bold: true };

    const optionRowCount = Math.max(
      officialCourses.length,
      officialBatches.length,
    );

    for (let i = 0; i < optionRowCount; i++) {
      optionsSheet.addRow({
        course: officialCourses[i]?.courseName || '',
        batch: officialBatches[i]
          ? this.formatBatchLabel(officialBatches[i])
          : '',
      });
    }

    const arrayBuffer =
      await workbook.xlsx.writeBuffer();

    return Buffer.from(arrayBuffer);
  }

  async parseBulkUploadFile(
    buffer: Buffer,
    originalName: string,
  ): Promise<Record<string, any>[]> {
    const isCsv = originalName
      .toLowerCase()
      .endsWith('.csv');

    const workbook = new ExcelJS.Workbook();

    try {
      if (isCsv) {
        await workbook.csv.read(
          Readable.from(buffer),
        );
      } else {
        await workbook.xlsx.load(
          buffer as any,
        );
      }
    } catch {
      throw new BadRequestException(
        'Unable to read the uploaded file. Please upload a valid .xlsx or .csv file exported from the template.',
      );
    }

    const sheet = workbook.worksheets[0];

    if (!sheet || sheet.rowCount < 1) {
      throw new BadRequestException(
        'The uploaded file has no data',
      );
    }

    const headerRow = sheet.getRow(1);
    const fieldByColumn: Record<number, string> = {};

    headerRow.eachCell(
      { includeEmpty: true },
      (cell, colNumber) => {
        const text = String(
          cell.value ?? '',
        ).trim().toLowerCase();

        const match = BULK_UPLOAD_COLUMNS.find(
          (column) =>
            column.header.toLowerCase() === text,
        );

        if (match) {
          fieldByColumn[colNumber] = match.field;
        }
      },
    );

    const foundFields = new Set(
      Object.values(fieldByColumn),
    );

    const missingRequired =
      BULK_UPLOAD_COLUMNS.filter(
        (column) =>
          column.required &&
          !foundFields.has(column.field),
      );

    if (missingRequired.length > 0) {
      throw new BadRequestException(
        `The uploaded file is missing required column(s): ${missingRequired
          .map((column) => column.header)
          .join(', ')}. Please use the provided template.`,
      );
    }

    const rows: Record<string, any>[] = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const rowData: Record<string, any> = {
        __row: rowNumber,
      };

      let hasAnyValue = false;

      for (const [colNumber, field] of Object.entries(
        fieldByColumn,
      )) {
        const value = this.extractCellValue(
          row.getCell(Number(colNumber)).value,
        );

        rowData[field] =
          typeof value === 'string'
            ? value.trim()
            : value;

        if (
          rowData[field] !== '' &&
          rowData[field] !== null &&
          rowData[field] !== undefined
        ) {
          hasAnyValue = true;
        }
      }

      if (hasAnyValue) {
        rows.push(rowData);
      }
    });

    if (rows.length === 0) {
      throw new BadRequestException(
        'No student rows found in the uploaded file',
      );
    }

    return rows;
  }

  private buildDtoPlainObject(
    raw: Record<string, any>,
  ) {
    const asString = (value: any) =>
      value === undefined || value === null
        ? ''
        : String(value).trim();

    const asOptionalString = (value: any) => {
      const text = asString(value);
      return text || undefined;
    };

    return {
      studentName: asString(raw.studentName),
      rollNo: asString(raw.rollNo),
      parentName: asString(raw.parentName),
      phone: asString(raw.phone),
      alternatePhone: asOptionalString(
        raw.alternatePhone,
      ),
      email: asOptionalString(
        raw.email,
      )?.toLowerCase(),
      course: asString(raw.course),
      idproof: asString(raw.idproof),
      batch: asOptionalString(raw.batch),
      schoolName: asOptionalString(
        raw.schoolName,
      ),
      address: asOptionalString(raw.address),
      totalFee:
        raw.totalFee === '' ||
        raw.totalFee === undefined ||
        raw.totalFee === null
          ? undefined
          : Number(raw.totalFee),
    };
  }

  async validateBulkUpload(
    rawRows: Record<string, any>[],
  ) {
    const seenRollNo = new Set<string>();
    const seenIdproof = new Set<string>();
    const seenEmail = new Set<string>();
    const phoneParentSeen = new Map<
      string,
      string
    >();

    const [officialCourses, officialBatches] =
      await Promise.all([
        this.academicService.getCourses(),
        this.academicService.getBatches(),
      ]);

    const validCourseNames = new Set(
      officialCourses.map((course) =>
        this.normalizeForCompare(course.courseName),
      ),
    );

    const validBatchLabels = new Set(
      officialBatches.map((batch) =>
        this.normalizeForCompare(
          this.formatBatchLabel(batch),
        ),
      ),
    );

    const results: BulkUploadRowResult[] = [];

    for (const raw of rawRows) {
      const plain = this.buildDtoPlainObject(raw);

      const displayName =
        plain.studentName || '(blank)';

      const dto = plainToInstance(
        CreateStudentDto,
        plain,
      );

      const errors = await validate(dto);

      if (errors.length > 0) {
        const reason = errors
          .map((error) =>
            Object.values(
              error.constraints || {},
            ).join('; '),
          )
          .filter(Boolean)
          .join('; ') || 'Invalid data';

        results.push({
          row: raw.__row,
          studentName: displayName,
          status: 'invalid',
          reason,
          data: plain,
        });

        continue;
      }

      if (
        !validCourseNames.has(
          this.normalizeForCompare(plain.course),
        )
      ) {
        results.push({
          row: raw.__row,
          studentName: displayName,
          status: 'invalid',
          reason: `Course "${plain.course}" does not match any course configured on the website`,
          data: plain,
        });

        continue;
      }

      if (
        plain.batch &&
        !validBatchLabels.has(
          this.normalizeForCompare(plain.batch),
        )
      ) {
        results.push({
          row: raw.__row,
          studentName: displayName,
          status: 'invalid',
          reason: `Batch "${plain.batch}" does not match any batch configured on the website`,
          data: plain,
        });

        continue;
      }

      const rollNoKey =
        plain.rollNo.toLowerCase();

      const idproofKey =
        plain.idproof.replace(/\s/g, '');

      if (seenRollNo.has(rollNoKey)) {
        results.push({
          row: raw.__row,
          studentName: displayName,
          status: 'duplicate',
          reason:
            'Duplicate inside uploaded file (Roll No)',
          data: plain,
        });

        continue;
      }

      if (seenIdproof.has(idproofKey)) {
        results.push({
          row: raw.__row,
          studentName: displayName,
          status: 'duplicate',
          reason:
            'Duplicate inside uploaded file (Aadhaar Number)',
          data: plain,
        });

        continue;
      }

      if (
        plain.email &&
        seenEmail.has(plain.email)
      ) {
        results.push({
          row: raw.__row,
          studentName: displayName,
          status: 'duplicate',
          reason:
            'Duplicate inside uploaded file (Email)',
          data: plain,
        });

        continue;
      }

      const normalizedParent =
        this.normalizeParentName(
          plain.parentName,
        );

      const previousParentForPhone =
        phoneParentSeen.get(plain.phone);

      if (
        previousParentForPhone &&
        previousParentForPhone !==
          normalizedParent
      ) {
        results.push({
          row: raw.__row,
          studentName: displayName,
          status: 'duplicate',
          reason:
            'Duplicate inside uploaded file (Phone already used with a different parent)',
          data: plain,
        });

        continue;
      }

      try {
        await this.validateUniqueFields({
          parentName: plain.parentName,
          rollNo: plain.rollNo,
          phone: plain.phone,
          alternatePhone: plain.alternatePhone,
          email: plain.email,
          idproof: plain.idproof,
        });
      } catch (error) {
        results.push({
          row: raw.__row,
          studentName: displayName,
          status: 'duplicate',
          reason:
            error instanceof Error
              ? error.message
              : 'Duplicate student',
          data: plain,
        });

        continue;
      }

      seenRollNo.add(rollNoKey);
      seenIdproof.add(idproofKey);

      if (plain.email) {
        seenEmail.add(plain.email);
      }

      phoneParentSeen.set(
        plain.phone,
        normalizedParent,
      );

      results.push({
        row: raw.__row,
        studentName: displayName,
        status: 'valid',
        reason: 'Ready to import',
        data: plain,
      });
    }

    return {
      summary: {
        totalRows: results.length,

        validRows: results.filter(
          (result) =>
            result.status === 'valid',
        ).length,

        duplicateRows: results.filter(
          (result) =>
            result.status === 'duplicate',
        ).length,

        invalidRows: results.filter(
          (result) =>
            result.status === 'invalid',
        ).length,
      },

      rows: results,
    };
  }

  async importBulkUpload(
    rows: Array<{
      row: number;
      data: Record<string, any>;
    }>,
  ) {
    let successCount = 0;
    let duplicateSkipped = 0;
    let invalidSkipped = 0;

    const skipped: Array<{
      row: number;
      studentName: string;
      reason: string;
    }> = [];

    for (const item of rows) {
      const data = item.data || {};
      const displayName =
        data.studentName || '(blank)';

      try {
        const dto = plainToInstance(
          CreateStudentDto,
          data,
        );

        const errors = await validate(dto);

        if (errors.length > 0) {
          invalidSkipped++;

          skipped.push({
            row: item.row,
            studentName: displayName,
            reason: 'Invalid data',
          });

          continue;
        }

        await this.create(dto);

        successCount++;
      } catch (error) {
        if (error instanceof ConflictException) {
          duplicateSkipped++;
        } else {
          invalidSkipped++;
        }

        skipped.push({
          row: item.row,
          studentName: displayName,
          reason:
            error instanceof Error
              ? error.message
              : 'Failed to import this row',
        });
      }
    }

    return {
      totalRows: rows.length,
      successCount,
      duplicateSkipped,
      invalidSkipped,
      skipped,
    };
  }

  async remove(id: string) {
    const student =
      await this.studentModel.findByIdAndDelete(
        id,
      );

    if (!student) {
      throw new NotFoundException(
        'Student not found',
      );
    }

    return {
      message:
        'Student deleted successfully',
    };
  }
}