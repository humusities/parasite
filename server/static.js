import serve from "./utils/serve.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "client");
export default () =>
  new Promise((r) => setTimeout(() => r(serve({ root })), 300));
