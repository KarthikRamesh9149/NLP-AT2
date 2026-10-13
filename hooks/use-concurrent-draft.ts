"use client";
import { useEffect, useState } from "react";
import { reconcileDraft } from "@/lib/desk-editing";

export function useConcurrentDraft<T extends object>(latest: T) {
  const [base, setBase] = useState(latest),
    [draft, setDraft] = useState(latest);
  const result = reconcileDraft(base, draft, latest);
  const latestKey = JSON.stringify(latest);
  useEffect(() => {
    const update = reconcileDraft(base, draft, latest);
    if (!update.conflicts.length) {
      setBase(latest);
      setDraft(update.merged);
    }
  }, [latestKey]);
  function resolve(keepLocal: boolean) {
    setDraft(keepLocal ? result.merged : result.remoteWins);
    setBase(latest);
  }
  return { draft, setDraft, conflicts: result.conflicts, resolve };
}
