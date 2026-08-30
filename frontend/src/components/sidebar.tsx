"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Briefcase, FileText, BrainCircuit, Settings, Sparkles, ChevronDown, Search, Bug } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();
  const isDemo = pathname.startsWith("/demo");
  const demoHref = (path = "") => isDemo ? `/demo${path}` : undefined;
  
  // If we are inside a specific workspace (e.g. /workspace/1), do not show the global sidebar
  if (pathname.match(/^\/workspace\/\d+/)) {
    return null;
  }
  
  const isWorkspace = pathname.startsWith("/workspace");
  const isHome = pathname === "/" || isWorkspace;

  return (
    <aside className="w-[240px] bg-white border-r border-border flex flex-col shrink-0">
      {/* Logo Area */}
      <div className="h-20 flex flex-col justify-center px-6">
        <span className="font-bold text-lg tracking-tight text-foreground flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          OfferFlow
        </span>
        <span className="text-[10px] font-medium text-muted-foreground mt-0.5 ml-7">AI 求职智能体</span>
      </div>
      
      <nav className="flex-1 py-4 px-3 space-y-1">
        <Link href={demoHref("/jobs") || "/"} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${(pathname === '/' || pathname === '/demo') ? 'bg-indigo-50 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}>
          <Home className="w-[18px] h-[18px]" />
          <span className="text-sm font-medium">首页</span>
        </Link>
        <Link href={demoHref() || "/leads"} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
          <Search className="w-[18px] h-[18px]" />
          <span className="text-sm font-medium">海投线索</span>
        </Link>
        <Link href={demoHref("/jobs") || "/jobs"} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${(pathname === '/demo/jobs' || pathname.startsWith('/jobs')) ? 'bg-indigo-50 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}>
          <Briefcase className="w-[18px] h-[18px]" />
          <span className="text-sm font-medium">岗位管理</span>
        </Link>
        <Link href={demoHref() || "#"} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
          <FileText className="w-[18px] h-[18px]" />
          <span className="text-sm font-medium">面试中心</span>
        </Link>
        <Link href={demoHref() || "/memory"} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
          <BrainCircuit className="w-[18px] h-[18px]" />
          <span className="text-sm font-medium">记忆库</span>
        </Link>
        <Link href={demoHref() || "/badcases"} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
          <Bug className="w-[18px] h-[18px]" />
          <span className="text-sm font-medium">问题复盘</span>
        </Link>
        <div className="pt-4 mt-4 border-t border-border">
          <Link href={demoHref("/settings") || "/settings"} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${(pathname === '/demo/settings' || pathname.startsWith('/settings')) ? 'bg-indigo-50 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}>
            <Settings className="w-[18px] h-[18px]" />
            <span className="text-sm font-medium">设置</span>
          </Link>
        </div>
      </nav>
      
      {/* User Profile */}
      <div className="p-4 border-t border-border hover:bg-secondary/30 cursor-pointer transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-200">
               <img src="https://api.dicebear.com/7.x/notionists/svg?seed=Felix&backgroundColor=f4f4f5" alt="User Avatar" className="w-full h-full object-cover" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold">张三</span>
              <span className="text-[10px] text-orange-500 font-semibold mt-0.5">Premium Plan 👑</span>
            </div>
          </div>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
    </aside>
  );
}
