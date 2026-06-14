"use client";

import { LogOut, User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { initials } from "@/lib/utils";
import { GlobalSearch } from "./GlobalSearch";

const ROLE_LABEL: Record<string, string> = { admin: "Admin", manager: "Manager", sales_rep: "Sales Rep" };

export function Topbar() {
  const { user, logout } = useAuth();
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4">
      <div className="flex-1">
        <GlobalSearch />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-full focus:outline-none">
          <Avatar>
            <AvatarFallback>{initials(user?.name)}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="font-medium">{user?.name}</div>
            <div className="text-xs font-normal text-muted-foreground">{user?.email}</div>
            <Badge variant="secondary" className="mt-1.5">
              {ROLE_LABEL[user?.role ?? ""] ?? user?.role}
            </Badge>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={logout} className="text-destructive">
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
