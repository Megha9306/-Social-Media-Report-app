import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import {
  listConnectedAccounts,
  deleteConnectedAccount,
} from '../../db/queries';

export const accountsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return listConnectedAccounts(ctx.env.DB);
  }),

  disconnect: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await deleteConnectedAccount(ctx.env.DB, input.id);
      return { ok: true };
    }),
});
