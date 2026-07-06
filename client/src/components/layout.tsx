import { LogOut, Sparkles, Vault as VaultIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

export function Layout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const onSimulator = location.pathname === "/simulator";

  return (
    <div className="min-h-svh">
      <header className="border-b border-border">
        <div className={cn("mx-auto flex items-center justify-between px-6 py-4", wide ? "max-w-6xl" : "max-w-4xl")}>
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <VaultIcon className="size-5 text-primary" />
            SquadVault
          </Link>
          <div className="flex items-center gap-3">
            {!onSimulator && (
              <Link to="/simulator" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                <Sparkles className="size-3.5" />
                Logic Simulator
              </Link>
            )}
            {user && (
              <>
                <span className="text-sm text-muted-foreground">{user.name}</span>
                <Button variant="outline" size="sm" onClick={() => logout()}>
                  <LogOut className="size-4" />
                  Log out
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className={cn("mx-auto px-6 py-10", wide ? "max-w-6xl" : "max-w-4xl")}>{children}</main>
    </div>
  );
}
