import servor from "servor";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "client");
export default () =>
  new Promise((r, c) =>
    setTimeout(() => servor({ root, reload: true }).then(r).catch(c), 300)
  );
