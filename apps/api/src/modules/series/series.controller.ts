import { Controller, Get, Param } from '@nestjs/common';
import { SeriesService } from './series.service';
import { SeriesResponseDto, SeriesSummaryDto } from './dto/series-response.dto';
import { Public } from '../../common/decorators/public.decorator';

@Controller('api/v1/series')
export class SeriesController {
  constructor(private readonly seriesService: SeriesService) {}

  /** `GET /api/v1/series` — list every series (no episodes). */
  @Public()
  @Get()
  async findAll(): Promise<SeriesSummaryDto[]> {
    return this.seriesService.findAll();
  }

  /** `GET /api/v1/series/:id` — full series with every episode. */
  @Public()
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<SeriesResponseDto> {
    return this.seriesService.findOne(id);
  }
}
