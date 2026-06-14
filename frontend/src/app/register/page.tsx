"use client";

import Link from "next/link";
import { useState } from "react";
import { Compass } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";

export default function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({ org_name: "", name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(form.org_name, form.name, form.email, form.password);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Compass className="h-6 w-6 text-primary" /> Compass CRM
        </div>
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">Create your organization</h2>
          <p className="text-sm text-muted-foreground">You'll be the admin of this workspace.</p>
        </div>
        <div className="space-y-2">
          <Label>Organization name</Label>
          <Input value={form.org_name} onChange={set("org_name")} placeholder="Acme Inc" required />
        </div>
        <div className="space-y-2">
          <Label>Your name</Label>
          <Input value={form.name} onChange={set("name")} placeholder="Jane Doe" required />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input type="email" value={form.email} onChange={set("email")} required />
        </div>
        <div className="space-y-2">
          <Label>Password</Label>
          <Input type="password" value={form.password} onChange={set("password")} minLength={6} required />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Creating…" : "Create organization"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
