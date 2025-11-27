import Link from 'next/link';

export default function Navbar() {
  return (
    <header className="border-b border-slate-200 bg-primary-50">
      <div className="container flex items-center justify-between py-4">
        <Link href="/" className="text-lg font-semibold text-primary-800">
          MyPortfolio
        </Link>
        <nav className="flex items-center gap-4 text-sm text-primary-700">
          <span className="rounded border border-primary-100 bg-primary-100 px-3 py-1 font-medium">
            Navbar
          </span>
          <span className="text-slate-500">Links coming soon</span>
        </nav>
      </div>
    </header>
  );
}
