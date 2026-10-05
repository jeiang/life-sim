import { render } from "preact";
import { App } from "./App.tsx";
import "./styles.css";
import { initGame } from "./game/store.ts";
import { initInstall } from "./install.ts";
import { initServiceWorker } from "./update.ts";

initInstall();
render(<App />, document.getElementById("app") as HTMLElement);
void initGame();
initServiceWorker();
