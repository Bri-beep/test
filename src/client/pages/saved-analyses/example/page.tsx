import { ExampleAnalysis } from "@/features/user-state/example-analysis";
import { useAppConfig } from "@/client/app-config";

export default function ExamplePage() {
  const config = useAppConfig();
  if (!config.personalStateEnabled) return <p>Les analyses personnelles ne sont pas activées dans cette application.</p>;
  return <div className="space-y-6"><h1 className="text-3xl font-bold">Exemple d’analyse</h1><ExampleAnalysis /></div>;
}
