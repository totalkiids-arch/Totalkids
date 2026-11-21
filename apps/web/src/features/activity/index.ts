// API pública de la feature "activity". app/ y otras features importan solo desde aquí.
export { ActivityLogScreen } from "./ui/activity-log-screen";
export {
  ACTIVITY_AREA_LABEL,
  ACTIVITY_AREAS,
  buildActivityPage,
  parseActivityQuery,
  toActivitySearch,
  type ActivityArea,
  type ActivityEntry,
} from "./domain/activity";
