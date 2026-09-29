import { Route, Routes } from "react-router-dom";
import { DecisionDetailPage } from "../features/decisions/DecisionDetailPage.js";
import { DecisionListPage } from "../features/decisions/DecisionListPage.js";
import { NewDecisionPage } from "../features/decisions/NewDecisionPage.js";
import { JourneyPage } from "../features/journey/JourneyPage.js";
import { MilestoneSummaryPage } from "../features/journey/MilestoneSummaryPage.js";
import { TaskDetailPage } from "../features/journey/TaskDetailPage.js";
import { TodayPage } from "../features/today/TodayPage.js";
import { QuarterPage } from "../features/quarter/QuarterPage.js";
import { PlanImportPage } from "../features/quarter/PlanImportPage.js";
import { AppShell } from "./AppShell.js";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<TodayPage />} />
        <Route path="quarter" element={<QuarterPage />} />
        <Route path="quarter/import" element={<PlanImportPage />} />
        <Route path="quarter/:quarterId" element={<QuarterPage />} />
        <Route path="quarter/:quarterId/import" element={<PlanImportPage />} />
        <Route path="quarter/:quarterId/focus-areas/:focusAreaId" element={<QuarterPage />} />
        <Route path="quarter/:quarterId/milestones/:milestoneId" element={<QuarterPage />} />
        <Route path="journey" element={<JourneyPage />} />
        <Route path="decisions" element={<DecisionListPage />} />
        <Route path="decisions/new" element={<NewDecisionPage />} />
        <Route path="decisions/:decisionId" element={<DecisionDetailPage />} />
        <Route path="tasks/:taskId" element={<TaskDetailPage />} />
        <Route path="quarters/:quarterId/milestones/:milestoneId/summary" element={<MilestoneSummaryPage />} />
      </Route>
    </Routes>
  );
}
