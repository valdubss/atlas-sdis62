import type { Metadata } from "next";
import { fetchNotifications, fetchUnreadCount } from "@/lib/notifications/queries";
import { NotificationsList } from "@/components/notifications/NotificationsList";
import { BackBar } from "@/components/layout/BackBar";
import { LargeTitle } from "@/components/layout/TopBar";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const [items, unread] = await Promise.all([fetchNotifications(), fetchUnreadCount()]);
  return (
    <div className="space-y-3">
      <BackBar title="Notifications" />
      <LargeTitle>Notifications</LargeTitle>
      <NotificationsList items={items} unread={unread} />
    </div>
  );
}
