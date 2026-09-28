import { Route, Routes } from "react-router-dom";
import { TodayPage } from "../features/today/TodayPage.js";
import { AppShell } from "./AppShell.js";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<TodayPage />} />
      </Route>
    </Routes>
  );
}
