import { ArrowRight, LoaderCircle } from "lucide-react";
import { type demoGuidance } from "@/lib/demo-guidance";
import styles from "./guided-demo.module.css";

type Guidance = NonNullable<ReturnType<typeof demoGuidance>>;

export function DemoNavigation({
  step,
  guidance,
  busy,
  error,
  onAction,
  onShowStep,
}: {
  step: number;
  guidance: Guidance;
  busy: string;
  error: boolean;
  onAction: () => void;
  onShowStep: () => void;
}) {
  return (
    <section className={styles.navigation} aria-label="Demo controls">
      <div className={styles.navigationInner}>
        <div className={styles.navigationCopy}>
          <span className={styles.stepNumber} aria-hidden="true">
            {step + 1}
          </span>
          <div>
            <strong>
              Step {step + 1} of 8 · {guidance.role}’s turn
            </strong>
            <p id="demo-next-action" aria-live="polite" aria-atomic="true">
              {busy
                ? `${busy}… The next step will open automatically.`
                : error
                  ? "This step needs another try. Your progress is kept."
                  : guidance.instruction}
            </p>
          </div>
        </div>
        <div className={styles.navigationActions}>
          <button
            type="button"
            className={styles.backToStep}
            onClick={onShowStep}
            disabled={Boolean(busy)}
          >
            Show current step
          </button>
          <button
            type="button"
            className={`button primary ${styles.nextButton}`}
            disabled={Boolean(busy)}
            onClick={onAction}
            aria-describedby="demo-next-action"
          >
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <ArrowRight size={18} />
            )}
            {busy
              ? "Working on it…"
              : error && guidance.action === "perform"
                ? "Retry this step"
                : guidance.label}
          </button>
        </div>
      </div>
    </section>
  );
}
