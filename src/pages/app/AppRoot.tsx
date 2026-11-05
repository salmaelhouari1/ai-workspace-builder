import { BrandMark, Wordmark } from "@/components/Brand";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { Navigate, Route, Routes } from "react-router";
import AppShell from "./AppShell";
import Assistant from "./Assistant";
import BusinessProfile from "./BusinessProfile";
import CalendarPage from "./Calendar";
import DocumentEditor from "./DocumentEditor";
import Documents from "./Documents";
import Goals from "./Goals";
import Home from "./Home";
import InboxPage from "./Inbox";
import Marketing from "./Marketing";
import ProjectDetail from "./ProjectDetail";
import Projects from "./Projects";
import Settings from "./Settings";
import Tasks from "./Tasks";

function Booting() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background">
      <span className="flex items-center gap-2.5">
        <BrandMark className="size-9" />
        <Wordmark />
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-1.5 animate-bounce rounded-full bg-primary" />
        <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:0.15s]" />
        <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:0.3s]" />
      </span>
    </div>
  );
}

/**
 * Entry for /app/*. Waits for the workspace, sends brand-new users into the
 * AI onboarding, and mounts the adaptive shell around every page.
 */
export default function AppRoot() {
  const workspace = useQuery(api.workspaces.getForMe);

  if (workspace === undefined) return <Booting />;
  if (workspace === null) return <Navigate to="/onboarding" replace />;

  return (
    <Routes>
      <Route element={<AppShell businessType={workspace.businessType} />}>
        <Route index element={<Home />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectDetail />} />
        <Route path="inbox" element={<InboxPage />} />
        <Route path="documents" element={<Documents />} />
        <Route path="documents/:id" element={<DocumentEditor />} />
        <Route path="business-profile" element={<BusinessProfile />} />
        <Route path="goals" element={<Goals />} />
        <Route path="marketing" element={<Marketing />} />
        <Route path="ai" element={<Assistant />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>
    </Routes>
  );
}
