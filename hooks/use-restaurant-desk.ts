"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { useTeam } from "./use-team";
import type { RestaurantDesk, StaffRole } from "@/lib/restaurant-desk";
export interface DeskResponse {
  desk: RestaurantDesk;
  version: number;
  slug: string;
  role: StaffRole;
  members: { user_id: string; display_name: string; role: StaffRole }[];
}
export function useRestaurantDesk(team: ReturnType<typeof useTeam>) {
  const [data, setData] = useState<DeskResponse | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const identity = useRef(""),
    sequence = useRef(0),
    mutation = useRef(false);
  identity.current = `${team.user?.id || ""}:${team.workspaceId}`;
  const request = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const session = await team.database?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) throw new Error("Sign in to open your team desk.");
      const response = await fetch(path, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...init.headers,
        },
        signal: AbortSignal.timeout(65_000),
      });
      const result = await response.json();
      if (!response.ok)
        throw Object.assign(
          new Error(
            result.error || "This action could not be completed. Please retry.",
          ),
          { status: response.status },
        );
      return result;
    },
    [team.database],
  );
  const refresh = useCallback(async () => {
    if (!team.user || !team.workspaceId) return;
    const key = identity.current,
      id = ++sequence.current;
    const result = await request(
      `/api/restaurant/desk?workspace=${team.workspaceId}`,
    );
    if (key === identity.current && id === sequence.current) {
      setData(result);
      setError("");
    }
  }, [team.user?.id, team.workspaceId, request]);
  useEffect(() => {
    let alive = true;
    mutation.current = false;
    setBusy(false);
    setData(null);
    setError("");
    setLoading(true);
    refresh()
      .catch((cause) => {
        if (alive) setError(cause.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      sequence.current++;
    };
  }, [refresh]);
  useEffect(() => {
    const update = () => {
      if (document.visibilityState === "visible" && !busy)
        refresh().catch((cause) => setError(cause.message));
    };
    const interval = window.setInterval(update, 20_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh, busy]);
  async function perform(
    operation: Record<string, unknown>,
    version = data?.version,
  ) {
    if (!data || !team.workspaceId) throw new Error("Choose a team first.");
    if (mutation.current)
      throw new Error(
        "An update is already being saved. Wait for it to finish.",
      );
    const key = identity.current;
    mutation.current = true;
    setBusy(true);
    setError("");
    try {
      sequence.current++;
      const result = await request("/api/restaurant/desk", {
        method: "POST",
        body: JSON.stringify({
          workspaceId: team.workspaceId,
          version,
          operation,
        }),
      });
      if (key !== identity.current)
        throw new Error(
          "Your team changed. Return to the original team to check this action.",
        );
      if (result.desk) setData(result);
      try {
        await team.refreshCases();
      } catch {
        if (key === identity.current)
          setError(
            "Your change was saved. Refresh the desk to load the latest enquiries.",
          );
      }
      return result;
    } catch (cause) {
      if (
        key === identity.current &&
        cause instanceof Error &&
        "status" in cause &&
        cause.status === 409
      )
        await refresh().catch(() => {});
      if (key === identity.current)
        setError(cause instanceof Error ? cause.message : "Please retry.");
      throw cause;
    } finally {
      if (key === identity.current) {
        mutation.current = false;
        setBusy(false);
      }
    }
  }
  return {
    data,
    error,
    loading,
    busy,
    refresh,
    perform,
    request,
    clearError: () => setError(""),
  };
}
