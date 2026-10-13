export function reconcileDraft<T extends object>(base: T, local: T, remote: T) {
  const merged = { ...remote },
    remoteWins = { ...remote };
  const conflicts: (keyof T)[] = [];
  for (const key of Object.keys(local) as (keyof T)[]) {
    const localChanged =
      JSON.stringify(local[key]) !== JSON.stringify(base[key]);
    const remoteChanged =
      JSON.stringify(remote[key]) !== JSON.stringify(base[key]);
    if (!localChanged) continue;
    merged[key] = local[key];
    if (
      remoteChanged &&
      JSON.stringify(local[key]) !== JSON.stringify(remote[key])
    )
      conflicts.push(key);
    else remoteWins[key] = local[key];
  }
  return { merged, remoteWins, conflicts };
}
