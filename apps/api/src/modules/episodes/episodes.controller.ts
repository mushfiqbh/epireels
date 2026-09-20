import { Controller, Get, Param } from '@nestjs/common';
import { EpisodesService } from './episodes.service';
import { EpisodeResponseDto } from './dto/episode-response.dto';
import { Public } from '../../common/decorators/public.decorator';

@Controller('api/v1/episodes')
export class EpisodesController {
  constructor(private readonly episodesService: EpisodesService) {}

  @Public()
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<EpisodeResponseDto> {
    return this.episodesService.findOne(id);
  }
}
