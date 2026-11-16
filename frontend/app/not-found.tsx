import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return <div className="shell"><main className="hero">
    <Image src="/brand/benchify-icon.svg" alt="Benchify" width={48} height={48} unoptimized />
    <h1>Page not found</h1>
    <Link href="/">Return to Benchify</Link>
  </main></div>;
}
