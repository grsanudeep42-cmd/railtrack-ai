/**
 * Shared API base URL — reads from NEXT_PUBLIC_API_URL env var.
 * Set this in your .env.local for local dev or deployment config.
 * Defaults to http://localhost:8000 for local FastAPI dev server.
 */
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
