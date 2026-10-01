import { lazy, Suspense, type ReactNode } from "react";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell.js";
import { AuthGate, AuthProvider, RequireOwner } from "../features/auth/AuthContext.js";
import { SignInPage, RegisterPage } from "../features/auth/SignInPage.js";
import { AccessPage } from "../features/auth/AccessPage.js";

const TodayPage = lazy(() => import("../features/today/TodayPage.js").then((module) => ({ default: module.TodayPage })));
const QuarterPage = lazy(() => import("../features/quarter/QuarterPage.js").then((module) => ({ default: module.QuarterPage })));
const PlanImportPage = lazy(() => import("../features/quarter/PlanImportPage.js").then((module) => ({ default: module.PlanImportPage })));
const JourneyPage = lazy(() => import("../features/journey/JourneyPage.js").then((module) => ({ default: module.JourneyPage })));
const TaskDetailPage = lazy(() => import("../features/journey/TaskDetailPage.js").then((module) => ({ default: module.TaskDetailPage })));
const MilestoneSummaryPage = lazy(() => import("../features/journey/MilestoneSummaryPage.js").then((module) => ({ default: module.MilestoneSummaryPage })));
const DecisionListPage = lazy(() => import("../features/decisions/DecisionListPage.js").then((module) => ({ default: module.DecisionListPage })));
const DecisionDetailPage = lazy(() => import("../features/decisions/DecisionDetailPage.js").then((module) => ({ default: module.DecisionDetailPage })));
const NewDecisionPage = lazy(() => import("../features/decisions/NewDecisionPage.js").then((module) => ({ default: module.NewDecisionPage })));

function loadPage(page: ReactNode) {
  return <Suspense fallback={<p role="status">Opening this page…</p>}>{page}</Suspense>;
}

export function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<AppShell />}>
            <Route index element={loadPage(<TodayPage />)} />
            <Route path="quarter" element={loadPage(<QuarterPage />)} />
            <Route path="quarter/import" element={loadPage(<PlanImportPage />)} />
            <Route path="quarter/:quarterId" element={loadPage(<QuarterPage />)} />
            <Route path="quarter/:quarterId/import" element={loadPage(<PlanImportPage />)} />
            <Route path="quarter/:quarterId/focus-areas/:focusAreaId" element={loadPage(<QuarterPage />)} />
            <Route path="quarter/:quarterId/milestones/:milestoneId" element={loadPage(<QuarterPage />)} />
            <Route path="journey" element={loadPage(<JourneyPage />)} />
            <Route path="decisions" element={loadPage(<DecisionListPage />)} />
            <Route path="decisions/new" element={loadPage(<NewDecisionPage />)} />
            <Route path="decisions/:decisionId" element={loadPage(<DecisionDetailPage />)} />
            <Route path="tasks/:taskId" element={loadPage(<TaskDetailPage />)} />
            <Route path="quarters/:quarterId/milestones/:milestoneId/summary" element={loadPage(<MilestoneSummaryPage />)} />
            <Route path="access" element={<RequireOwner>{loadPage(<AccessPage />)}</RequireOwner>} />
          </Route>
        </Routes>
      </AuthGate>
    </AuthProvider>
  );
}
