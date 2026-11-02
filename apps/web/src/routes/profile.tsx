import { useRequiredSession, useSession } from "@/features/session";
import { useUpdateMe, useMyActivity, useNotificationPreferences, useNotificationActions } from "@/features/hooks";
import { useAppearance } from "@/features/appearance";
import { Button } from "@/components/ui/button";
import { NumberField, Switch, TextField } from "@/components/ui/field";
import { EmptyState, Figure, LoadingState, PageHeader } from "@/components/ui/surface";
import { formatDateTime, initials } from "@/lib/format";

/**
 * Profile: who you are here, how the app behaves for you, and what you have been
 * doing. Role and department are shown but not editable, because permissions are an
 * admin's decision, not a self-service one.
 */
export default function ProfilePage() {
  const { person, departments } = useRequiredSession();
  const { refresh } = useSession();
  const updateMe = useUpdateMe();
  const { data: activity } = useMyActivity(15);
  const { data: preferences } = useNotificationPreferences();
  const { updatePreferences } = useNotificationActions();
  const { theme, setTheme, density, setDensity } = useAppearance();

  const department = departments.find((entry) => entry.id === person.departmentId);

  return (
    <>
      <PageHeader title="Your profile" description="How you appear to colleagues, and how this app behaves for you." />

      <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-2">
        <section aria-label="Your details" className="rounded-panel border border-rule bg-surface">
          <div className="flex items-center gap-3 border-b border-rule px-3 py-3">
            <span
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-full bg-accent-ink text-sm font-semibold text-on-accent"
            >
              {initials(person.name ?? person.email)}
            </span>
            <div className="min-w-0">
              <p className="text-compact font-semibold text-ink">{person.name ?? "Unnamed"}</p>
              <p className="text-meta text-ink-muted">{person.email}</p>
            </div>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void updateMe.mutateAsync({
                name: (document.getElementById("profile-name") as HTMLInputElement)?.value ?? undefined,
                jobTitle: (document.getElementById("profile-title") as HTMLInputElement)?.value || null,
                weeklyHours: Number.parseInt(
                  (document.getElementById("profile-hours") as HTMLInputElement)?.value ?? "40",
                  10,
                ),
              }).then(() => refresh());
            }}
            className="flex flex-col gap-3 px-3 py-3"
            noValidate
          >
            <TextField label="Full name" id="profile-name" defaultValue={person.name ?? ""} required />
            <TextField
              label="Job title"
              id="profile-title"
              defaultValue={person.jobTitle ?? ""}
              hint="Shown next to your name in pickers."
            />
            <NumberField
              label="Weekly hours"
              id="profile-hours"
              defaultValue={person.weeklyHours}
              min={1}
              max={80}
              suffix="hours"
              hint="Used to compute your capacity in the resources view."
            />

            <div className="rounded-control border border-rule bg-sunk px-2.5 py-2 text-meta text-ink-muted">
              Role: {person.role}. Department: {department?.name ?? "none"}. Both are set by an admin.
            </div>

            <div>
              <Button type="submit" variant="primary" disabled={updateMe.isPending}>
                {updateMe.isPending ? "Saving" : "Save profile"}
              </Button>
            </div>
          </form>
        </section>

        <div className="flex flex-col gap-6">
          <section aria-label="Appearance" className="rounded-panel border border-rule bg-surface">
            <div className="border-b border-rule px-3 py-2.5">
              <h2 className="text-section font-semibold text-ink">Appearance</h2>
              <p className="text-meta text-ink-muted">Applies to this browser, immediately.</p>
            </div>
            <div className="px-3 py-2">
              <div className="py-2">
                <div className="text-compact text-ink">Theme</div>
                <div className="mt-1.5 flex gap-1" role="group" aria-label="Theme">
                  {(["light", "dark", "system"] as const).map((value) => (
                    <Button
                      key={value}
                      size="sm"
                      variant={theme === value ? "primary" : "secondary"}
                      onClick={() => setTheme(value)}
                    >
                      {value === "system" ? "Follow system" : value === "light" ? "Light" : "Dark"}
                    </Button>
                  ))}
                </div>
              </div>
              <Switch
                label="Compact rows"
                hint="Tighter tables and boards. Useful on smaller screens."
                checked={density === "compact"}
                onChange={(next) => setDensity(next ? "compact" : "comfortable")}
              />
            </div>
          </section>

          {preferences && (
            <section aria-label="Notifications" className="rounded-panel border border-rule bg-surface">
              <div className="border-b border-rule px-3 py-2.5">
                <h2 className="text-section font-semibold text-ink">Email notifications</h2>
                <p className="text-meta text-ink-muted">
                  In-app notifications always arrive; these control what also lands in your inbox.
                </p>
              </div>
              <div className="px-3 py-1">
                <Switch
                  label="Email me"
                  hint="The master switch for every email below."
                  checked={preferences.emailEnabled}
                  onChange={(next) => void updatePreferences.mutateAsync({ emailEnabled: next })}
                />
                {preferences.emailEnabled && (
                  <>
                    <Switch
                      label="Assignments"
                      hint="When a task is assigned to you."
                      checked={preferences.assignmentEmail}
                      onChange={(next) => void updatePreferences.mutateAsync({ assignmentEmail: next })}
                    />
                    <Switch
                      label="Reviews"
                      hint="When work is submitted for you to review, and when your submissions are decided."
                      checked={preferences.reviewEmail}
                      onChange={(next) => void updatePreferences.mutateAsync({ reviewEmail: next })}
                    />
                    <Switch
                      label="Schedule changes"
                      hint="When a schedule change is proposed or approved on your projects."
                      checked={preferences.scheduleEmail}
                      onChange={(next) => void updatePreferences.mutateAsync({ scheduleEmail: next })}
                    />
                  </>
                )}
              </div>
            </section>
          )}

          <section aria-label="Your recent activity" className="rounded-panel border border-rule bg-surface">
            <div className="border-b border-rule px-3 py-2.5">
              <h2 className="text-section font-semibold text-ink">Recent activity</h2>
              <p className="text-meta text-ink-muted">Your last recorded changes, newest first.</p>
            </div>
            {activity === undefined ? (
              <LoadingState label="Loading activity" />
            ) : activity.length === 0 ? (
              <EmptyState
                compact
                title="No activity recorded yet"
                description="Changes you make to projects and tasks appear here."
              />
            ) : (
              <Figure
                value={activity.length}
                label={`events in the last ${activity.length}, most recent ${formatDateTime(activity[0]?.createdAt)}`}
              />
            )}
            {activity && activity.length > 0 && (
              <ol className="divide-y divide-rule px-3 py-1">
                {activity.slice(0, 10).map((event) => (
                  <li key={event.id} className="flex items-baseline justify-between gap-3 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-compact text-ink">{event.summary}</span>
                    <time dateTime={event.createdAt} className="shrink-0 text-meta text-faint">
                      {formatDateTime(event.createdAt)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
