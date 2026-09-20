import { IsString, MaxLength, MinLength } from 'class-validator';

/** Body for `POST /api/v1/comments`. */
export class CreateCommentDto {
  @IsString()
  @MinLength(8)
  @MaxLength(280)
  body!: string;

  // episodeId accepted from body but enforced by guard/validator below
  // to allow the front-end to send a single payload.
  @IsString()
  @MinLength(1)
  episodeId!: string;
}
