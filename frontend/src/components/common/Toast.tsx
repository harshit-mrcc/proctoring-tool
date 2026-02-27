interface ToastProps {
  message: string;
}

export function Toast({ message }: ToastProps) {
  return (
    <div className={`warning-toast ${message ? "" : "hidden"}`}>
      {message}
    </div>
  );
}
