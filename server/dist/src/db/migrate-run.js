import "dotenv/config";
import { runMigrations } from "./index.js";
runMigrations()
    .then(() => {
    console.log("Migrations completed.");
    process.exit(0);
})
    .catch((err) => {
    console.error("Migrations failed:", err);
    process.exit(1);
});
