import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { APP_CONFIG } from "@/config/app";
import {
  MessageSquare,
  FileText,
  Image,
  Video,
  Mic,
  Zap,
  Shield,
  Users,
  Workflow,
  ArrowRight,
} from "lucide-react";
import { AuthButton } from "./auth-button";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
      {/* Navigation */}
      <nav className="border-b border-slate-700/50 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-50 bg-slate-950/80 backdrop-blur">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold text-white">{APP_CONFIG.name}</span>
        </div>
        <AuthButton />
      </nav>

      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center gap-8 px-4 py-20 text-center">
        <div className="max-w-4xl mx-auto space-y-6">
          <Badge className="bg-blue-500/20 text-blue-300 border border-blue-500/50 px-4 py-1.5">
            Production Ready SaaS Platform
          </Badge>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold text-white leading-tight">
            All-in-One AI Workspace
          </h1>

          <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto">
            Chat with AI, generate content, create images and videos, automate workflows, and manage your entire business. All in one powerful platform.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
            <Button
              asChild
              size="lg"
              className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white border-0"
            >
              <Link href="/auth/signup">
                Get Started Free
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="border-slate-600 text-slate-200 hover:bg-slate-800"
            >
              <Link href="/auth/login">Sign In</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="px-4 sm:px-6 py-20 border-t border-slate-700/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12">
            Powerful Features
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: MessageSquare,
                title: "AI Chat",
                description: "Multi-model AI conversations. Talk to GPT-4, Claude, Gemini, and more.",
              },
              {
                icon: FileText,
                title: "Content Generation",
                description: "Generate blog posts, social media content, and marketing copy instantly.",
              },
              {
                icon: Image,
                title: "Image Generation",
                description: "Create stunning images from text descriptions using advanced AI models.",
              },
              {
                icon: Video,
                title: "Video Creation",
                description: "Generate professional videos and faceless video content automatically.",
              },
              {
                icon: Mic,
                title: "Voice & Audio",
                description: "Text-to-speech, voice cloning, and audio transcription capabilities.",
              },
              {
                icon: Workflow,
                title: "Workflow Automation",
                description: "Build complex automations without code. Connect any service.",
              },
            ].map((feature, idx) => (
              <Card
                key={idx}
                className="bg-slate-800/50 border-slate-700 hover:border-blue-500/50 transition-colors"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center flex-shrink-0">
                      <feature.icon className="h-6 w-6 text-cyan-400" />
                    </div>
                    <CardTitle className="text-white">{feature.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-300 text-sm">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="px-4 sm:px-6 py-20 border-t border-slate-700/50">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: Zap, title: "Lightning Fast", desc: "Powered by Next.js and Supabase for instant performance" },
              { icon: Shield, title: "Enterprise Security", desc: "End-to-end encryption and compliance standards" },
              { icon: Users, title: "Team Collaboration", desc: "Real-time collaboration with workspaces and permissions" },
            ].map((benefit, idx) => (
              <div key={idx} className="text-center">
                <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center mx-auto mb-4">
                  <benefit.icon className="h-6 w-6 text-cyan-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{benefit.title}</h3>
                <p className="text-slate-400 text-sm">{benefit.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 sm:px-6 py-20 border-t border-slate-700/50">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-bold text-white">
            Ready to Transform Your Workflow?
          </h2>
          <p className="text-lg text-slate-300">
            Join thousands of professionals using Supa AI to work smarter, not harder.
          </p>
          <Button
            asChild
            size="lg"
            className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white border-0"
          >
            <Link href="/auth/signup">
              Start for Free
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-700/50 px-4 sm:px-6 py-8 text-center text-sm text-slate-400 bg-slate-950/50">
        <p>Supa AI v{APP_CONFIG.version}. Built for modern teams. All rights reserved.</p>
      </footer>
    </div>
  );
}