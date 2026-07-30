import { prisma } from "./prisma.js";

export const SYSTEM_STATE_KEY = "system_state";
export type SystemState = "SYSTEM_ACTIVE" | "MAINTENANCE_MODE";

export async function getSystemState(): Promise<SystemState> {
  const row = await prisma.appSetting.findUnique({ where: { key: SYSTEM_STATE_KEY } });
  return (row?.value as SystemState) ?? "SYSTEM_ACTIVE";
}

export async function setSystemState(state: SystemState): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: SYSTEM_STATE_KEY },
    create: { key: SYSTEM_STATE_KEY, value: state },
    update: { value: state },
  });
}
