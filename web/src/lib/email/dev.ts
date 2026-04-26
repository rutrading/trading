import type { CreateEmailOptions } from "resend";

type MockableEmailOptions = CreateEmailOptions & {
  _mockContext?: {
    type: "reset" | "verification" | "welcome" | "change-email" | "verify";
    data: Record<string, unknown>;
  };
};

export async function sendDevEmail(options: MockableEmailOptions) {
  console.log("--- MOCK EMAIL (DEVELOPMENT) ---");
  console.log("From:", options.from);
  console.log("To:", options.to);
  console.log("Subject:", options.subject);

  if (options._mockContext) {
    const { type, data } = options._mockContext;
    console.log("Type:", type.toUpperCase());
    for (const [key, value] of Object.entries(data)) {
      console.log(`  ${key}:`, value);
    }
  }

  console.log("--------------------------------");

  return { data: { id: "mock-email-id" }, error: null };
}
