import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class CreateStudentDto {
  @IsString()
  @IsNotEmpty()
  studentName!: string;

  @IsString()
  @IsNotEmpty()
  rollNo!: string;

  @IsString()
  @IsNotEmpty()
  parentName!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[6-9]\d{4} \d{5}$/, {
    message:
      'Phone number must be in 98789 89789 format and start with 6, 7, 8 or 9',
  })
  phone!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[6-9]\d{4} \d{5}$/, {
    message:
      'Alternative phone number must be in 98789 89789 format and start with 6, 7, 8 or 9',
  })
  alternatePhone?: string;

  @IsOptional()
  @IsEmail({}, {
    message: 'Please enter a valid email address',
  })
  email?: string;

  @IsString()
  @IsNotEmpty()
  course!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4} \d{4} \d{4}$/, {
    message:
      'Aadhaar number must be in 1234 5678 9878 format',
  })
  idproof!: string;

  @IsOptional()
  @IsString()
  batch?: string;

  @IsOptional()
  @IsString()
  schoolName?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsNumber()
  @Min(0)
  totalFee!: number;
}