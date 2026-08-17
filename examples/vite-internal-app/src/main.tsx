import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

function App() {
  const [status, setStatus] = useState<Record<string, boolean> | null>(null);
  useEffect(() => { fetch("/api/status").then((response) => response.json()).then(setStatus); }, []);
  return <main><p className="eyebrow">ZAODEPLOY EXAMPLE</p><h1>Internal application is ready.</h1><p>The browser calls a Pages Function; cloud bindings and AI credentials never enter the client bundle.</p><pre>{JSON.stringify(status ?? { loading: true }, null, 2)}</pre></main>;
}

createRoot(document.getElementById("root")!).render(<App />);
