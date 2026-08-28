import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, IsArray, IsEnum } from 'class-validator';

export class CreateResourceDto {
  @IsString()
  @IsNotEmpty()
  category: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsArray()
  @IsOptional()
  hashtags?: string[];

  @IsBoolean()
  @IsOptional()
  isVip?: boolean;

  @IsBoolean()
  @IsOptional()
  isHot?: boolean;

  @IsString()
  @IsOptional()
  fileFormat?: string;

  @IsNumber()
  @IsOptional()
  rating?: number;

  @IsString()
  @IsOptional()
  size?: string;

  @IsString()
  @IsOptional()
  downloadType?: string; // "DIRECT" | "DRIVE"

  @IsString()
  @IsOptional()
  downloadUrl?: string;

  @IsString()
  @IsOptional()
  author?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsNumber()
  @IsOptional()
  order?: number;
}

export class UpdateResourceDto {
  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsOptional()
  hashtags?: string[];

  @IsBoolean()
  @IsOptional()
  isVip?: boolean;

  @IsBoolean()
  @IsOptional()
  isHot?: boolean;

  @IsString()
  @IsOptional()
  fileFormat?: string;

  @IsNumber()
  @IsOptional()
  rating?: number;

  @IsString()
  @IsOptional()
  size?: string;

  @IsString()
  @IsOptional()
  downloadType?: string;

  @IsString()
  @IsOptional()
  downloadUrl?: string;

  @IsString()
  @IsOptional()
  author?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsNumber()
  @IsOptional()
  order?: number;
}
