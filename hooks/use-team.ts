'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { browserDatabase } from '@/lib/supabase-browser';
import { readCases, type BookingCase } from '@/lib/cases';

export interface TeamWorkspace { id: string; name: string; owner_id: string }
export interface TeamCase extends BookingCase { version: number; workspaceId: string }
const choiceKey = 'formbridge-team-choice';
export function useTeam() {
  const database = browserDatabase();
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<TeamWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [cases, setCases] = useState<TeamCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const identity = useRef<string | undefined>(undefined);
  const selection = useRef('');
  const teamRequest = useRef(0);
  const caseRequest = useRef(0);
  identity.current = user?.id;
  selection.current = workspaceId;
  const workspace = workspaces.find(item => item.id === workspaceId) ?? null;

  useEffect(() => {
    if (!database) return;
    let alive = true; let observed = false;
    database.auth.getSession().then(({ data }) => { if (alive && !observed) setUser(data.session?.user ?? null); });
    const { data } = database.auth.onAuthStateChange((_event, session) => { observed = true; if (alive) setUser(session?.user ?? null); });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, [database]);

  const refreshTeams = useCallback(async () => {
    if (!database || !user) return;
    const owner = user.id; const request = ++teamRequest.current;
    const { data, error: issue } = await database.from('fb_workspaces').select('id,name,owner_id').order('created_at');
    if (identity.current !== owner || teamRequest.current !== request) return;
    if (issue) throw new Error('Your teams could not be loaded. Please retry.');
    const next = (data ?? []) as TeamWorkspace[];
    setWorkspaces(next);
    let selected = selection.current;
    try { selected ||= localStorage.getItem(choiceKey) ?? ''; } catch { /* Selection remains usable without storage. */ }
    setWorkspaceId(next.some(item => item.id === selected) ? selected : next[0]?.id ?? '');
  }, [database, user]);

  const refreshCases = useCallback(async () => {
    if (!database || !user || !workspaceId) { setCases([]); return; }
    const owner = user.id; const selected = workspaceId; const request = ++caseRequest.current;
    const [rows, members] = await Promise.all([
      database.from('fb_cases').select('*').eq('workspace_id', workspaceId).order('updated_at', { ascending: false }).limit(200),
      database.from('fb_members').select('user_id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    ]);
    if (identity.current !== owner || selection.current !== selected || caseRequest.current !== request) return;
    if (rows.error) throw new Error('Your team cases could not be loaded. Please retry.');
    setCases((rows.data ?? []).flatMap(row => {
      const record = readCases(JSON.stringify([{ id: row.id, title: row.title, archived: row.archived, updatedAt: row.updated_at, notes: row.payload?.notes ?? '', session: row.payload?.session }]))[0];
      return record ? [{ ...record, version: row.version, workspaceId: row.workspace_id }] : [];
    }));
    setMemberCount(members.count ?? 0);
  }, [database, user, workspaceId]);

  useEffect(() => {
    setWorkspaces([]); setCases([]); setMemberCount(0); setError(null);
    if (!user) { setWorkspaceId(''); return; }
    refreshTeams().catch(cause => setError(cause.message));
  // Reload membership when the signed-in identity changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  useEffect(() => {
    let live = true;
    setCases([]); setMemberCount(0); setError(null);
    setLoading(true);
    refreshCases().catch(cause => { if (live) setError(cause.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [refreshCases]);
  useEffect(() => {
    const onFocus = () => refreshCases().catch(cause => setError(cause.message));
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshCases]);

  async function connectDevice() {
    if (!database) throw new Error('Team access is temporarily unavailable. Your device cases are still available.');
    if (!user) { const { error: issue } = await database.auth.signInAnonymously(); if (issue) throw new Error('Device sign-in is unavailable. Try signing in with your email account.'); }
  }
  async function createWorkspace(name: string) {
    if (!database) throw new Error('Team access is unavailable.');
    const { data, error: issue } = await database.rpc('fb_create_workspace', { p_name: name.trim() });
    if (issue) throw new Error(issue.message);
    await refreshTeams(); chooseWorkspace(data); return data as string;
  }
  function chooseWorkspace(id: string) { selection.current = id; setCases([]); setMemberCount(0); setWorkspaceId(id); try { localStorage.setItem(choiceKey, id); } catch { /* No persistent selection. */ } }
  async function joinWorkspace(token: string) {
    if (!database) throw new Error('Team access is unavailable.');
    const { data, error: issue } = await database.rpc('fb_join_workspace', { p_token: token.trim() });
    if (issue) throw new Error(issue.message);
    await refreshTeams(); chooseWorkspace(data);
  }
  async function createInvite() {
    if (!database || !workspaceId) throw new Error('Choose a team first.');
    const { data, error: issue } = await database.rpc('fb_create_invite', { p_workspace: workspaceId });
    if (issue) throw new Error(issue.message);
    return data as string;
  }
  async function save(record: BookingCase, expectedVersion = 0): Promise<TeamCase> {
    if (!database || !workspaceId) throw new Error('Choose a team before saving.');
    const selected = workspaceId; const owner = user?.id;
    const { data, error: issue } = await database.rpc('fb_save_case', { p_workspace: selected, p_id: record.id, p_title: record.title, p_payload: { session: record.session, notes: record.notes }, p_archived: record.archived, p_expected_version: expectedVersion });
    if (issue) throw new Error(issue.message);
    if (selection.current !== selected || identity.current !== owner) throw new Error('Your team changed while saving. Reopen the enquiry in its original team to check the saved copy.');
    await refreshCases();
    return { ...record, updatedAt: data.updated_at, version: data.version, workspaceId: selected };
  }
  return { available: !!database, deviceSignIn: process.env.NEXT_PUBLIC_DEVICE_SIGN_IN_ENABLED === 'true', database, user, workspaces, workspace, workspaceId, cases, loading, error, memberCount, connectDevice, createWorkspace, joinWorkspace, createInvite, save, chooseWorkspace, refreshTeams, refreshCases, clearError: () => setError(null) };
}
