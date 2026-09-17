import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
const Study = lazy(() => import("./study/Study"));
createRoot(document.getElementById("root")!).render(<StrictMode><Suspense fallback={<div style={{ background: "#17150f", color: "#d5c4a2", height: "100dvh", display: "grid", placeItems: "center" }}>正在点亮书斋…</div>}><Study /></Suspense></StrictMode>);
