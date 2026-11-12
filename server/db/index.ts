import { createGetDb } from "@agent-native/core/db";
import * as schema from "./schema.js";

export const getDb = createGetDb(schema);
export type Database = ReturnType<typeof getDb>;
