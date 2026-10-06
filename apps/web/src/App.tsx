import { AmountPickerDemo } from "./components/AmountPickerDemo.tsx";
import { BottomBar } from "./components/BottomBar.tsx";
import { ChoiceDialog } from "./components/ChoiceDialog.tsx";
import { Feed } from "./components/Feed.tsx";
import { Header } from "./components/Header.tsx";
import { PurchaseDialog } from "./components/PurchaseDialog.tsx";
import { SaveWarning } from "./components/SaveWarning.tsx";
import { StatPanel } from "./components/StatPanel.tsx";
import { UpdateBanner } from "./components/UpdateBanner.tsx";
import { currentLifeId, deathObituary, ready } from "./game/store.ts";
import { type PageId, page } from "./nav.ts";
import { ChartPage } from "./pages/ChartPage.tsx";
import { CreditsPage } from "./pages/Credits.tsx";
import { CustomLifePage } from "./pages/CustomLife.tsx";
import { GodPanel } from "./pages/GodPanel.tsx";
import { GraveyardPage } from "./pages/Graveyard.tsx";
import { LivesPage } from "./pages/Lives.tsx";
import { isMenuId, MenuPage } from "./pages/Menu.tsx";
import { ObituaryPage } from "./pages/Obituary.tsx";
import { Placeholder } from "./pages/Placeholder.tsx";
import { Profile } from "./pages/Profile.tsx";
import { SettingsPage } from "./pages/Settings.tsx";

function PageScreen(props: { id: PageId }) {
  if (props.id === "profile") return <Profile />;
  if (props.id === "chart") return <ChartPage />;
  if (props.id === "settings") return <SettingsPage />;
  if (props.id === "graveyard") return <GraveyardPage />;
  if (props.id === "credits") return <CreditsPage />;
  if (props.id === "god") return <GodPanel />;
  if (props.id === "customlife") return <CustomLifePage />;
  if (isMenuId(props.id)) return <MenuPage id={props.id} />;
  return <Placeholder id={props.id} />;
}

function Screen() {
  const open = page.value;
  if (deathObituary.value) return <ObituaryPage />;
  if (open) return <PageScreen id={open} />;
  if (currentLifeId.value === null) return <LivesPage />;
  return (
    <>
      <Header />
      <Feed />
      <StatPanel />
      <BottomBar />
    </>
  );
}

/** Classic layout (docs/spec/screens.md): header, journal feed, stat panel, bottom bar. */
export function App() {
  if (!ready.value) return null;
  return (
    <div class="@container relative mx-auto h-dvh touch-manipulation max-w-md overflow-hidden bg-surface text-text">
      <div class="flex h-full flex-col overflow-y-auto overscroll-none pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <div class="h-[env(safe-area-inset-top)] shrink-0 bg-primary" />
        <UpdateBanner />
        <SaveWarning />
        <Screen />
        <ChoiceDialog />
        <PurchaseDialog />
        {import.meta.env.VITE_E2E ? <AmountPickerDemo /> : null}
      </div>
    </div>
  );
}
