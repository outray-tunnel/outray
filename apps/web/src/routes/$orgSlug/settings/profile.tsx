import { createFileRoute } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { User, Mail } from "lucide-react";
import { Card, CardHeader, CardContent, Input, Label } from "@/components/ui";

export const Route = createFileRoute("/$orgSlug/settings/profile")({
  head: () => ({
    meta: [
      { title: "Profile Settings - OutRay" },
    ],
  }),
  component: ProfileSettingsView,
});

function ProfileSettingsView() {
  const { data: session } = authClient.useSession();
  const user = session?.user;

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      <Card padding={false}>
        <CardHeader
          icon={<User className="w-5 h-5" />}
          iconClassName="bg-blue-500/10 text-blue-400"
          title="Profile"
          description="Your personal information"
        />
        <CardContent className="space-y-6">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-blue-500/20">
              {user.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <h4 className="text-white font-medium text-lg">{user.name}</h4>
              <p className="text-gray-500">{user.email}</p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <Label>Full Name</Label>
              <Input
                type="text"
                value={user.name || ""}
                readOnly
                disabled
                leftIcon={<User className="w-4 h-4" />}
              />
            </div>
            <div>
              <Label>Email Address</Label>
              <Input
                type="email"
                value={user.email || ""}
                readOnly
                disabled
                leftIcon={<Mail className="w-4 h-4" />}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
