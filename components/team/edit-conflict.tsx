export function EditConflict({
  fields,
  resolve,
}: {
  fields: string[];
  resolve: (keepLocal: boolean) => void;
}) {
  if (!fields.length) return null;
  return (
    <div className="alert notice" role="alert">
      <div>
        <strong>A teammate updated {fields.join(", ").toLowerCase()}.</strong>
        <p>
          Your edits are kept below. Choose which changes to keep for these
          fields.
        </p>
        <div className="team-action-row">
          <button
            type="button"
            className="button compact subtle"
            onClick={() => resolve(true)}
          >
            Keep my changes
          </button>
          <button
            type="button"
            className="button compact subtle"
            onClick={() => resolve(false)}
          >
            Use teammate’s changes
          </button>
        </div>
      </div>
    </div>
  );
}
