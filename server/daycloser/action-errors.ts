import { fail } from "@agent-native/core/action";

import { DomainError } from "./errors.js";

export async function domainAction<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof DomainError) {
      fail(error.message, {
        statusCode: error.statusCode,
        errorCode: "DAYCLOSER_REJECTED",
      });
    }
    throw error;
  }
}
