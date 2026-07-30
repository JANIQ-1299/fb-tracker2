import { Router } from "express";
import { logger } from "../lib/logger.js";
import { requireUser, type WorkspaceAuthedRequest } from "../middleware/workspaceAuth.js";
import { requireActiveWorkspace, requireSystemActive } from "../middleware/workspaceGuard.js";
import { syncWorkspaceMeta } from "../services/metaSync.js";

export const metaSyncRouter = Router();
metaSyncRouter.use(requireUser, requireSystemActive, requireActiveWorkspace);

// workspaceId يُؤخَذ حصرًا من الجلسة (req.user.workspaceId) - أي قيمة مماثلة في body الطلب
// تُتجاهَل عمدًا ولا تُقرأ إطلاقًا، لمنع أي محاولة لمزامنة بيانات Workspace آخر.
metaSyncRouter.post("/", async (req: WorkspaceAuthedRequest, res) => {
  const workspaceId = req.user!.workspaceId;
  try {
    const summary = await syncWorkspaceMeta(workspaceId);
    logger.info({ workspaceId, summary }, "اكتملت مزامنة Meta لهذا الـWorkspace");
    res.json(summary);
  } catch (err) {
    logger.error({ workspaceId, err: (err as Error).message }, "فشلت مزامنة Meta");
    res.status(502).json({ error: "فشلت المزامنة مع Meta، حاول لاحقًا" });
  }
});
