import { Chart } from "../components/Chart.tsx";
import { PageFrame } from "../components/PageFrame.tsx";
import { netWorthHistory } from "../game/store.ts";

/** Net worth over age (cash plus assets minus loans). */
export function ChartPage() {
  const points = netWorthHistory.value.map((p) => ({ x: p.age, y: p.value }));
  return (
    <PageFrame title="Net worth">
      <Chart title="Net worth by age" points={points} />
    </PageFrame>
  );
}
