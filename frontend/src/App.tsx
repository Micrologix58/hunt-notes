import { useState } from "react";
import { TabBar, type AppTab } from "./TabBar";
import { HomeTab } from "./HomeTab";
import { MyHuntTab } from "./MyHuntTab";

function App() {
    const [activeTab, setActiveTab] = useState<AppTab>("home");

    return (
        <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#0d0d0d", fontFamily: "Arial, sans-serif" }}>
            <div style={{ padding: "14px 16px 0", background: "#0d0d0d" }}>
                <h1 style={{ color: "#e2e8f0", margin: "0 0 10px", fontSize: 20 }}>🏔️ Hunt Notes</h1>
            </div>
            <TabBar activeTab={activeTab} onChange={setActiveTab} />
            <div style={{ flex: 1, overflow: "auto" }}>
                {activeTab === "home" && <HomeTab />}
                {activeTab === "myhunt" && <MyHuntTab />}
            </div>
        </div>
    );
}

export default App;
