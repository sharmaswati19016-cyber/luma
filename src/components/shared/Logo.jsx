import Image from "next/image";

export default function Logo({ variant = "mark", className = "" }) {
  const logo = variant === "full" ? "/assets/logo.png" : "/assets/logomark.png";

  return (
    <Image
      className={className}
      src={logo}
      alt="luma"
      priority
      sizes={variant === "full" ? "(max-width: 600px) 75vw, 420px" : "120px"}
    />
  );
}
