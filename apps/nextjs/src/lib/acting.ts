import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Set while a request is being carried out for an account's AI agent (the MCP server): the account
 * the agent's key belongs to. Inside it, the signed-in account is that one, and a customer's
 * listing has to be on the Agent plan for anything to be read or changed.
 */
export type ActingUser = { id: string; email: string; role: string; [k: string]: unknown };
export const acting = new AsyncLocalStorage<{ user: ActingUser }>();
export const isAgent = () => acting.getStore() !== undefined;
