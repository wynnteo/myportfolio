export default function HomePage() {
  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-600">Welcome</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Build your next portfolio with confidence.
        </h1>
        <p className="max-w-2xl text-lg text-slate-600">
          This starter ships with TypeScript, ESLint, Tailwind CSS, and a clear layout including
          navbar and footer placeholders. Customize the primary color palette to match your brand.
        </p>
      </div>
      <div className="rounded-lg border border-primary-100 bg-primary-50 p-6 text-primary-800 shadow-sm">
        <h2 className="text-xl font-semibold">Tech stack essentials</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-primary-900">
          <li>Absolute imports for components, libs, and types.</li>
          <li>Env schema ready for Yahoo Finance (RapidAPI) and Supabase.</li>
          <li>CI-ready scripts for linting, testing, and type-checking.</li>
        </ul>
      </div>
    </section>
  );
}
