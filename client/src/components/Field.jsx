import { useId } from 'react';

/** Labelled form control with hint and error text wired up for screen readers. */
export function Field({ label, error, hint, id, as = 'input', children, ...controlProps }) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const describedBy = [hint && `${controlId}-hint`, error && `${controlId}-error`].filter(Boolean).join(' ') || undefined;
  const Control = as;

  return (
    <div className="field">
      <label htmlFor={controlId}>{label}</label>
      <Control
        id={controlId}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...controlProps}
      >
        {children}
      </Control>
      {hint && (
        <p id={`${controlId}-hint`} className="hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${controlId}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
