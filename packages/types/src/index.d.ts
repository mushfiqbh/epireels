export interface ApiResponse<T> {
    data: T;
    meta?: ResponseMeta;
}
export interface ResponseMeta {
    requestId?: string;
    timestamp?: string;
    pagination?: Pagination;
}
export interface Pagination {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
}
export interface Paginated<T> {
    items: T[];
    pagination: Pagination;
}
export type ApiErrorCode = "BAD_REQUEST" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "UNPROCESSABLE_ENTITY" | "INTERNAL_SERVER_ERROR";
export interface ApiError {
    code: ApiErrorCode;
    message: string;
    field?: string;
    details?: Record<string, unknown>;
}
export type ID = string & {
    readonly __brand: "ID";
};
export declare const asId: (value: string) => ID;
export type ISODateString = string & {
    readonly __brand: "ISODateString";
};
export interface User {
    id: ID;
    email: string;
    displayName: string;
    avatarUrl?: string;
    role: UserRole;
    createdAt: ISODateString;
}
export type UserRole = "admin" | "member" | "guest";
export interface PublicUser extends Pick<User, "id" | "displayName" | "avatarUrl"> {
}
export interface AuthSession {
    user: PublicUser;
    accessToken: string;
    refreshToken?: string;
    expiresAt: ISODateString;
}
export interface LoginInput {
    email: string;
    password: string;
}
export interface SignupInput extends LoginInput {
    displayName: string;
}
export interface HealthSnapshot {
    status: "ok" | "degraded" | "down";
    uptimeSeconds: number;
    timestamp: ISODateString;
    nodeEnv: "development" | "test" | "production";
    storageDriver?: string;
    version?: string;
}
export interface FeatureFlags {
    overrides?: Record<string, boolean | string | number | null> | null;
}
export interface BuildInfo {
    version: string;
    commit: string;
    builtAt: ISODateString;
}
export type EpisodeStatus = "draft" | "published" | "archived";
export type SeriesStatus = "draft" | "published" | "archived";
export type VideoProcessingStatus = "UPLOADED" | "PROCESSING" | "READY" | "FAILED";
export interface VideoCut {
    url: string;
    thumbnail: string;
    label: string;
    aspectRatio: "9:16" | "16:9";
}
export interface VideoMediaDto {
    id: string;
    url: string;
    type: string;
    processingStatus: VideoProcessingStatus | string;
}
export interface EpisodeResponseDto {
    id: string;
    title: string;
    number: number;
    duration?: number;
    status: EpisodeStatus;
    video: VideoMediaDto | null;
    thumbnailUrl: string | null;
    synopsis?: string | null;
    likes?: number;
    commentsCount?: number;
    creator?: string;
}
export interface SeriesSummaryDto {
    id: string;
    title: string;
    slug: string;
    creator: string;
    coverImage: string | null;
    tagline: string;
    genre: string[];
    accent: number;
    status: SeriesStatus;
    totalEpisodes: number;
}
export interface SeriesResponseDto extends SeriesSummaryDto {
    episodes: EpisodeResponseDto[];
}
export interface VideoPlaybackDto {
    videoId: string;
    status: VideoProcessingStatus | string;
    posterUrl?: string;
    manifestUrl?: string;
    error?: string;
}
export interface AdminUploadResponseDto {
    videoId: string;
    key: string;
    url: string;
    mimeType: string;
    size: number;
    durationSeconds: number;
    width: number;
    height: number;
    processingStatus: VideoProcessingStatus | string;
    episode?: {
        id: string;
        title: string;
        seriesId: string;
    };
}
export interface Comment {
    id: string;
    user: string;
    handle: string;
    avatar: string;
    time: string;
    text: string;
    likes: number;
}
