import { getSession } from "@/app/actions/auth";
import { ProfileForm } from "./profile-form";

export async function ProfileSection() {
  const session = await getSession();
  if (!session) return null;

  return (
    <div className="space-y-4 rounded-xl border border-border p-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Profile</h2>
        <p className="text-sm text-muted-foreground">
          Update your personal information.
        </p>
      </div>
      <ProfileForm name={session.user.name} email={session.user.email} />
    </div>
  );
}
