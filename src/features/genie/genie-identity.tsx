import { useEffect, useState } from "react";
import { genieSessionSchema } from "./contract";

export function GenieIdentity({ alias }: { alias: string }) {
  const [label, setLabel] = useState("Vérification de l’identité…");
  useEffect(() => {
    const controller = new AbortController();
    setLabel("Vérification de l’identité…");
    void fetch(`/api/genie/${encodeURIComponent(alias)}/session`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Identity unavailable");
        const session = genieSessionSchema.parse(await response.json());
        if (!controller.signal.aborted) setLabel(session.label);
      }).catch(() => { if (!controller.signal.aborted) setLabel("Identité non confirmée · accès vérifié à chaque envoi"); });
    return () => controller.abort();
  }, [alias]);
  return <p className="mt-1 break-words text-xs text-muted" role="status">{label}</p>;
}
