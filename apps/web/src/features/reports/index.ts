// API pública de la feature "reports". app/ y otras features importan solo desde aquí.
export { ReportsScreen } from "./ui/reports-screen";
export {
  buildSalesReport,
  chileDay,
  parseReportPeriod,
  REPORT_CSV_HEADER,
  reportCsvRows,
  type SaleRecord,
  type SalesReport,
} from "./domain/sales-report";
