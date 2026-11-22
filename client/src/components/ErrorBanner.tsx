export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="banner--error" role="alert">
      {message}
    </div>
  );
}
