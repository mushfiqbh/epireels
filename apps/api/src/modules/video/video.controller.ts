import { Controller, Get, Param } from '@nestjs/common';
import { VideoService } from './video.service';
import { VideoPlaybackDto } from './video.types';
import { Public } from '../../common/decorators/public.decorator';

@Controller('api/v1/videos')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Public()
  @Get(':id/playback')
  getPlayback(@Param('id') id: string): Promise<VideoPlaybackDto> {
    return this.videoService.getPlayback(id);
  }
}
