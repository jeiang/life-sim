import { render } from "preact";
import { App } from "./App.tsx";
import "./styles.css";
import { initServiceWorker } from "./update.ts";

render(<App />, document.getElementById("app") as HTMLElement);
initServiceWorker();
