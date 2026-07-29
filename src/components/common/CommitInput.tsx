import { useEffect, useState } from 'react';

type CommitInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'onBlur'
> & {
  value: string;
  onCommit: (value: string) => boolean | void;
  normalize?: (value: string) => string;
};

export function CommitInput({
  value,
  onCommit,
  normalize = (next) => next,
  onKeyDown,
  ...inputProps
}: CommitInputProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function reset(): void {
    setDraft(value);
  }

  function commit(): void {
    const next = normalize(draft);
    if (onCommit(next) === false) {
      reset();
      return;
    }
    setDraft(next);
  }

  return (
    <input
      {...inputProps}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        } else if (event.key === 'Escape') {
          reset();
          event.currentTarget.blur();
        }
      }}
    />
  );
}
