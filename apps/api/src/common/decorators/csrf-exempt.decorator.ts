import { SetMetadata } from '@nestjs/common';

/** Metadata key used by `CsrfGuard` for public endpoints that create sessions. */
export const CSRF_EXEMPT_KEY = 'csrfExempt';

export const CsrfExempt = () => SetMetadata(CSRF_EXEMPT_KEY, true);
