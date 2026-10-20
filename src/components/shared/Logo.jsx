import Image from "next/image";
import fullLogo from "../../public/assets/logo.png";
import markLogo from "../../public/assets/logomark.png";

export default function Logo({ variant = "mark", className = "" }) {
  const logo = variant === "full" ? fullLogo : markLogo;

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
