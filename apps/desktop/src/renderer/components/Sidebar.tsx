import {
    ChevronRight,
    Folder,
    Globe,
    Menu,
    Plus,
    Terminal,
} from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";

interface Tab {
    id: string;
    title: string;
    icon?: string;
    url?: string;
    type: "terminal" | "browser" | "folder";
}

interface TabGroup {
    id: string;
    name: string;
    tabs: Tab[];
    isCollapsed?: boolean;
}

interface SidebarProps {
    onTabSelect: (tabId: string) => void;
    activeTabId?: string;
    onCollapse: () => void;
}

export function Sidebar({
    onTabSelect,
    activeTabId,
    onCollapse,
}: SidebarProps) {
    // Stub tab groups data
    const [tabGroups, setTabGroups] = useState<TabGroup[]>([
        {
            id: "group-1",
            name: "Development",
            isCollapsed: false,
            tabs: [
                { id: "1", title: "Terminal", type: "terminal" },
                {
                    id: "2",
                    title: "localhost:3000",
                    type: "browser",
                    url: "http://localhost:3000",
                },
                {
                    id: "3",
                    title: "API Docs",
                    type: "browser",
                    url: "http://localhost:4000/docs",
                },
            ],
        },
        {
            id: "group-2",
            name: "Research",
            isCollapsed: false,
            tabs: [
                {
                    id: "4",
                    title: "GitHub",
                    type: "browser",
                    url: "https://github.com",
                },
                {
                    id: "5",
                    title: "Stack Overflow",
                    type: "browser",
                    url: "https://stackoverflow.com",
                },
            ],
        },
        {
            id: "group-3",
            name: "Project Files",
            isCollapsed: true,
            tabs: [
                { id: "6", title: "/src", type: "folder" },
                { id: "7", title: "/docs", type: "folder" },
            ],
        },
    ]);

    const toggleGroupCollapse = (groupId: string) => {
        setTabGroups((groups) =>
            groups.map((group) =>
                group.id === groupId
                    ? { ...group, isCollapsed: !group.isCollapsed }
                    : group,
            ),
        );
    };

    const getTabIcon = (type: Tab["type"]) => {
        const iconProps = { size: 14 };
        switch (type) {
            case "terminal":
                return <Terminal {...iconProps} />;
            case "browser":
                return <Globe {...iconProps} />;
            case "folder":
                return <Folder {...iconProps} />;
            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col h-full w-64 select-none bg-neutral-900 text-neutral-300 border-r border-neutral-800">
            {/* Top Section - Matches window controls height */}
            <div
                className="flex items-center border-b border-neutral-800"
                style={
                    {
                        height: "48px",
                        paddingLeft: "88px",
                        WebkitAppRegion: "drag",
                    } as React.CSSProperties
                }
            >
                <div style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
                    <Button variant="ghost" size="icon-sm" onClick={onCollapse}>
                        <Menu size={16} />
                    </Button>
                </div>
            </div>

            {/* Tabs Section */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
                {/* New Tab Button */}
                <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-8 px-3 font-normal"
                    style={{ justifyContent: "flex-start" }}
                >
                    <Plus size={16} />
                    <span>New Tab</span>
                </Button>

                {/* Tab Groups */}
                {tabGroups.map((group) => (
                    <div key={group.id} className="space-y-1">
                        {/* Group Header */}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleGroupCollapse(group.id)}
                            className="w-full h-8 px-3 pb-1 font-normal"
                            style={{ justifyContent: "flex-start" }}
                        >
                            <ChevronRight
                                size={12}
                                className={`transition-transform ${group.isCollapsed ? "" : "rotate-90"}`}
                            />
                            <span className="truncate font-medium">{group.name}</span>
                            <span className="ml-auto text-neutral-500 text-xs">
                                {group.tabs.length}
                            </span>
                        </Button>

                        {/* Group Tabs */}
                        {!group.isCollapsed && (
                            <div className="space-y-1 pl-3">
                                {group.tabs.map((tab) => (
                                    <Button
                                        key={tab.id}
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => onTabSelect(tab.id)}
                                        className={`w-full h-8 px-3 font-normal ${activeTabId === tab.id
                                                ? "bg-neutral-800 border border-neutral-700"
                                                : ""
                                            }`}
                                        style={{ justifyContent: "flex-start" }}
                                    >
                                        {getTabIcon(tab.type)}
                                        <span className="truncate">{tab.title}</span>
                                    </Button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
