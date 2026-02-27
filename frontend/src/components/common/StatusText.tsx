interface StatusTextProps {
  text: string;
  isError: boolean;
}

export function StatusText({ text, isError }: StatusTextProps) {
  return <p className={`status-text ${isError ? "error" : ""}`}>{text}</p>;
}
