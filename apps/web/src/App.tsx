import { AmountPickerDemo } from "./components/AmountPickerDemo.tsx";
import { BottomBar } from "./components/BottomBar.tsx";
import { ChoiceDialog } from "./components/ChoiceDialog.tsx";
import { Feed } from "./components/Feed.tsx";
import { Header } from "./components/Header.tsx";
import { PurchaseDialog } from "./components/PurchaseDialog.tsx";
import { StatPanel } from "./components/StatPanel.tsx";
import { UpdateBanner } from "./components/UpdateBanner.tsx";
import { type PageId, page } from "./nav.ts";
import { ChartPage } from "./pages/ChartPage.tsx";
import { isMenuId, MenuPage } from "./pages/Menu.tsx";
import { Placeholder } from "./pages/Placeholder.tsx";
import { Profile } from "./pages/Profile.tsx";

/** Classic layout (docs/spec/screens.md): header, journal feed, stat panel, bottom bar. */
export function App() {
  const open = page.value;
  return (
    <div class="@container mx-auto max-w-md bg-surface text-text">
      <div class="flex h-dvh @max-xs:h-auto @max-xs:min-h-dvh flex-col">
        <UpdateBanner />
        {open ? (
          <Screen id={open} />
        ) : (
          <>
            <Header />
            <Feed />
            <StatPanel />
            <BottomBar />
          </>
        )}
        <ChoiceDialog />
        <PurchaseDialog />
        {import.meta.env.VITE_E2E ? <AmountPickerDemo /> : null}
      </div>
    </div>
  );
}

function Screen(props: { id: PageId }) {
  if (props.id === "profile") return <Profile />;
  if (props.id === "chart") return <ChartPage />;
  if (isMenuId(props.id)) return <MenuPage id={props.id} />;
  return <Placeholder id={props.id} />;
}
