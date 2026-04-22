import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Tear down rendered components between tests so DOM state doesn't leak.
afterEach(() => {
  cleanup();
});
