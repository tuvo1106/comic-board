"use client";

/** Labeled text input, optionally with a trailing control (e.g. a password
 *  show/hide toggle). Shared by the auth form and account-settings forms. */
export function Field({
  label,
  value,
  onChange,
  trailing,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  trailing?: React.ReactNode;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <label className="block">
      {/* mb-2 (8px) against the 16px that separates one field group from the
          next: enough that the label still visibly belongs to its own input,
          without the 6px-above / 20px-below lopsidedness it had before. */}
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      <div className="relative">
        <input
          {...rest}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full rounded-lg border border-border bg-surface-2 py-2 pl-3 text-sm outline-none focus:border-accent placeholder:text-muted ${
            trailing ? "pr-10" : "pr-3"
          }`}
        />
        {trailing && (
          <div className="absolute inset-y-0 right-2 flex items-center">{trailing}</div>
        )}
      </div>
    </label>
  );
}
