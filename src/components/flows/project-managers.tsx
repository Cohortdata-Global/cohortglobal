"use client";

import { useState } from "react";
import { UserPlus, UserMinus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { ConfirmAction } from "@/components/app/confirm-action";
import { useAction } from "@/components/app/use-action";
import { assignProjectManager, removeProjectManager } from "@/server/actions/projects";

type Manager = { userId: string; name: string; email: string; since: string; isYou: boolean };

/** The Project Managers of one project (ID-52). Only the Operations Manager and Super Admin change them. */
export function ProjectManagers({ projectId, managers, candidates, canAssign }: {
  projectId: string; managers: Manager[]; candidates: { id: string; name: string }[]; canAssign: boolean;
}) {
  const t = useTranslations("projectDetail");
  const tp = useTranslations("projects");
  const [pick, setPick] = useState("");
  const { pending, run } = useAction();

  return (
    <div className="grid gap-4">
      {managers.length === 0 ? (
        <div className="rounded-md border border-dashed border-amber-300 bg-amber-50/60 px-4 py-3 text-[13.5px]">
          <p className="font-semibold text-amber-800">{t("noManagers")}</p>
          <p className="text-amber-800/80">{t("noManagersBody")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {managers.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-pine-50 text-[12.5px] font-semibold text-pine-700">
                  {(m.name || m.email).slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-ink">{m.name}{m.isYou ? <span className="font-normal text-muted"> ({tp("you")})</span> : null}</p>
                  <p className="truncate text-[12.5px] text-muted">{m.email !== m.name ? `${m.email}, ` : ""}{m.since}</p>
                </div>
              </div>
              {canAssign ? (
                <ConfirmAction label={t("removeManager")} size="sm" variant="ghost" icon={<UserMinus />}
                  title={t("removeManagerTitle", { name: m.name })} description={t("removeManagerBody")}
                  confirmLabel={t("removeManager")} action={() => removeProjectManager(projectId, m.userId)} />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canAssign ? (
        candidates.length === 0 ? (
          <p className="text-[13px] text-muted">{t("allPmsAssigned")}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label={t("choosePm")} value={pick} onChange={(e) => setPick(e.target.value)} className="min-w-[16rem] flex-1 sm:flex-none">
              <option value="">{t("choosePm")}</option>
              {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Button variant="secondary" loading={pending} disabled={!pick}
              onClick={() => run(() => assignProjectManager(projectId, pick), { onSuccess: () => setPick("") })}>
              <UserPlus /> {t("assignManager")}
            </Button>
          </div>
        )
      ) : null}
    </div>
  );
}
