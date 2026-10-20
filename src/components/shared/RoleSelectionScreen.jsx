import Link from "next/link";
import Logo from "./Logo";
import "./EntryScreens.css";

export default function RoleSelectionScreen() {
  return (
    <main className="entry-page">
      <section className="entry-card role-card">
        <Logo variant="mark" className="role-logo" />
        <h1>Welcome to luma</h1>
        <p>Choose how you&apos;d like to continue.</p>
        <nav className="role-actions" aria-label="Choose your role">
          <Link className="entry-primary" href="/resident">
            Resident&apos;s Login
          </Link>
          <Link className="entry-secondary" href="/staff/login">
            Staff&apos;s Login
          </Link>
        </nav>
        <Link className="entry-back" href="/">← Back</Link>
      </section>
    </main>
  );
}
