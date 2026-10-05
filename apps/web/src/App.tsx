import { BottomBar } from "./components/BottomBar.tsx";
import { Feed } from "./components/Feed.tsx";
import { Header } from "./components/Header.tsx";
import { PendingNotice } from "./components/PendingNotice.tsx";
import { StatPanel } from "./components/StatPanel.tsx";
import { UpdateBanner } from "./components/UpdateBanner.tsx";
import { page } from "./nav.ts";
import { Placeholder } from "./pages/Placeholder.tsx";

/** Classic layout (docs/spec/screens.md): header, journal feed, stat panel, bottom bar. */
export function App() {
  const open = page.value;
  return (
    <div class="@container mx-auto max-w-md bg-surface text-text">
      <div class="flex h-dvh @max-xs:h-auto @max-xs:min-h-dvh flex-col">
        <UpdateBanner />
        {open ? (
          <Placeholder id={open} />
        ) : (
          <>
            <Header />
            <Feed />
            <StatPanel />
            <BottomBar />
          </>
        )}
        <PendingNotice />
      </div>
    </div>
  );
}
