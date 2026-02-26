import type { ApiRouter } from "@api";
import { treaty } from "@elysiajs/eden";

const baseUrl = typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;
const client = treaty<ApiRouter>(baseUrl);
export const api = client.api;
