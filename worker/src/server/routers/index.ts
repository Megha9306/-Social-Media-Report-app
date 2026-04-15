import { router } from '../trpc';
import { postsRouter } from './posts';
import { scrapeRouter } from './scrape';
import { reportsRouter } from './reports';
import { competitorRouter } from './competitor';
import { settingsRouter } from './settings';
import { brandsRouter } from './brands';
import { accountsRouter } from './accounts';

export const appRouter = router({
  posts:      postsRouter,
  scrape:     scrapeRouter,
  reports:    reportsRouter,
  competitor: competitorRouter,
  settings:   settingsRouter,
  brands:     brandsRouter,
  accounts:   accountsRouter,
});

export type AppRouter = typeof appRouter;
