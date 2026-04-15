import { initTRPC, TRPCError } from '@trpc/server';
import type { Env } from '../types/env';

export interface Context {
  env: Env;
  req: Request;
  executionCtx: ExecutionContext;
}

const t = initTRPC.context<Context>().create();

const authMiddleware = t.middleware(({ ctx, next }) => {
  const apiKey = ctx.req.headers.get('x-api-key');
  if (!apiKey || apiKey !== ctx.env.API_KEY) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid or missing API key' });
  }
  return next({ ctx });
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(authMiddleware);
