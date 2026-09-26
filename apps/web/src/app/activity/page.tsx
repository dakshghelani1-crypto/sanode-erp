import { ActivityWorkspace } from '@/components/activity-workspace';
import { getLedger } from '@/lib/api';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function ActivityPage() {
  try {
    const activity = await getLedger((await cookies()).toString());
    return <ActivityWorkspace activity={activity} />;
  } catch {
    return <main className="page-error"><h1>Activity needs a signed-in session</h1><p>Sign in to view the audit trail.</p><a className="submit-button" href="/login">Open sign in</a></main>;
  }
}
