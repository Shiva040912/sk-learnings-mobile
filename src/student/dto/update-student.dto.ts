import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  studentName?: string;

  @IsOptional()
  @IsString()
  rollNo?: string;

  @IsOptional()
  @IsString()
  parentName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[6-9]\d{4} \d{5}$/, {
    message:
      'Phone number must be in 98789 89789 format and start with 6, 7, 8 or 9',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[6-9]\d{4} \d{5}$/, {
    message:
      'Alternative phone number must be in 98789 89789 format and start with 6, 7, 8 or 9',
  })
  alternatePhone?: string;

  @IsOptional()
  @IsEmail(
    {},
    {
      message: 'Please enter a valid email address',
    },
  )
  email?: string;

  @IsOptional()
  @IsString()
  course?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4} \d{4} \d{4}$/, {
    message:
      'Aadhaar number must be in 1234 5678 9878 format',
  })
  idproof?: string;

  @IsOptional()
  @IsString()
  batch?: string;

  @IsOptional()
  @IsString()
  schoolName?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}