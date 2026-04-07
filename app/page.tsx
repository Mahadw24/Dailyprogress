import { getProgressStorageInfo } from "@/lib/progress-storage-meta";
import ProgressApp from "./components/ProgressApp";

export default function Home() {
  return <ProgressApp storage={getProgressStorageInfo()} />;
}
