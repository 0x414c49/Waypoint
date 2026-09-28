import { Route, Routes } from "react-router-dom";
import { JourneyPage } from "../features/journey/JourneyPage.js";
import { MilestoneSummaryPage } from "../features/journey/MilestoneSummaryPage.js";
import { TaskDetailPage } from "../features/journey/TaskDetailPage.js";
import { TodayPage } from "../features/today/TodayPage.js";
import { AppShell } from "./AppShell.js";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<TodayPage />} />
        <Route path="journey" element={<JourneyPage />} />
        <Route path="tasks/:taskId" element={<TaskDetailPage />} />
        <Route path="quarters/:quarterId/milestones/:milestoneId/summary" element={<MilestoneSummaryPage />} />
      </Route>
    </Routes>
  );
}
