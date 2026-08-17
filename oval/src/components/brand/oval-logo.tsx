import Image from "next/image";

export function OvalLogo({ className = "", priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/oval-mark.svg"
      alt=""
      aria-hidden="true"
      width={78}
      height={56}
      className={className}
      priority={priority}
    />
  );
}
