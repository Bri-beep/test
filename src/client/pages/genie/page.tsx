import { GenieDemo } from "@/client/pages/genie/genie-demo";
import { useAppConfig } from "@/client/app-config";

export default function GeniePage() {
  const config = useAppConfig();
  return <GenieDemo alias="fraim-sales" mode={config.mode} />;
}
