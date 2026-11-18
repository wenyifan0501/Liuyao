import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import { LoadingScreen } from "./study/LoadingScreen";
const Study = lazy(() => import("./study/Study"));
// The same curtain as the study's own loading screen, so the hand-over is invisible.
createRoot(document.getElementById("root")!).render(<StrictMode><Suspense fallback={<LoadingScreen/>}><Study /></Suspense></StrictMode>);
