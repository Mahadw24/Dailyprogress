import ProgressApp from "./components/ProgressApp";
import { getProgressStorageInfo } from "@/lib/progress-store";

export default function Home() {
  return <ProgressApp storage={getProgressStorageInfo()} />;
}
