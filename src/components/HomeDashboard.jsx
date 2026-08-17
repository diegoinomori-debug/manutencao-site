import React, { useRef } from "react";
import {
  Home,
  Sparkles,
  CalendarDays,
  FileText,
  Wrench,
  HardHat,
  Package,
  BarChart3,
  Database,
  FileSpreadsheet,
  Globe2,
  UserRound,
  ChevronLeft,
  ChevronRight,
  Search,
  LogOut,
} from "lucide-react";

import "./HomeDashboard.css";

export default function HomeDashboard({
  user,
  language = "JP",
  onLanguageChange,
  onLogout,
  onNavigate,
}) {
  const menuRef = useRef(null);

  const scrollMenu = (direction) => {
    if (!menuRef.current) return;

    menuRef.current.scrollBy({
      left: direction === "left" ? -450 : 450,
      behavior: "smooth",
    });
  };

  const menuItems = [
    { key: "home", label: "ホーム", icon: Home },
    { key: "ai", label: "MIYAMA AI", icon: Sparkles },
    { key: "calendar", label: "カレンダー", icon: CalendarDays },
    { key: "reports", label: "修理報告", icon: FileText },
    { key: "maintenance", label: "定期保全", icon: Wrench },
    { key: "construction", label: "工事管理", icon: HardHat },
    { key: "parts", label: "予備品管理", icon: Package },
    { key: "analysis", label: "保全分析", icon: BarChart3 },
    { key: "production", label: "生産数DB", icon: Database },
    { key: "csv", label: "CSV分析", icon: FileSpreadsheet },
  ];

  const quickMenus = [
    { key: "reports", title: "修理報告", description: "故障・修理の記録", icon: FileText },
    { key: "maintenance", title: "定期保全", description: "保全計画・実績の管理", icon: Wrench },
    { key: "construction", title: "工事管理", description: "工事の計画・進捗管理", icon: HardHat },
    { key: "parts", title: "予備品管理", description: "在庫・発注の管理", icon: Package },
    { key: "analysis", title: "保全分析", description: "停止・故障データ分析", icon: BarChart3 },
    { key: "production", title: "生産数DB", description: "生産データの管理", icon: Database },
  ];

  const go = (page) => {
    if (onNavigate) onNavigate(page);
  };

  return (
    <div className="maintenance-page">
      <header className="top-navigation">
        <button className="scroll-arrow" onClick={() => scrollMenu("left")} aria-label="menu anterior">
          <ChevronLeft size={24} />
        </button>

        <div className="fixed-header-area">
          <div className="language-box">
            <Globe2 size={19} />
            <select value={language} onChange={(e) => onLanguageChange?.(e.target.value)}>
              <option value="JP">JP 日本語</option>
              <option value="EN">EN English</option>
              <option value="PT">PT Português</option>
            </select>
          </div>

          <div className="user-box">
            <div className="user-icon"><UserRound size={20} /></div>
            <div className="user-info">
              <strong>{user?.name || "Inomori Diego"}</strong>
              <span>{user?.role || "Admin"}</span>
            </div>
            <button className="logout-button" onClick={onLogout} title="Logout">
              <LogOut size={17} />
            </button>
          </div>
        </div>

        <div className="menu-scroll-wrapper" ref={menuRef}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                className={`nav-item ${item.key === "home" ? "active" : ""}`}
                onClick={() => go(item.key)}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <button className="scroll-arrow" onClick={() => scrollMenu("right")} aria-label="próximo menu">
          <ChevronRight size={24} />
        </button>
      </header>

      <section className="hero">
        <div className="hero-left">
          <h1>MIYAMA Maintenance</h1>
          <h2>One Team Maintenance Group</h2>
          <p>設備保全を、もっとスマートに。</p>
        </div>

        <div className="hero-right">
          <div className="search-box">
            <Search size={23} />
            <input type="text" placeholder="設備・部品・トラブル内容を検索してください" />
          </div>

          <div className="hero-buttons">
            <button className="hero-button" onClick={() => go("ai")}>
              <Sparkles size={19} /> MIYAMA AIへ
            </button>
            <button className="hero-button secondary" onClick={() => go("analysis")}>
              <BarChart3 size={19} /> ダッシュボードへ
            </button>
          </div>
        </div>
      </section>

      <section className="quick-grid">
        {quickMenus.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.key} className="quick-card" onClick={() => go(item.key)}>
              <div className={`quick-icon ${item.key}`}><Icon size={28} /></div>
              <div className="quick-card-text">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
              <ChevronRight size={19} className="card-chevron" />
            </button>
          );
        })}
      </section>

      <section className="bottom-grid">
        <div className="panel">
          <div className="panel-header">
            <h3>お知らせ</h3>
            <button>すべて見る <ChevronRight size={16} /></button>
          </div>

          <div className="notice-row">
            <span className="notice-date">2026/08/17</span>
            <span className="badge system">システム</span>
            <span>MIYAMA Maintenance テスト運用中</span>
          </div>

          <div className="notice-row">
            <span className="notice-date">2026/08/15</span>
            <span className="badge maintenance">保全</span>
            <span>定期保全情報を更新しました</span>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h3>最近の修理報告</h3>
            <button onClick={() => go("reports")}>すべて見る <ChevronRight size={16} /></button>
          </div>

          <div className="report-table">
            <div className="report-header">
              <span>日付</span><span>設備名</span><span>内容</span><span>状態</span>
            </div>
            <div className="report-row">
              <span>2026/08/17</span><span>設備 01</span><span>修理報告</span>
              <span><span className="status completed">完了</span></span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
