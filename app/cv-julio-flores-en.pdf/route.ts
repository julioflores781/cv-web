import { cvPdfResponse } from '@/lib/pdf/response';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => cvPdfResponse('en', request);
