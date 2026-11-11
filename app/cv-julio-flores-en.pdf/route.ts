import { cvPdfResponse } from '@/lib/pdf/response';

export const dynamic = 'force-static';

export const GET = () => cvPdfResponse('en');
