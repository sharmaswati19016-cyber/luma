import Link from "next/link";
import Logo from "./Logo";
import "./EntryScreens.css";

export default function LandingScreen() {
  return (
    <main className="entry-page">
      <section className="entry-card landing-card">
        <Logo variant="full" className="landing-logo" />
        <Link className="entry-primary" href="/role">
          Let&apos;s Begin →
        </Link>
      </section>
    </main>
  );
}
