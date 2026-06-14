"use client";

import Link from "next/link";
import { useState } from "react";
import { Compass, Heart } from "lucide-react";
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
      <div
        className="relative hidden w-1/2 flex-col justify-between p-12 text-sidebar-foreground lg:flex"
        style={{
          backgroundImage:
            "radial-gradient(120% 80% at 0% 0%, hsl(245 75% 60% / 0.30), transparent 50%), radial-gradient(100% 80% at 100% 100%, hsl(280 70% 60% / 0.25), transparent 55%), linear-gradient(180deg, hsl(var(--sidebar)), hsl(224 47% 7%))",
        }}
      >
        <div className="flex items-center gap-2.5 text-lg font-bold">
          <div className="ai-gradient flex h-8 w-8 items-center justify-center rounded-lg">
            <Compass className="h-5 w-5 text-white" />
          </div>
          Compass <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider">AI</span>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight">
            Your AI marketer,<br />sitting right beside you.
          </h1>
          <p className="mt-4 max-w-md text-sidebar-foreground/70">
            A complete CRM with an AI growth copilot. Manage everything by hand — or describe a goal and
            let AI build the audience, campaign and messages, then launch with one click.
          </p>
        </div>
        <div className="flex items-center gap-1 text-sm text-sidebar-foreground/50">
          Made with <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" /> by
          <span className="font-semibold text-sidebar-foreground/70">Dhruv Jyoti Das</span>
        </div>
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
