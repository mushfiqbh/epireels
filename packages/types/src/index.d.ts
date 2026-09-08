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
