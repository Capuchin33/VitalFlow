type Props = {
  message: string;
  /** fixed — full screen (app startup); absolute — over a parent with position:relative */
  variant?: "fixed" | "absolute";
};

export function LoadingOverlay({ message, variant = "fixed" }: Props) {
  return (
    <div
      className={`loading-overlay loading-overlay--${variant}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="loading-popup">
        <span className="loading-spinner" aria-hidden />
        <p className="loading-popup__text">{message}</p>
      </div>
    </div>
  );
}
