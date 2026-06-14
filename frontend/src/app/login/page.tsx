"use client";

import Link from "next/link";
import { useState } from "react";
import { Compass } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("admin@demo.com");
  const [password, setPassword] = useState("password");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Compass className="h-6 w-6 text-primary" /> Compass CRM
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">Close more deals.<br />Lose fewer leads.</h1>
          <p className="mt-4 max-w-md text-sidebar-foreground/70">
            A complete sales CRM — leads, contacts, accounts, a visual deal pipeline, activities, and dashboards in one place.
          </p>
        </div>
        <div className="text-sm text-sidebar-foreground/50">© {new Date().getFullYear()} Compass</div>
      </div>

      <div className="flex w-full flex-col items-center justify-center px-6 lg:w-1/2">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold">Welcome back</h2>
            <p className="text-sm text-muted-foreground">Sign in to your account to continue.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            No account?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Create an organization
            </Link>
          </p>
          <p className="rounded-md bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
            Demo login is pre-filled: <strong>admin@demo.com / password</strong>
          </p>
        </form>
      </div>
    </div>
  );
}
