import type { ApiRouter } from "@api";
import { treaty } from "@elysiajs/eden";

const baseUrl = typeof window === "undefined" ? "localhost:3000" : window.location.host;
const client = treaty<ApiRouter>(baseUrl);
export const api = client.api;
