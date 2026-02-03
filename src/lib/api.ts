import type { ApiRouter } from "@api";
import { treaty } from "@elysiajs/eden";

const client = treaty<ApiRouter>("http://localhost:3000");
export const api = client.api;
