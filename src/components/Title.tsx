interface TitleProps {
  variant?: "light" | "dark";
  className?: string;
}

export function Title({ className = "" }: TitleProps) {
  return (
    <div className={`text-center ${className}`}>
      <img
        src="/logo.png"
        alt="Crossword Clash"
        className="h-20 mx-auto"
      />
    </div>
  );
}
