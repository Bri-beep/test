import { PersonalLibrary } from "@/features/user-state/personal-library";
import { useAppConfig } from "@/client/app-config";

export default function SavedAnalysesPage() {
  const config = useAppConfig();
  if (!config.personalStateEnabled) return <p>Les analyses personnelles ne sont pas activées dans cette application.</p>;
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Mes analyses</h1>
        <p className="text-muted">Retrouvez vos filtres, vos notes et vos réglages personnels.</p>
        {config.personalStateDemo
          && <p className="text-sm text-muted">Démo locale : vos enregistrements disparaissent au redémarrage du serveur.</p>}
        <a className="inline-block underline" href="/saved-analyses/example">Ouvrir l’exemple d’analyse</a>
      </header>
      <PersonalLibrary />
    </div>
  );
}
