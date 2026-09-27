import { Route, Routes } from "react-router-dom";
import { FoundationPage } from "../features/foundation/FoundationPage.js";
import { AppShell } from "./AppShell.js";

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<FoundationPage />} />
      </Route>
    </Routes>
  );
}
