import { UpdateBanner } from "./components/UpdateBanner.tsx";

/** Placeholder shell; the real Classic layout arrives with the UI issues. */
export function App() {
  return (
    <div class="flex min-h-screen flex-col">
      <UpdateBanner />
      <header class="bg-primary px-4 py-3 text-on-primary">
        <h1 class="text-lg font-semibold">Life Sim</h1>
      </header>
      <main class="flex-1 p-4" aria-label="Life feed" />
    </div>
  );
}
