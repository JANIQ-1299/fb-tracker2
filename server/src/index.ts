import { buildApp } from "./app.js";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { scheduleInsightsJob } from "./jobs/insights.js";
import { scheduleSheetsSync } from "./jobs/sheetsSync.js";
import { scheduleDailyReportJob } from "./jobs/dailyReport.js";
import { scheduleMessagePurgeJob } from "./jobs/purgeMessageText.js";

const app = buildApp();

app.listen(env.port, () => {
  logger.info(`الخادم يعمل على المنفذ ${env.port} (${env.nodeEnv})`);
  if (env.nodeEnv !== "test") {
    scheduleInsightsJob();
    scheduleSheetsSync();
    scheduleDailyReportJob();
    scheduleMessagePurgeJob();
  }
});
