import { cache } from 'react';
import { requestJson } from './request';

/**
 * One API read per (resource, language, options) inside a single React render (`generateMetadata` and `Page` share it).
 * There is no cache between requests: every render reads the API again, and any failure throws (the page then answers 500;
 * `requestJson` logs each failed attempt and Next logs the render error).
 */
export const getContent = cache(requestJson);
