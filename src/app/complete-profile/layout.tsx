export default function CompleteProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="hero-backdrop flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-2xl">{children}</div>
    </div>
  );
}
