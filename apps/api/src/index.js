import { env } from './config/env.js';
import { createApp } from './app.js';
import { startJobs } from './jobs/index.js';

const app = createApp();
app.listen(env.PORT, () => {
  console.log(`API de ReserYa en ${env.API_URL} (puerto ${env.PORT})`);
  startJobs();
});
