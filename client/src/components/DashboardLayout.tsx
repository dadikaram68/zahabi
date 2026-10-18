import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import * as React from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Boxes, LogOut, Warehouse } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { InternalLoginForm } from "./InternalLoginForm";

export type DashboardNavigationItem = {
  key: string;
  label: React.ReactNode;
  icon: LucideIcon;
};

type DashboardLayoutProps = {
  children: React.ReactNode;
  navigation: DashboardNavigationItem[];
  activeKey: string;
  onNavigate: (key: string) => void;
  brandTitle: string;
  brandSubtitle: string;
  brandLogoUrl?: string | null;
  labels: {
    signIn: string;
    protectedInfo: string;
    user: string;
    admin: string;
    logout: string;
  };
  direction?: "rtl" | "ltr";
};

export default function DashboardLayout({
  children,
  navigation,
  activeKey,
  onNavigate,
  brandTitle,
  brandSubtitle,
  brandLogoUrl,
  labels,
  direction = "rtl",
}: DashboardLayoutProps) {
  const { loading, user, logout } = useAuth();
  const [logoutOpen, setLogoutOpen] = React.useState(false);
  const requestLogout = () => setLogoutOpen(true);
  const confirmLogout = () => {
    setLogoutOpen(false);
    void logout();
  };

  if (loading) return <DashboardLayoutSkeleton />;

  if (!user) {
    return (
      <div
        className="grid min-h-screen place-items-center bg-background p-6"
        dir={direction}
      >
        <div className="ops-card w-full max-w-md rounded-[2rem] p-9 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-[#0f2d52] text-white shadow-lg shadow-blue-900/20">
            {brandLogoUrl ? (
              <img
                src={brandLogoUrl}
                alt=""
                className="h-full w-full object-contain bg-white p-1"
              />
            ) : (
              <Warehouse className="h-7 w-7" />
            )}
          </div>
          <p className="mt-6 ops-kicker">{brandTitle}</p>
          <h1 className="mt-2 text-2xl font-black">{labels.signIn}</h1>
          <p className="mt-3 text-base leading-7 text-muted-foreground">
            {labels.protectedInfo}
          </p>
          <div className="mt-7">
            <InternalLoginForm onOwnerLogin={() => startLogin()} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      className={direction === "rtl" ? "flex-row-reverse" : undefined}
    >
      <Sidebar
        side={direction === "rtl" ? "right" : "left"}
        collapsible="icon"
        className="border-0 bg-sidebar text-sidebar-foreground shadow-2xl shadow-slate-950/15"
        dir={direction}
      >
        <SidebarHeader className="h-auto border-b border-sidebar-border p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#ffffff,#d9ecff)] text-[#0c3159] shadow-lg shadow-slate-950/20">
              {brandLogoUrl ? (
                <img
                  src={brandLogoUrl}
                  alt=""
                  className="h-full w-full object-contain bg-white p-1"
                />
              ) : (
                <Boxes className="h-6 w-6" />
              )}
            </div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-xl font-black tracking-tight text-sidebar-foreground">
                {brandTitle}
              </p>
              <p className="mt-0.5 truncate text-xs font-bold text-sidebar-foreground/70">
                {brandSubtitle}
              </p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="p-3">
          <p className="px-3 pb-3 pt-1 text-[10px] font-black uppercase tracking-[0.14em] text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
            مركز العمليات
          </p>
          <SidebarMenu className="gap-1.5">
            {navigation.map(item => {
              const Icon = item.icon;
              return (
                <SidebarMenuItem key={item.key}>
                  <SidebarMenuButton
                    isActive={activeKey === item.key}
                    onClick={() => onNavigate(item.key)}
                    tooltip={typeof item.label === "string" ? item.label : undefined}
                    className="h-12 rounded-xl px-3 text-[0.95rem] text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-primary data-[active=true]:font-black data-[active=true]:text-sidebar-primary-foreground data-[active=true]:shadow-md"
                  >
                    <Icon className="h-5 w-5" />
                    <span className="font-bold">{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-xl p-2 text-start text-sidebar-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
                <Avatar className="h-9 w-9 shrink-0 border border-sidebar-border">
                  <AvatarFallback className="bg-sidebar-accent text-xs text-sidebar-accent-foreground">
                    {user.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                  <p className="truncate text-sm font-bold">
                    {user.name || labels.user}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-sidebar-foreground/70">
                    {user.role === "admin" ? labels.admin : labels.user}
                  </p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align={direction === "rtl" ? "start" : "end"}
              className="w-48"
            >
              <DropdownMenuItem
                onClick={requestLogout}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                <span>{labels.logout}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-transparent dark:bg-[#10131b]">
        <header
          className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-border/70 bg-background/95 px-4 py-3 shadow-sm backdrop-blur sm:px-6 lg:px-8"
          dir={direction}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-foreground sm:text-base">
              {user.name || labels.user}
            </p>
            <p className="mt-0.5 truncate text-xs font-bold text-muted-foreground">
              {user.role === "admin" ? labels.admin : labels.user}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={requestLogout}
            className="shrink-0 gap-2 rounded-xl border-destructive/30 bg-background px-3 text-destructive hover:bg-destructive/10 hover:text-destructive sm:px-4"
            aria-label={labels.logout}
          >
            <LogOut className="h-4 w-4" />
            <span>{labels.logout}</span>
          </Button>
        </header>
        <main className="min-h-screen">{children}</main>
        <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
          <AlertDialogContent dir={direction}>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {direction === "rtl" ? "تأكيد تسجيل الخروج" : "Confirm sign out"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {direction === "rtl"
                  ? "هل أنت متأكد من أنك تريد تسجيل الخروج من هذا الحساب؟"
                  : "Are you sure you want to sign out of this account?"}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {direction === "rtl" ? "إلغاء" : "Cancel"}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmLogout}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {labels.logout}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
