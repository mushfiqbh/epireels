import {
  Controller,
  Get,
  Param,
} from '@nestjs/common';
import { EpisodesService } from './episodes.service';
import { EpisodeResponseDto } from './dto/episode-response.dto';

@Controller('api/v1/episodes')
export class EpisodesController {
  constructor(private readonly episodesService: EpisodesService) {}

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<EpisodeResponseDto> {
    return this.episodesService.findOne(id);
  }
}