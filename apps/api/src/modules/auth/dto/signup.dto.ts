import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Body for `POST /api/v1/auth/signup`.
 *
 * Email is normalised to lowercase before hashing to avoid duplicate
 * accounts like `Foo@…` vs `foo@…`. Username is constrained to a
 * URL-safe slug so it can show up in profile URLs without further
 * encoding.
 */
export class SignupDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(32)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'username may only contain a-z, 0-9, and underscore',
  })
  username!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  displayName!: string;
}
