import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/** Body for `POST /api/v1/auth/login`. */
export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
