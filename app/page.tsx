
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import LogoutButton from "./logout-button";

async function DashboardContent() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-4 border-b border-zinc-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-blue-400">
              Team 28 · Digital Forensics
            </p>

            <h1 className="mt-2 text-3xl font-bold">
              Evidence Tracking System
            </h1>
          </div>

          <LogoutButton />
        </header>

        <section className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm text-zinc-400">Signed in as</p>

          <h2 className="mt-2 text-2xl font-semibold">
            {session.name}
          </h2>

          <div className="mt-4 inline-flex rounded-full border border-blue-800 bg-blue-950 px-4 py-1 text-sm font-medium text-blue-300">
            {session.role}
          </div>

          <p className="mt-5 text-sm text-zinc-400">
            User ID: {session.userId}
          </p>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h3 className="font-semibold">Case Management</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Manage forensic cases and their status.
            </p>
            <p className="mt-4 text-xs text-blue-400">
              <Link href="/cases" className="underline">Open cases</Link>
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h3 className="font-semibold">Evidence Tracking</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Register evidence and track custody transfers.
            </p>
            <p className="mt-4 text-xs text-blue-400">
              Evidence module integration pending
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h3 className="font-semibold">Investigations and Reports</h3>
            <p className="mt-2 text-sm text-zinc-400">
              Manage investigations and forensic reports.
            </p>
            <p className="mt-4 text-xs text-blue-400">
              <Link href="/investigations" className="underline">Investigations</Link>{" · "}<Link href="/reports" className="underline">Reports</Link>{session.role === "ADMIN" && (<>{" · "}<Link href="/audit" className="underline">Audit log</Link></>)}
            </p>
          </div>
        </section>

        <footer className="mt-10 border-t border-zinc-800 pt-5 text-xs text-zinc-500">
          Digital Forensic Evidence Tracking and Case Management System
        </footer>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-300">
          Loading...
        </main>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
